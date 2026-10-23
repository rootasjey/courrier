import { getAccountDb, getWorkspaceUserFromContext } from '../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const db = getAccountDb(event)
  const [result, managePermission, classifyPermission] = await Promise.all([
    db.prepare(`
      SELECT id, name, color, created_at, updated_at
      FROM workspace_tags
      WHERE workspace_id = ?
      ORDER BY name COLLATE NOCASE ASC, id ASC
    `).bind(user.activeWorkspaceId).all<{ id: string, name: string, color: string, created_at: string, updated_at: string }>(),
    db.prepare(`
      SELECT 1 AS allowed FROM workspace_memberships wm
      JOIN role_permissions rp ON rp.role = wm.role AND rp.permission = 'mail.tags.manage'
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
      LIMIT 1
    `).bind(user.activeWorkspaceId, user.id).first<{ allowed: number }>(),
    db.prepare(`
      SELECT 1 AS allowed FROM workspace_memberships wm
      JOIN role_permissions rp ON rp.role = wm.role AND rp.permission = 'mail.classify'
      WHERE wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'active'
      LIMIT 1
    `).bind(user.activeWorkspaceId, user.id).first<{ allowed: number }>(),
  ])
  return {
    canManage: Boolean(managePermission?.allowed),
    canAssign: Boolean(classifyPermission?.allowed),
    tags: result.results.map(tag => ({ id: tag.id, name: tag.name, color: tag.color, createdAt: tag.created_at, updatedAt: tag.updated_at })),
  }
})
