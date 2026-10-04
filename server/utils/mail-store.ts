import PostalMime, { type Address, type Attachment } from 'postal-mime'
import { isLinkedToSetAsideThread } from './keep-set-aside-thread.ts'
import { linkedReplyLaterFolder } from './reply-later-thread.ts'

export type MailStorageBindings = {
  DB: D1Database
  MAIL_STORE: R2Bucket
  EMAIL?: SendEmail
  COURRIER_ALLOWED_RECIPIENTS?: string
  COURRIER_LEGACY_FORWARD_TO?: string
}

export type IncomingEnvelope = {
  from: string
  to: string
}

export type ParsedEmail = Awaited<ReturnType<typeof PostalMime.parse>>

function flattenAddresses(value: Address | Address[] | undefined) {
  const addresses = value ? (Array.isArray(value) ? value : [value]) : []
  return addresses.flatMap((address) => 'group' in address && address.group
    ? address.group
    : 'address' in address && address.address
      ? [address]
      : [])
}

function attachmentBytes(content: Attachment['content']) {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  if (content instanceof ArrayBuffer) return new Uint8Array(content)
  return content
}

async function sha256(value: BufferSource) {
  const digest = await crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function parseIncomingEmail(rawEmail: ArrayBuffer) {
  return PostalMime.parse(rawEmail)
}

export function incomingSenderAddress(parsed: ParsedEmail, envelope: IncomingEnvelope) {
  const sender = flattenAddresses(parsed.from)[0]
  return (sender?.address || envelope.from).trim().toLocaleLowerCase('en-US')
}

export async function isBlockedSender(
  parsed: ParsedEmail,
  envelope: IncomingEnvelope,
  bindings: Pick<MailStorageBindings, 'DB'>,
) {
  const mailboxDomain = envelope.to.trim().split('@').at(-1)?.toLocaleLowerCase('en-US') || ''
  const senderAddress = incomingSenderAddress(parsed, envelope)
  if (!mailboxDomain || !senderAddress) return false

  const blocked = await bindings.DB.prepare(`
    SELECT 1 AS blocked FROM blocked_senders
    WHERE mailbox_domain = ? AND sender_address = ?
  `).bind(mailboxDomain, senderAddress).first<{ blocked: number }>()

  return Boolean(blocked)
}

export async function storeIncomingEmail(
  rawEmail: ArrayBuffer,
  envelope: IncomingEnvelope,
  bindings: MailStorageBindings,
  parsedEmail?: ParsedEmail,
) {
  const parsed = parsedEmail ?? await parseIncomingEmail(rawEmail)
  const contentHash = await sha256(rawEmail)
  const messageId = parsed.messageId?.trim() || `<${contentHash}@courrier.local>`
  const existing = await bindings.DB
    .prepare('SELECT id FROM messages WHERE message_id = ?')
    .bind(messageId)
    .first<{ id: string }>()

  if (existing) {
    return { id: existing.id, duplicate: true }
  }

  const id = contentHash
  const rawObjectKey = `messages/${id}/original.eml`
  const sender = flattenAddresses(parsed.from)[0]
  const senderAddress = incomingSenderAddress(parsed, envelope)
  const mailboxDomain = envelope.to.trim().split('@').at(-1)?.toLocaleLowerCase('en-US') || ''
  const hasReplyHeaders = Boolean(parsed.inReplyTo || parsed.references)
  let replyBelongsToSetAsideThread = false
  let replyLinkLookupFailed = false
  let replyLaterFolder: 'Imbox' | 'The Feed' | 'Paper Trail' | null = null
  let replyLaterLinkLookupFailed = false
  try {
    replyBelongsToSetAsideThread = await isLinkedToSetAsideThread(
      bindings.DB,
      mailboxDomain,
      parsed.inReplyTo || null,
      parsed.references || null,
    )
  } catch (error) {
    replyLinkLookupFailed = hasReplyHeaders
    console.error('[courrier] Could not detect whether the incoming reply belongs to a Set Aside conversation.', { id, error })
  }
  try {
    replyLaterFolder = await linkedReplyLaterFolder(
      bindings.DB,
      mailboxDomain,
      parsed.inReplyTo || null,
      parsed.references || null,
    )
  } catch (error) {
    replyLaterLinkLookupFailed = hasReplyHeaders
    console.error('[courrier] Could not detect whether the incoming reply belongs to a Reply Later conversation.', { id, error })
  }
  const sentAt = parsed.date && !Number.isNaN(Date.parse(parsed.date))
    ? new Date(parsed.date).toISOString()
    : null

  await bindings.MAIL_STORE.put(rawObjectKey, rawEmail, {
    httpMetadata: { contentType: 'message/rfc822' },
    customMetadata: { messageId, envelopeTo: envelope.to },
  })

  const attachmentRows = await Promise.all(parsed.attachments.map(async (attachment, index) => {
    const attachmentId = `${id}-${index}`
    const objectKey = `messages/${id}/attachments/${index}`
    const content = attachmentBytes(attachment.content)

    await bindings.MAIL_STORE.put(objectKey, content, {
      httpMetadata: { contentType: attachment.mimeType },
      customMetadata: {
        filename: attachment.filename || `piece-jointe-${index + 1}`,
        messageId,
      },
    })

    return {
      id: attachmentId,
      messageId: id,
      filename: attachment.filename || `piece-jointe-${index + 1}`,
      mimeType: attachment.mimeType,
      sizeBytes: content.byteLength,
      objectKey,
      contentId: attachment.contentId || null,
      disposition: attachment.disposition || null,
    }
  }))

  const statements = [
    bindings.DB.prepare(`
      INSERT OR IGNORE INTO messages (
        id, message_id, envelope_from, envelope_to, sender_name, sender_address,
        subject, sent_at, received_at, in_reply_to, references_header, text_body, raw_object_key,
      mailbox_domain, folder, is_set_aside, is_reply_later
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
        ?,
        (SELECT folder FROM sender_rules WHERE mailbox_domain = ? AND sender_address = ?),
        'Screener'
      ), ?, ?)
    `).bind(
      id,
      messageId,
      envelope.from,
      envelope.to,
      sender?.name || '',
      senderAddress,
      parsed.subject?.trim() || '(sans objet)',
      sentAt,
      new Date().toISOString(),
      parsed.inReplyTo || null,
      parsed.references || null,
      parsed.text || '',
      rawObjectKey,
      mailboxDomain,
      replyLaterFolder ?? (replyBelongsToSetAsideThread || replyLinkLookupFailed || replyLaterLinkLookupFailed ? 'Imbox' : null),
      mailboxDomain,
      senderAddress,
      replyBelongsToSetAsideThread ? 1 : 0,
      replyLaterFolder ? 1 : 0,
    ),
    ...attachmentRows.map(attachment => bindings.DB.prepare(`
      INSERT OR IGNORE INTO attachments (
        id, message_id, filename, mime_type, size_bytes, object_key, content_id, disposition
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM messages WHERE id = ? AND message_id = ?
      )
    `).bind(
      attachment.id,
      attachment.messageId,
      attachment.filename,
      attachment.mimeType,
      attachment.sizeBytes,
      attachment.objectKey,
      attachment.contentId,
      attachment.disposition,
      id,
      messageId,
    )),
  ]

  const results = await bindings.DB.batch(statements)
  if (results[0]?.meta.changes !== 1) {
    const existingMessage = await bindings.DB
      .prepare('SELECT id FROM messages WHERE message_id = ?')
      .bind(messageId)
      .first<{ id: string }>()

    if (existingMessage) {
      // Different raw deliveries can share a Message-ID. Once D1 confirms
      // another row won the race, remove only this delivery's unique R2 keys.
      if (existingMessage.id !== id) {
        const orphanedKeys = [rawObjectKey, ...attachmentRows.map(attachment => attachment.objectKey)]
        await Promise.all(orphanedKeys.map(async key => {
          try {
            await bindings.MAIL_STORE.delete(key)
          } catch (error) {
            console.error('[courrier] Could not remove an R2 object from a duplicate delivery.', { key, error })
          }
        }))
        return { id: existingMessage.id, duplicate: true }
      }

      // Another identical delivery inserted the same content after the first
      // lookup. Its classification was written by the winning insert.
      return { id: existingMessage.id, duplicate: true }
    } else {
      throw new Error('D1 did not store the incoming email and no existing Message-ID was found.')
    }
  }

  return { id, duplicate: false }
}
