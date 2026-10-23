import { getAccountDb, getWorkspaceUserFromContext } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const id = getRouterParam(event, 'id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Identifiant de tag invalide.' })
  const result = await getAccountDb(event).prepare(`
    DELETE FROM workspace_tags WHERE id = ? AND workspace_id = ?
  `).bind(id, user.activeWorkspaceId).run()
  if (!result.meta.changes) throw createError({ statusCode: 404, statusMessage: 'Ce tag est introuvable.' })
  return { id, deleted: true }
})
