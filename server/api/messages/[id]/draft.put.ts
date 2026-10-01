import type { MailStorageBindings } from '../../../utils/mail-store'

type ReplyTarget = {
  id: string
  envelope_from: string
  envelope_to: string
  sender_address: string
  subject: string
  mailbox_domain: string
  folder: string
  trashed_at: string | null
  is_outgoing: number
}

type ExistingDraft = { status: 'draft' | 'sending' }

function replySubject(subject: string) {
  const clean = subject.replace(/\s+/g, ' ').trim() || '(sans objet)'
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons n’est pas disponible.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const body = await readBody<{ textBody?: unknown }>(event)
  if (typeof body?.textBody !== 'string' || body.textBody.length > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'Le texte du brouillon est invalide ou trop long.' })
  }

  const target = await bindings.DB.prepare(`
    SELECT id, envelope_from, envelope_to, sender_address, subject, mailbox_domain, folder, trashed_at, is_outgoing
    FROM messages WHERE id = ?
  `).bind(messageId).first<ReplyTarget>()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  if (target.folder === 'Screener' || target.folder === 'Trash' || target.trashed_at) {
    throw createError({ statusCode: 409, statusMessage: 'Ce message ne peut pas recevoir de réponse depuis son emplacement actuel.' })
  }

  const to = (target.is_outgoing ? target.envelope_to : target.sender_address || target.envelope_from).trim().toLocaleLowerCase('en-US')
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
    throw createError({ statusCode: 400, statusMessage: 'L’adresse de réponse est invalide.' })
  }

  const existing = await bindings.DB.prepare('SELECT status FROM drafts WHERE reply_to_message_id = ?')
    .bind(messageId).first<ExistingDraft>()
  if (existing?.status === 'sending') {
    throw createError({ statusCode: 409, statusMessage: 'Cet envoi est en cours ou son état est incertain.' })
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const saved = await bindings.DB.prepare(`
    INSERT INTO drafts (id, reply_to_message_id, mailbox_domain, to_address, subject, text_body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(reply_to_message_id) DO UPDATE SET
      to_address = excluded.to_address,
      subject = excluded.subject,
      text_body = excluded.text_body,
      updated_at = excluded.updated_at
    WHERE drafts.status = 'draft'
  `).bind(id, messageId, target.mailbox_domain, to, replySubject(target.subject), body.textBody, now, now).run()
  if (!saved.meta.changes) {
    throw createError({ statusCode: 409, statusMessage: 'Cet envoi a déjà commencé ; le brouillon ne peut plus être modifié.' })
  }

  const draft = await bindings.DB.prepare(`
    SELECT id, to_address, subject, text_body, status, updated_at
    FROM drafts WHERE reply_to_message_id = ?
  `).bind(messageId).first<{ id: string, to_address: string, subject: string, text_body: string, status: 'draft' | 'sending', updated_at: string }>()

  return { id: draft!.id, to: draft!.to_address, subject: draft!.subject, textBody: draft!.text_body, status: draft!.status, updatedAt: draft!.updated_at }
})
