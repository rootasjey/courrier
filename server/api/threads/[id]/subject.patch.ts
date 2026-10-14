import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope } from '../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })
  }

  const threadId = getRouterParam(event, 'id')
  if (!threadId) {
    throw createError({ statusCode: 400, statusMessage: 'Le fil à renommer est invalide.' })
  }

  const message = await bindings.DB.prepare(`
    SELECT id, mailbox_domain FROM messages WHERE id = ?
      AND ${workspaceDomainScope('messages.mailbox_domain')}
  `).bind(threadId, user.activeWorkspaceId).first<{ id: string, mailbox_domain: string }>()
  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Ce fil est introuvable.' })
  }

  const body = await readBody<{ subject?: unknown }>(event)
  if (body?.subject !== null && typeof body?.subject !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Le nouvel objet est invalide.' })
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (subject.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'L’objet du fil doit contenir 200 caractères ou moins.' })
  }

  if (!subject) {
    await bindings.DB.prepare(`
      DELETE FROM thread_subject_overrides WHERE mailbox_domain = ? AND thread_id = ?
    `).bind(message.mailbox_domain, message.id).run()
    return { threadId: message.id, subject: null }
  }

  await bindings.DB.prepare(`
    INSERT INTO thread_subject_overrides (mailbox_domain, thread_id, subject, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(mailbox_domain, thread_id) DO UPDATE SET
      subject = excluded.subject,
      updated_at = excluded.updated_at
  `).bind(message.mailbox_domain, message.id, subject, new Date().toISOString()).run()

  return { threadId: message.id, subject }
})
