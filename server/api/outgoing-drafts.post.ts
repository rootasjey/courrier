import type { MailStorageBindings } from '../utils/mail-store'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await bindings.DB.prepare('INSERT INTO outgoing_drafts (id, created_at, updated_at) VALUES (?, ?, ?)').bind(id, now, now).run()
  return { id, to: '', cc: '', bcc: '', subject: '', content: { type: 'doc', content: [{ type: 'paragraph' }] }, status: 'draft', updatedAt: now, attachments: [] }
})
