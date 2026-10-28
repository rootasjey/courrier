import PostalMime from 'postal-mime'

const MAILBOX_ADDRESS = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i
const MIME_TYPE = /^[A-Z0-9!#$&^_.+-]+\/[A-Z0-9!#$&^_.+-]+$/i
const MAX_REPLAY_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENTS = 32

type ReplayAttachment = {
  disposition: 'attachment'
  filename: string
  type: string
  content: string | ArrayBuffer | ArrayBufferView
} | {
  disposition: 'inline'
  contentId: string
  filename: string
  type: string
  content: string | ArrayBuffer | ArrayBufferView
}

export type ReplayEmailMessage = {
  from: string
  to: string
  replyTo: string
  subject: string
  headers: Record<string, string>
  text?: string
  html?: string
  attachments: ReplayAttachment[]
}

function validateMailboxAddress(address: string, description: string) {
  const localPart = address.split('@', 1)[0] ?? ''
  if (
    address.length > 254
    || !MAILBOX_ADDRESS.test(address)
    || localPart.startsWith('.')
    || localPart.endsWith('.')
    || localPart.includes('..')
  ) {
    throw new Error(description)
  }
}

function safeHeaderValue(value: string | undefined) {
  return value && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined
}

function toReplayAttachment(attachment: PostalMime.Attachment): ReplayAttachment {
  const filename = attachment.filename?.replace(/[\r\n\0]/g, ' ').trim().slice(0, 255) || 'attachment'
  const mediaType = attachment.mimeType.split(';', 1)[0]?.trim() ?? ''
  const type = MIME_TYPE.test(mediaType) ? mediaType : 'application/octet-stream'
  const contentId = attachment.contentId?.replace(/^<|>$/g, '')

  if (
    (attachment.disposition === 'inline' || attachment.related)
    && contentId
    && /^[A-Z0-9._@+-]+$/i.test(contentId)
  ) {
    return {
      disposition: 'inline',
      contentId,
      filename,
      type,
      content: attachment.content,
    }
  }

  return {
    disposition: 'attachment',
    filename,
    type,
    content: attachment.content,
  }
}

export async function createReplayEmailMessage(
  rawMessage: Uint8Array,
  senderAddress: string,
  replayFrom: string,
  destination: string,
): Promise<ReplayEmailMessage> {
  validateMailboxAddress(senderAddress, 'The original sender address cannot be used as Reply-To.')
  validateMailboxAddress(destination, 'The stored forwarding destination is not a valid mailbox address.')
  if (rawMessage.byteLength > MAX_REPLAY_BYTES) {
    throw new Error('The stored message exceeds Cloudflare Email Sending’s 5 MiB replay limit.')
  }

  const parsedMessage = await PostalMime.parse(rawMessage, { attachmentEncoding: 'arraybuffer' })
  const attachments = parsedMessage.attachments.map(toReplayAttachment)
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`The stored message exceeds Cloudflare Email Sending’s ${MAX_ATTACHMENTS}-attachment limit.`)
  }
  const text = parsedMessage.text || undefined
  const html = parsedMessage.html || undefined

  if (!text && !html && !attachments.length) {
    throw new Error('The stored message has no body or attachments to replay.')
  }

  const headers: Record<string, string> = {
    'X-Courrier-Original-From': senderAddress,
  }
  const inReplyTo = safeHeaderValue(parsedMessage.inReplyTo)
  const references = safeHeaderValue(parsedMessage.references)
  const subject = (parsedMessage.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 998) || '(sans objet)'
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo
  if (references) headers.References = references

  return {
    from: replayFrom,
    to: destination,
    replyTo: senderAddress,
    subject,
    headers,
    ...(text || html ? {} : { text: 'Ce message contient des pièces jointes.' }),
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    attachments,
  }
}
