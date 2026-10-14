import { assertSameOrigin, getAccountDb, requireAccountUser } from '../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = await requireAccountUser(event)
  const body = await readBody<{ workspaceId?: unknown }>(event)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
  if (!workspaceId || workspaceId.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Espace de travail invalide.' })
  }

  const membership = await getAccountDb(event).prepare(`
    SELECT w.id
    FROM workspace_memberships wm
    JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
    WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
  `).bind(user.id, workspaceId).first<{ id: string }>()
  if (!membership) throw createError({ statusCode: 404, statusMessage: 'Espace de travail introuvable.' })

  await replaceUserSession(event, {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    secure: { sessionVersion: user.sessionVersion },
    activeWorkspaceId: membership.id,
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { activeWorkspaceId: membership.id }
})
