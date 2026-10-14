import { getAccountDb, requireAccountUser } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = await requireAccountUser(event)
  const result = await getAccountDb(event).prepare(`
    SELECT w.id, w.name, wm.role
    FROM workspace_memberships wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ? AND wm.status = 'active' AND w.status = 'active'
    ORDER BY w.name COLLATE NOCASE, w.id
  `).bind(user.id).all<{ id: string, name: string, role: string }>()
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { activeWorkspaceId: user.activeWorkspaceId, workspaces: result.results }
})
