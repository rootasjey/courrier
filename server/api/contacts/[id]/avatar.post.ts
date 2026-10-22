import type { MailStorageBindings } from '../../../utils/mail-store'
import { assertSameOrigin, getAccountDb, getWorkspaceUserFromContext } from '../../../utils/account-auth'
import { contactAvatarImageType, contactAvatarObjectKey, isContactId, MAX_CONTACT_AVATAR_BYTES } from '../../../utils/contact-avatar'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = getWorkspaceUserFromContext(event)
  const contactId = getRouterParam(event, 'id') || ''
  if (!isContactId(contactId)) throw createError({ statusCode: 400, statusMessage: 'Identifiant de contact invalide.' })
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage des photos est indisponible.' })

  const db = getAccountDb(event)
  const contact = await db.prepare(`SELECT avatar_object_key FROM contacts WHERE id = ? AND workspace_id = ? LIMIT 1`)
    .bind(contactId, user.activeWorkspaceId).first<{ avatar_object_key: string | null }>()
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Fiche contact introuvable dans cet espace.' })

  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (contentLength > MAX_CONTACT_AVATAR_BYTES + 64 * 1024) throw createError({ statusCode: 413, statusMessage: 'La photo ne peut pas dépasser 5 Mio.' })
  const file = (await readMultipartFormData(event))?.find(part => part.name === 'file' && part.filename)
  if (!file?.data?.byteLength) throw createError({ statusCode: 400, statusMessage: 'Choisis une photo non vide.' })
  if (file.data.byteLength > MAX_CONTACT_AVATAR_BYTES) throw createError({ statusCode: 413, statusMessage: 'La photo ne peut pas dépasser 5 Mio.' })
  const mimeType = contactAvatarImageType(file.data)
  if (!mimeType) throw createError({ statusCode: 400, statusMessage: 'Utilise une image JPEG, PNG ou WebP.' })

  const key = contactAvatarObjectKey(user.activeWorkspaceId, contactId)
  await bindings.MAIL_STORE.put(key, file.data, {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' },
    customMetadata: { purpose: 'courrier-contact-avatar', workspaceId: user.activeWorkspaceId, contactId },
  })
  const updatedAt = new Date().toISOString()
  try {
    const result = await db.prepare(`UPDATE contacts SET avatar_object_key = ?, updated_by_name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .bind(key, user.displayName, updatedAt, contactId, user.activeWorkspaceId).run()
    if (!result.meta.changes) throw createError({ statusCode: 404, statusMessage: 'Fiche contact introuvable dans cet espace.' })
  } catch (error) {
    await bindings.MAIL_STORE.delete(key)
    throw error
  }
  if (contact.avatar_object_key) {
    try { await bindings.MAIL_STORE.delete(contact.avatar_object_key) }
    catch (error) { console.error('Previous contact avatar cleanup failed', error) }
  }
  return { saved: true, avatarUrl: `/api/contacts/${contactId}/avatar?v=${encodeURIComponent(updatedAt)}` }
})
