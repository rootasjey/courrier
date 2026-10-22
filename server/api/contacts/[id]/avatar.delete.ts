import type { MailStorageBindings } from '../../../utils/mail-store'
import { getAccountDb, getWorkspaceUserFromContext } from '../../../utils/account-auth'
import { isContactId } from '../../../utils/contact-avatar'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = getWorkspaceUserFromContext(event)
  const contactId = getRouterParam(event, 'id') || ''
  if (!isContactId(contactId)) throw createError({ statusCode: 400, statusMessage: 'Identifiant de contact invalide.' })
  const db = getAccountDb(event)
  const contact = await db.prepare(`SELECT avatar_object_key FROM contacts WHERE id = ? AND workspace_id = ? LIMIT 1`)
    .bind(contactId, user.activeWorkspaceId).first<{ avatar_object_key: string | null }>()
  if (!contact) throw createError({ statusCode: 404, statusMessage: 'Fiche contact introuvable dans cet espace.' })
  if (contact.avatar_object_key) {
    const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
    if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage des photos est indisponible.' })
    await db.prepare(`UPDATE contacts SET avatar_object_key = NULL, updated_by_name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .bind(user.displayName, new Date().toISOString(), contactId, user.activeWorkspaceId).run()
    try { await bindings.MAIL_STORE.delete(contact.avatar_object_key) }
    catch (error) { console.error('Contact avatar cleanup failed', error) }
  }
  return { deleted: true }
})
