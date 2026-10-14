import { getAccountDb, isPlatformAdmin, requireSessionIdentity } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = await requireSessionIdentity(event)
  const session = await requireUserSession(event)
  const activeWorkspaceId = typeof session.activeWorkspaceId === 'string' ? session.activeWorkspaceId : null
  const membership = activeWorkspaceId
    ? await getAccountDb(event).prepare(`
      SELECT w.id
      FROM workspace_memberships wm
      JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
      WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
      LIMIT 1
    `).bind(user.id, activeWorkspaceId).first<{ id: string }>()
    : null
  const platformAdmin = await isPlatformAdmin(event, user.id)
  if (!membership && !platformAdmin) {
    throw createError({ statusCode: 401, statusMessage: 'Aucun espace Courrier actif.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    activeWorkspaceId: membership?.id ?? null,
    isPlatformAdmin: platformAdmin,
  }
})
