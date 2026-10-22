import type { MailStorageBindings } from '../../../utils/mail-store'
import { getAccountDb, getWorkspaceUserFromContext } from '../../../utils/account-auth'
import { isContactId } from '../../../utils/contact-avatar'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const contactId = getRouterParam(event, 'id') || ''
  if (!isContactId(contactId)) throw createError({ statusCode: 404, statusMessage: 'Photo introuvable.' })
  const contact = await getAccountDb(event).prepare(`SELECT avatar_object_key FROM contacts WHERE id = ? AND workspace_id = ? LIMIT 1`)
    .bind(contactId, user.activeWorkspaceId).first<{ avatar_object_key: string | null }>()
  if (!contact?.avatar_object_key) throw createError({ statusCode: 404, statusMessage: 'Aucune photo enregistrée.' })
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage des photos est indisponible.' })
  const object = await bindings.MAIL_STORE.get(contact.avatar_object_key)
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Photo introuvable.' })
  const mimeType = object.httpMetadata?.contentType
  if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw createError({ statusCode: 404, statusMessage: 'Photo introuvable.' })
  }
  setResponseHeader(event, 'Content-Type', mimeType)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Content-Disposition', 'inline')
  return object.body
})
