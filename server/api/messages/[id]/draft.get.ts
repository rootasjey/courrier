import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope } from '../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons n’est pas disponible.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const draft = await bindings.DB.prepare(`
    SELECT drafts.id, drafts.to_address, drafts.subject, drafts.text_body, drafts.status, drafts.updated_at
    FROM drafts
    WHERE drafts.reply_to_message_id = ? AND ${workspaceDomainScope('drafts.mailbox_domain')}
  `).bind(messageId, user.activeWorkspaceId).first<{ id: string, to_address: string, subject: string, text_body: string, status: 'draft' | 'sending', updated_at: string }>()

  return draft
    ? { id: draft.id, to: draft.to_address, subject: draft.subject, textBody: draft.text_body, status: draft.status, updatedAt: draft.updated_at }
    : null
})
