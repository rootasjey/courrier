import { getAccountDb, getWorkspaceUserFromContext } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const body = await readBody<{ name?: unknown, color?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const colors = ['teal', 'blue', 'green', 'amber', 'rose', 'violet'] as const
  const color = colors.includes(body?.color as typeof colors[number]) ? body.color as typeof colors[number] : 'teal'
  if (!name || name.length > 40) throw createError({ statusCode: 400, statusMessage: 'Le nom doit contenir entre 1 et 40 caractères.' })

  const db = getAccountDb(event)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await db.prepare(`
      INSERT INTO workspace_tags (id, workspace_id, name, color, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, user.activeWorkspaceId, name, color, user.id, now, now).run()
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Un tag portant ce nom existe déjà dans cet espace.' })
  }
  return { id, name, color, createdAt: now, updatedAt: now }
})
