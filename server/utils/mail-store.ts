import PostalMime, { type Address, type Attachment } from 'postal-mime'

export type MailStorageBindings = {
  DB: D1Database
  MAIL_STORE: R2Bucket
}

export type IncomingEnvelope = {
  from: string
  to: string
}

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

export async function storeIncomingEmail(
  rawEmail: ArrayBuffer,
  envelope: IncomingEnvelope,
  bindings: MailStorageBindings,
) {
  const parsed = await PostalMime.parse(rawEmail)
  const contentHash = await sha256(rawEmail)
  const messageId = parsed.messageId?.trim() || `<${contentHash}@courrier.local>`
  const existing = await bindings.DB
    .prepare('SELECT id FROM messages WHERE message_id = ?')
    .bind(messageId)
    .first<{ id: string }>()

  if (existing) return { id: existing.id, duplicate: true }

  const id = contentHash
  const rawObjectKey = `messages/${id}/original.eml`
  const sender = flattenAddresses(parsed.from)[0]
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
        subject, sent_at, received_at, in_reply_to, references_header, text_body, raw_object_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      messageId,
      envelope.from,
      envelope.to,
      sender?.name || '',
      sender?.address || envelope.from,
      parsed.subject?.trim() || '(sans objet)',
      sentAt,
      new Date().toISOString(),
      parsed.inReplyTo || null,
      parsed.references || null,
      parsed.text || '',
      rawObjectKey,
    ),
    ...attachmentRows.map(attachment => bindings.DB.prepare(`
      INSERT OR IGNORE INTO attachments (
        id, message_id, filename, mime_type, size_bytes, object_key, content_id, disposition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      attachment.id,
      attachment.messageId,
      attachment.filename,
      attachment.mimeType,
      attachment.sizeBytes,
      attachment.objectKey,
      attachment.contentId,
      attachment.disposition,
    )),
  ]

  await bindings.DB.batch(statements)
  return { id, duplicate: false }
}
