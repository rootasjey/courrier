import { getAccountDb, requireWorkspacePermission } from '../../utils/account-auth'

const MANAGEMENT_LIST_LIMIT = 500
const INVITATION_LIST_LIMIT = 100

export default defineEventHandler(async (event) => {
  const actor = await requireWorkspacePermission(event, 'members.manage')
  const db = getAccountDb(event)
  const [workspace, members, invitations, memberCount, invitationCount] = await Promise.all([
    db.prepare(`
      SELECT w.id, w.name, wm.role
      FROM workspace_memberships wm
      JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
      LIMIT 1
    `).bind(actor.activeWorkspaceId, actor.id).first<{ id: string, name: string, role: 'owner' | 'admin' }>(),
    db.prepare(`
      SELECT wm.id, wm.user_id, u.email, u.display_name, wm.role, wm.status, wm.created_at
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ?
      ORDER BY CASE wm.status WHEN 'active' THEN 0 ELSE 1 END, u.email COLLATE NOCASE
      LIMIT ?
    `).bind(actor.activeWorkspaceId, MANAGEMENT_LIST_LIMIT).all<{
      id: string, user_id: string, email: string, display_name: string, role: string, status: string, created_at: string,
    }>(),
    db.prepare(`
      SELECT id, email, role, expires_at, created_at
      FROM workspace_invitations
      WHERE workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
        AND datetime(expires_at) > datetime('now')
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(actor.activeWorkspaceId, INVITATION_LIST_LIMIT).all<{
      id: string, email: string, role: string, expires_at: string, created_at: string,
    }>(),
    db.prepare('SELECT COUNT(*) AS count FROM workspace_memberships WHERE workspace_id = ?')
      .bind(actor.activeWorkspaceId).first<{ count: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS count FROM workspace_invitations
      WHERE workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
        AND datetime(expires_at) > datetime('now')
    `).bind(actor.activeWorkspaceId).first<{ count: number }>(),
  ])

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    workspace,
    members: members.results,
    invitations: invitations.results,
    truncated: {
      members: Number(memberCount?.count ?? 0) > members.results.length,
      invitations: Number(invitationCount?.count ?? 0) > invitations.results.length,
    },
  }
})
