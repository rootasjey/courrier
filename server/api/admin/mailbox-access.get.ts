import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'

const MAILBOX_LIMIT = 500
const MEMBER_LIMIT = 500
const GRANT_LIMIT = 5000

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const db = getAccountDb(event)

  const [mailboxCount, memberCount, grantCount, mailboxes, members, grants] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM mailboxes mb
      JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      WHERE mb.status = 'active' AND d.verification_status IN ('verified', 'legacy_unverified')
    `).first<{ count: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
      WHERE wm.status = 'active'
    `).first<{ count: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM mailbox_access_grants mag
      JOIN mailboxes mb ON mb.id = mag.mailbox_id AND mb.workspace_id = mag.workspace_id AND mb.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id AND wm.status = 'active'
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE mag.status = 'active' AND d.verification_status IN ('verified', 'legacy_unverified')
    `).first<{ count: number }>(),
    db.prepare(`
      SELECT mb.id, mb.workspace_id, w.name AS workspace_name, mb.address
      FROM mailboxes mb
      JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      WHERE mb.status = 'active' AND d.verification_status IN ('verified', 'legacy_unverified')
      ORDER BY w.name COLLATE NOCASE, mb.address COLLATE NOCASE
      LIMIT ?
    `).bind(MAILBOX_LIMIT).all<{
      id: string, workspace_id: string, workspace_name: string, address: string,
    }>(),
    db.prepare(`
      SELECT wm.workspace_id, wm.user_id, u.email, u.display_name, wm.role
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
      WHERE wm.status = 'active'
      ORDER BY w.name COLLATE NOCASE, u.email COLLATE NOCASE
      LIMIT ?
    `).bind(MEMBER_LIMIT).all<{
      workspace_id: string, user_id: string, email: string, display_name: string | null, role: string,
    }>(),
    db.prepare(`
      SELECT mag.workspace_id, mag.mailbox_id, mag.user_id
      FROM mailbox_access_grants mag
      JOIN mailboxes mb ON mb.id = mag.mailbox_id AND mb.workspace_id = mag.workspace_id AND mb.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id AND wm.status = 'active'
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE mag.status = 'active' AND d.verification_status IN ('verified', 'legacy_unverified')
      ORDER BY mag.workspace_id, mag.mailbox_id, mag.user_id
      LIMIT ?
    `).bind(GRANT_LIMIT).all<{
      workspace_id: string, mailbox_id: string, user_id: string,
    }>(),
  ])

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    mailboxes: mailboxes.results,
    members: members.results,
    grants: grants.results,
    truncated: {
      mailboxes: (mailboxCount?.count ?? 0) > mailboxes.results.length,
      members: (memberCount?.count ?? 0) > members.results.length,
      grants: (grantCount?.count ?? 0) > grants.results.length,
    },
  }
})
