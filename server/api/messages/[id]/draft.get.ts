import type { MailStorageBindings } from '../../../utils/mail-store'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons n’est pas disponible.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const draft = await bindings.DB.prepare(`
    SELECT id, to_address, subject, text_body, status, updated_at
    FROM drafts WHERE reply_to_message_id = ?
  `).bind(messageId).first<{ id: string, to_address: string, subject: string, text_body: string, status: 'draft' | 'sending', updated_at: string }>()

  return draft
    ? { id: draft.id, to: draft.to_address, subject: draft.subject, textBody: draft.text_body, status: draft.status, updatedAt: draft.updated_at }
    : null
})
