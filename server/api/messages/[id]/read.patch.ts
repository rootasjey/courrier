import type { MailStorageBindings } from '../../../utils/mail-store'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'La base de messages n’est pas disponible.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant de message manquant.' })

  const body = await readBody<{ isRead?: boolean }>(event)
  if (typeof body?.isRead !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Le statut de lecture est invalide.' })
  }

  const result = await bindings.DB.prepare('UPDATE messages SET is_read = ? WHERE id = ?')
    .bind(body.isRead ? 1 : 0, id)
    .run()

  if (!result.meta.changes) {
    throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  }

  return { id, isRead: body.isRead }
})
