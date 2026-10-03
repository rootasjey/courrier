import type { MailStorageBindings } from '../../../utils/mail-store'
import { keepSetAsideThread } from '../../../utils/keep-set-aside-thread'

const fromAddress = 'courrier-test@verbatims.cc'

function parseAllowedRecipients(value?: string) {
  const recipients = (value || '').split(',').map(address => address.trim().toLocaleLowerCase('en-US')).filter(Boolean)
  if (recipients.some(address => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(address))) return new Set<string>()
  return new Set(recipients)
}

type ReplyRow = {
  draft_id: string
  to_address: string
  subject: string
  text_body: string
  status: 'draft' | 'sending'
  id: string
  message_id: string
  in_reply_to: string | null
  references_header: string | null
  sender_name: string
  sender_address: string
  envelope_from: string
  folder: string
  mailbox_domain: string
  trashed_at: string | null
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  }
  const encoded = btoa(binary)
  return encoded.match(/.{1,76}/g)?.join('\r\n') || ''
}

function encodeHeader(value: string) {
  const words: string[] = []
  let part = ''
  let size = 0
  for (const character of value) {
    const characterSize = new TextEncoder().encode(character).length
    if (part && size + characterSize > 30) {
      words.push(`=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(part)))}?=`)
      part = ''
      size = 0
    }
    part += character
    size += characterSize
  }
  if (part) words.push(`=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(part)))}?=`)
  return words.join('\r\n ')
}

function storedMime(row: ReplyRow, messageId: string, sentAt: string) {
  const refs = threadReferences(row)
  const headers = [
    `From: Courrier <${fromAddress}>`,
    `To: ${row.to_address}`,
    `Subject: ${encodeHeader(row.subject)}`,
    `Date: ${new Date(sentAt).toUTCString()}`,
    `Message-ID: ${messageId}`,
    `In-Reply-To: ${row.message_id}`,
    `References: ${refs.join(' ')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  return `${headers.join('\r\n')}\r\n\r\n${encodeBase64(row.text_body)}\r\n`
}

function threadReferences(row: ReplyRow) {
  const refs = [...new Set([...(row.references_header?.match(/<[^<>]+>/g) || []), ...(row.in_reply_to?.match(/<[^<>]+>/g) || []), row.message_id])].slice(-100)
  while (refs.length > 1 && refs.join(' ').length > 1_800) refs.shift()
  return refs
}

function replySubject(subject: string) {
  const clean = subject.replace(/\s+/g, ' ').trim() || '(sans objet)'
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE || !bindings.EMAIL) {
    throw createError({ statusCode: 503, statusMessage: 'L’envoi de réponses n’est pas configuré.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  let row = await bindings.DB.prepare(`
    SELECT drafts.id AS draft_id, drafts.to_address, drafts.subject, drafts.text_body, drafts.status,
      messages.id, messages.message_id, messages.in_reply_to, messages.references_header,
      messages.sender_name, messages.sender_address, messages.envelope_from, messages.folder,
      messages.mailbox_domain, messages.trashed_at
    FROM drafts
    JOIN messages ON messages.id = drafts.reply_to_message_id
    WHERE messages.id = ?
  `).bind(messageId).first<ReplyRow>()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Brouillon introuvable.' })
  if (row.status !== 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'L’état de cet envoi est incertain. Vérifie d’abord la boîte destinataire pour éviter un doublon.' })
  }
  if (row.mailbox_domain !== 'verbatims.cc' || row.folder === 'Screener' || row.folder === 'Trash' || row.trashed_at) {
    throw createError({ statusCode: 409, statusMessage: 'Ce message ne peut plus recevoir de réponse.' })
  }
  if (!row.text_body.trim()) throw createError({ statusCode: 400, statusMessage: 'Écris un message avant de l’envoyer.' })
  const allowedRecipients = parseAllowedRecipients(bindings.COURRIER_ALLOWED_RECIPIENTS)
  if (!allowedRecipients.has(row.to_address.toLocaleLowerCase('en-US'))) {
    throw createError({ statusCode: 403, statusMessage: 'Pour ce prototype, l’envoi est limité à tes propres adresses de test.' })
  }
  if (!/^<[^<>\s\r\n]+@[^<>\s\r\n]+>$/.test(row.message_id)) {
    throw createError({ statusCode: 409, statusMessage: 'L’identifiant de conversation ne permet pas de produire une réponse fiable.' })
  }

  const claim = await bindings.DB.prepare(`
    UPDATE drafts SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'draft'
  `).bind(new Date().toISOString(), row.draft_id).run()
  if (!claim.meta.changes) {
    throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est déjà en cours d’envoi.' })
  }

  // Read the claimed snapshot after the conditional update: a save that completed
  // just before the claim must be included in the message we send.
  const claimedRow = await bindings.DB.prepare(`
    SELECT drafts.id AS draft_id, drafts.to_address, drafts.subject, drafts.text_body, drafts.status,
      messages.id, messages.message_id, messages.in_reply_to, messages.references_header,
      messages.sender_name, messages.sender_address, messages.envelope_from, messages.folder,
      messages.mailbox_domain, messages.trashed_at
    FROM drafts
    JOIN messages ON messages.id = drafts.reply_to_message_id
    WHERE messages.id = ? AND drafts.status = 'sending'
  `).bind(messageId).first<ReplyRow>()
  if (!claimedRow) {
    throw createError({ statusCode: 409, statusMessage: 'Le brouillon a changé pendant la préparation de l’envoi.' })
  }
  row = claimedRow
  if (!row.text_body.trim()) {
    await bindings.DB.prepare("UPDATE drafts SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'sending'")
      .bind(new Date().toISOString(), row.draft_id).run()
    throw createError({ statusCode: 400, statusMessage: 'Écris un message avant de l’envoyer.' })
  }

  const references = threadReferences(row)
  let result: Awaited<ReturnType<SendEmail['send']>>
  try {
    result = await bindings.EMAIL.send({
      from: { email: fromAddress, name: 'Courrier' },
      to: row.to_address,
      subject: replySubject(row.subject),
      text: row.text_body,
      headers: {
        'In-Reply-To': row.message_id,
        References: references.join(' '),
      },
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code && !['E_INTERNAL_SERVER_ERROR', 'E_RATE_LIMIT_EXCEEDED', 'E_DELIVERY_FAILED'].includes(code)) {
      await bindings.DB.prepare("UPDATE drafts SET status = 'draft', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), row.draft_id).run()
    }
    throw createError({
      statusCode: code ? 502 : 503,
      statusMessage: code
        ? `Cloudflare n’a pas accepté l’envoi (${code}). Le brouillon est conservé.`
        : 'L’état de l’envoi est incertain. Vérifie d’abord la boîte destinataire avant tout nouvel essai.',
    })
  }

  const sentAt = new Date().toISOString()
  const id = crypto.randomUUID()
  const rawObjectKey = `messages/${id}/sent-copy.eml`
  const raw = storedMime(row, result.messageId, sentAt)

  try {
    await bindings.MAIL_STORE.put(rawObjectKey, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
      customMetadata: { messageId: result.messageId, envelopeTo: row.to_address },
    })
    await bindings.DB.batch([
      bindings.DB.prepare(`
        INSERT INTO messages (
          id, message_id, envelope_from, envelope_to, sender_name, sender_address,
          subject, sent_at, received_at, in_reply_to, references_header, text_body,
          raw_object_key, mailbox_domain, folder, screener_state, is_read, trashed_at, is_outgoing
        ) VALUES (?, ?, ?, ?, 'Courrier', ?, ?, ?, ?, ?, ?, ?, ?, 'verbatims.cc', ?, 'cleared', 1, NULL, 1)
      `).bind(
        id, result.messageId, fromAddress, row.to_address, fromAddress, replySubject(row.subject),
        sentAt, sentAt, row.message_id, references.join(' '), row.text_body, rawObjectKey, row.folder,
      ),
      bindings.DB.prepare('DELETE FROM drafts WHERE id = ?').bind(row.draft_id),
    ])
  } catch {
    // The provider accepted the email. Leave the draft locked so the user checks delivery before retrying.
    throw createError({ statusCode: 500, statusMessage: 'Le message a été accepté par Cloudflare, mais Courrier n’a pas pu terminer son archivage. Vérifie la boîte destinataire avant de réessayer.' })
  }

  try {
    await keepSetAsideThread(bindings.DB, id)
  } catch (error) {
    console.error('[courrier] Could not keep the Set Aside thread together after sending a reply.', { id, error })
  }

  return { id, messageId: result.messageId, sentAt }
})
