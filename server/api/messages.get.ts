import type { MailStorageBindings } from '../utils/mail-store'

type MessageRow = {
  id: string
  envelope_from: string
  envelope_to: string
  sender_name: string
  sender_address: string
  subject: string
  sent_at: string | null
  received_at: string
  text_body: string
  raw_object_key: string
}

type AttachmentRow = {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const { results } = await bindings.DB.prepare(`
    SELECT id, envelope_from, envelope_to, sender_name, sender_address, subject,
      sent_at, received_at, text_body, raw_object_key
    FROM messages
    ORDER BY COALESCE(sent_at, received_at) DESC
  `).all<MessageRow>()

  return Promise.all(results.map(async (message) => {
    const attachmentResult = await bindings.DB.prepare(`
      SELECT id, filename, mime_type, size_bytes
      FROM attachments
      WHERE message_id = ?
      ORDER BY filename COLLATE NOCASE
    `).bind(message.id).all<AttachmentRow>()

    return {
      id: message.id,
      sender: message.sender_name || message.sender_address || message.envelope_from,
      address: message.sender_address || message.envelope_from,
      subject: message.subject,
      preview: message.text_body.replace(/\s+/g, ' ').trim().slice(0, 180),
      body: message.text_body,
      date: new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      }).format(new Date(message.sent_at || message.received_at)),
      folder: 'Imbox' as const,
      initials: (message.sender_name || message.sender_address || message.envelope_from)
        .split(/[\s@._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toLocaleUpperCase('fr'))
        .join('') || '??',
      color: ['terracotta', 'blue', 'green', 'gold'][Number.parseInt(message.id.slice(0, 2), 16) % 4],
      attachments: attachmentResult.results.map(attachment => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mime_type,
        sizeBytes: attachment.size_bytes,
      })),
    }
  }))
})
