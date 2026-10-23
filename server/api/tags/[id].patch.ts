import { getAccountDb, getWorkspaceUserFromContext } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ name?: unknown, color?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const colors = ['teal', 'blue', 'green', 'amber', 'rose', 'violet'] as const
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Identifiant de tag invalide.' })
  if (!name || name.length > 40) throw createError({ statusCode: 400, statusMessage: 'Le nom doit contenir entre 1 et 40 caractères.' })
  if (!colors.includes(body?.color as typeof colors[number])) throw createError({ statusCode: 400, statusMessage: 'Couleur de tag invalide.' })

  const now = new Date().toISOString()
  try {
    const result = await getAccountDb(event).prepare(`
      UPDATE workspace_tags SET name = ?, color = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).bind(name, body.color, now, id, user.activeWorkspaceId).run()
    if (!result.meta.changes) throw createError({ statusCode: 404, statusMessage: 'Ce tag est introuvable.' })
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 409, statusMessage: 'Un tag portant ce nom existe déjà dans cet espace.' })
  }
  return { id, name, color: body.color, updatedAt: now }
})
