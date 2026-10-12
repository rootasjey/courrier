export const MAX_OUTBOUND_MESSAGE_BYTES = 5 * 1024 * 1024
export const OUTBOUND_MESSAGE_SAFETY_BYTES = 64 * 1024
export const OUTBOUND_MESSAGE_BUDGET_BYTES = MAX_OUTBOUND_MESSAGE_BYTES - OUTBOUND_MESSAGE_SAFETY_BYTES

export type OutgoingEmailSizeAttachment = {
  filename: string
  mime_type?: string
  mimeType?: string
  size_bytes?: number
  sizeBytes?: number
  content_id?: string | null
  contentId?: string | null
  disposition: 'attachment' | 'inline'
}

function base64WrappedSize(byteLength: number) {
  const encodedLength = 4 * Math.ceil(byteLength / 3)
  const lineBreaks = Math.max(0, Math.ceil(encodedLength / 76) - 1)
  return encodedLength + lineBreaks * 2
}

function utf8Length(value: string) {
  return new TextEncoder().encode(value).byteLength
}

/**
 * Conservative estimate of the serialized RFC 822 message size sent to Email Service.
 * It accounts for base64 expansion and MIME line wrapping, plus headers and boundaries.
 */
export function estimateOutgoingEmailBytes(input: {
  to: string | string[]
  subject: string
  text: string
  html: string
  attachments: OutgoingEmailSizeAttachment[]
}) {
  const recipients = Array.isArray(input.to) ? input.to.join(', ') : input.to
  const subjectBytes = utf8Length(input.subject)
  const bodyBytes = base64WrappedSize(utf8Length(input.text)) + base64WrappedSize(utf8Length(input.html))
  const headersBytes = utf8Length(recipients) + Math.ceil(subjectBytes * 4 / 3) + 1_500
  const attachmentBytes = input.attachments.reduce((total, attachment) => {
    const size = attachment.size_bytes ?? attachment.sizeBytes ?? 0
    const mimeType = attachment.mime_type ?? attachment.mimeType ?? 'application/octet-stream'
    const filename = encodeURIComponent(attachment.filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    const contentId = attachment.disposition === 'inline'
      ? utf8Length(`Content-ID: <${attachment.content_id ?? attachment.contentId ?? ''}>\r\n`)
      : 0
    const attachmentHeaders = utf8Length(
      `Content-Type: ${mimeType}; name*=UTF-8''${filename}\r\n`
      + `Content-Transfer-Encoding: base64\r\n`
      + `Content-Disposition: ${attachment.disposition}; filename*=UTF-8''${filename}\r\n`
      + (contentId ? `Content-ID: <${attachment.content_id ?? attachment.contentId ?? ''}>\r\n` : '')
      + '\r\n',
    )
    return total + attachmentHeaders + base64WrappedSize(size) + 256
  }, 0)

  return headersBytes + bodyBytes + attachmentBytes + 2_048
}

export function formatEmailSize(bytes: number) {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bytes / (1024 * 1024))} Mio`
}
