import { getAccountDb, requireWorkspacePermission } from '../../utils/account-auth'

const MAILBOX_LIMIT = 500
const MEMBER_LIMIT = 500
const GRANT_LIMIT = 5000

export default defineEventHandler(async (event) => {
  const actor = await requireWorkspacePermission(event, 'mailbox.access.manage')
  const db = getAccountDb(event)
  const workspaceId = actor.activeWorkspaceId
  const [mailboxes, members, grants, mailboxCount, memberCount, grantCount] = await Promise.all([
    db.prepare(`
      SELECT mb.id, mb.address
      FROM mailboxes mb
      JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      WHERE mb.workspace_id = ? AND mb.status = 'active'
        AND d.verification_status IN ('verified', 'legacy_unverified')
      ORDER BY mb.address COLLATE NOCASE
      LIMIT ?
    `).bind(workspaceId, MAILBOX_LIMIT).all<{ id: string, address: string }>(),
    db.prepare(`
      SELECT wm.user_id, u.email, u.display_name, wm.role
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE wm.workspace_id = ? AND wm.status = 'active'
      ORDER BY u.email COLLATE NOCASE
      LIMIT ?
    `).bind(workspaceId, MEMBER_LIMIT).all<{
      user_id: string, email: string, display_name: string | null, role: string,
    }>(),
    db.prepare(`
      SELECT mag.mailbox_id, mag.user_id
      FROM mailbox_access_grants mag
      JOIN mailboxes mb ON mb.id = mag.mailbox_id AND mb.workspace_id = mag.workspace_id AND mb.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id AND wm.status = 'active'
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE mag.workspace_id = ? AND mag.status = 'active'
        AND d.verification_status IN ('verified', 'legacy_unverified')
      ORDER BY mag.mailbox_id, mag.user_id
      LIMIT ?
    `).bind(workspaceId, GRANT_LIMIT).all<{ mailbox_id: string, user_id: string }>(),
    db.prepare(`
      SELECT COUNT(*) AS count FROM mailboxes mb
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      WHERE mb.workspace_id = ? AND mb.status = 'active'
        AND d.verification_status IN ('verified', 'legacy_unverified')
    `).bind(workspaceId).first<{ count: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS count FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE wm.workspace_id = ? AND wm.status = 'active'
    `).bind(workspaceId).first<{ count: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS count FROM mailbox_access_grants mag
      JOIN mailboxes mb ON mb.id = mag.mailbox_id AND mb.workspace_id = mag.workspace_id AND mb.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id AND wm.status = 'active'
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE mag.workspace_id = ? AND mag.status = 'active'
        AND d.verification_status IN ('verified', 'legacy_unverified')
    `).bind(workspaceId).first<{ count: number }>(),
  ])

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    mailboxes: mailboxes.results,
    members: members.results,
    grants: grants.results,
    truncated: {
      mailboxes: Number(mailboxCount?.count ?? 0) > mailboxes.results.length,
      members: Number(memberCount?.count ?? 0) > members.results.length,
      grants: Number(grantCount?.count ?? 0) > grants.results.length,
    },
  }
})
