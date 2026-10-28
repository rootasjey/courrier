import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { INBOUND_EMAIL_EVENT_RETENTION_DAYS } from '../../utils/inbound-email-events'
import { auditPlatformAdminRead } from '../../utils/platform-admin-audit'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  await auditPlatformAdminRead(db, actor, 'overview')
  const inboundEventCutoff = new Date(
    Date.now() - INBOUND_EMAIL_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [counts, workspaces, domains, memberships, invitations, audit, blockedSenders, blockedSenderCount, inboundEmailEvents] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM workspaces) AS workspace_count,
        (SELECT COUNT(*) FROM workspace_domains) AS domain_count,
        (SELECT COUNT(*) FROM workspace_memberships) AS membership_count,
        (SELECT COUNT(*) FROM workspace_invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')) AS pending_invitation_count
    `).first<{
      workspace_count: number, domain_count: number, membership_count: number, pending_invitation_count: number,
    }>(),
    db.prepare(`
      SELECT w.id, w.name, w.status, w.created_at,
        (SELECT COUNT(*) FROM workspace_domains d WHERE d.workspace_id = w.id) AS domain_count,
        (SELECT COUNT(*) FROM mailboxes m WHERE m.workspace_id = w.id AND m.status = 'active') AS mailbox_count,
        (SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.workspace_id = w.id AND wm.status = 'active') AS member_count
      FROM workspaces w
      ORDER BY w.created_at DESC, w.id
      LIMIT 100
    `).all<{
      id: string, name: string, status: string, created_at: string,
      domain_count: number, mailbox_count: number, member_count: number,
    }>(),
    db.prepare(`
      SELECT d.id, d.workspace_id, w.name AS workspace_name, d.domain,
        d.verification_status, d.verified_at, d.created_at,
        (SELECT COUNT(*) FROM mailboxes m WHERE m.domain_id = d.id AND m.status = 'active') AS mailbox_count
      FROM workspace_domains d
      JOIN workspaces w ON w.id = d.workspace_id
      ORDER BY d.created_at DESC, d.domain COLLATE NOCASE
      LIMIT 200
    `).all<{
      id: string, workspace_id: string, workspace_name: string, domain: string,
      verification_status: string, verified_at: string | null, created_at: string, mailbox_count: number,
    }>(),
    db.prepare(`
      SELECT wm.id, wm.workspace_id, w.name AS workspace_name, wm.user_id,
        u.email, u.display_name, u.status AS user_status, wm.role, wm.status AS membership_status,
        wm.created_at,
        CASE WHEN wm.role = 'owner' AND NOT EXISTS (
          SELECT 1
          FROM workspace_memberships other_owner
          JOIN users other_owner_user ON other_owner_user.id = other_owner.user_id AND other_owner_user.status = 'active'
          WHERE other_owner.workspace_id = wm.workspace_id
            AND other_owner.role = 'owner'
            AND other_owner.status = 'active'
            AND other_owner.id <> wm.id
        ) THEN 1 ELSE 0 END AS is_last_active_owner
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      JOIN workspaces w ON w.id = wm.workspace_id
      ORDER BY wm.created_at DESC, w.name COLLATE NOCASE, u.email COLLATE NOCASE
      LIMIT 300
    `).all<{
      id: string, workspace_id: string, workspace_name: string, user_id: string,
      email: string, display_name: string, user_status: string, role: string,
      membership_status: string, created_at: string, is_last_active_owner: number,
    }>(),
    db.prepare(`
      SELECT i.id, i.workspace_id, w.name AS workspace_name, i.email, i.role,
        i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
        CASE
          WHEN i.revoked_at IS NOT NULL THEN 'revoked'
          WHEN i.accepted_at IS NOT NULL THEN 'accepted'
          WHEN datetime(i.expires_at) <= datetime('now') THEN 'expired'
          ELSE 'pending'
        END AS status
      FROM workspace_invitations i
      JOIN workspaces w ON w.id = i.workspace_id
      ORDER BY i.created_at DESC, i.id
      LIMIT 100
    `).all<{
      id: string, workspace_id: string, workspace_name: string, email: string, role: string,
      expires_at: string, accepted_at: string | null, revoked_at: string | null,
      created_at: string, status: string,
    }>(),
    db.prepare(`
      SELECT log.id, log.actor_user_id, actor.email AS actor_email, log.action,
        log.target_type, log.target_id, log.workspace_id, log.created_at
      FROM platform_audit_log log
      LEFT JOIN users actor ON actor.id = log.actor_user_id
      ORDER BY log.created_at DESC, log.id DESC
      LIMIT 50
    `).all<{
      id: string, actor_user_id: string | null, actor_email: string | null, action: string, target_type: string,
      target_id: string | null, workspace_id: string | null, created_at: string,
    }>(),
    db.prepare(`
      SELECT bs.mailbox_domain, bs.sender_address, bs.created_at, bs.created_by_user_id,
        u.email AS blocked_by_email,
        wd.workspace_id, w.name AS workspace_name
      FROM blocked_senders bs
      LEFT JOIN users u ON u.id = bs.created_by_user_id
      LEFT JOIN workspace_domains wd ON lower(wd.domain) = lower(bs.mailbox_domain)
      LEFT JOIN workspaces w ON w.id = wd.workspace_id
      ORDER BY bs.created_at DESC, bs.mailbox_domain COLLATE NOCASE, bs.sender_address COLLATE NOCASE
      LIMIT 500
    `).all<{
      mailbox_domain: string, sender_address: string, created_at: string,
      workspace_id: string | null, workspace_name: string | null,
    }>(),
    db.prepare('SELECT COUNT(*) AS count FROM blocked_senders').first<{ count: number }>(),
    db.prepare(`
      SELECT id, event_type, reason_code, sender_address, recipient_address, created_at
      FROM inbound_email_events
      WHERE created_at >= ?
      ORDER BY created_at DESC, id DESC
      LIMIT 101
    `).bind(inboundEventCutoff).all<{
      id: string, event_type: 'rejected' | 'degraded' | 'failed',
      reason_code: 'sender_blocked' | 'mailbox_unconfigured' | 'mail_storage_unavailable' | 'processing_failed',
      sender_address: string, recipient_address: string, created_at: string,
    }>(),
  ])

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    counts,
    workspaces: workspaces.results,
    domains: domains.results,
    memberships: memberships.results,
    invitations: invitations.results,
    audit: audit.results,
    blockedSenders: blockedSenders.results,
    blockedSendersTruncated: Number(blockedSenderCount?.count ?? 0) > blockedSenders.results.length,
    inboundEmailEvents: inboundEmailEvents.results.slice(0, 100),
    inboundEmailEventsTruncated: inboundEmailEvents.results.length > 100,
  }
})
