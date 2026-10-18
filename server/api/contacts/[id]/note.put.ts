import { getAccountDb, getWorkspaceUserFromContext } from '../../../utils/account-auth'
import { getAccessibleContactAddresses } from '../../../utils/contact-access'

type NoteBody = { body?: string }

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<NoteBody>(event)
  const note = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de fiche contact invalide.' })
  }
  if (note.length > 10_000) throw createError({ statusCode: 400, statusMessage: 'La note ne peut pas dépasser 10 000 caractères.' })

  const db = getAccountDb(event)
  await getAccessibleContactAddresses(db, user.id, user.activeWorkspaceId, id)
  if (!note) {
    await db.prepare(`DELETE FROM contact_notes WHERE workspace_id = ? AND contact_id = ?`)
      .bind(user.activeWorkspaceId, id).run()
    return { note: null }
  }

  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO contact_notes (workspace_id, contact_id, body, created_by_name, updated_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (workspace_id, contact_id) DO UPDATE SET
      body = excluded.body,
      updated_by_name = excluded.updated_by_name,
      updated_at = excluded.updated_at
  `).bind(user.activeWorkspaceId, id, note, user.displayName, user.displayName, now, now).run()
  return { note: { body: note, updatedBy: user.displayName, updatedAt: now } }
})
