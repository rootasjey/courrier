import type { MailStorageBindings } from '../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember } from '../utils/threading'

type MessageRow = {
  id: string
  envelope_from: string
  envelope_to: string
  sender_name: string
  sender_address: string
  subject: string
  folder: 'Imbox' | 'The Feed' | 'Paper Trail' | 'Screener'
  screener_state: 'pending' | 'cleared' | 'blocked'
  trashed_at: string | null
  has_sender_rule: number
  is_read: number
  is_set_aside: number
  sent_at: string | null
  received_at: string
  text_body: string
  raw_object_key: string
  message_id: string
  in_reply_to: string | null
  references_header: string | null
  mailbox_domain: string
  is_outgoing: number
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

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
    SELECT messages.id, messages.envelope_from, messages.envelope_to,
      messages.sender_name, messages.sender_address, messages.subject,
      messages.sent_at, messages.received_at, messages.text_body, messages.is_read, messages.trashed_at,
      messages.raw_object_key, messages.folder, messages.screener_state, messages.message_id,
      messages.in_reply_to, messages.references_header, messages.mailbox_domain,
      messages.is_outgoing, messages.is_set_aside,
      CASE WHEN sender_rules.sender_address IS NULL THEN 0 ELSE 1 END AS has_sender_rule
    FROM messages
    LEFT JOIN sender_rules
      ON sender_rules.mailbox_domain = messages.mailbox_domain
      AND sender_rules.sender_address = lower(trim(messages.sender_address))
    ORDER BY COALESCE(messages.sent_at, messages.received_at) DESC
  `).all<MessageRow>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])
  const results = messageResult.results
  const { threadIds, manualMergeIds } = getThreadGrouping(results, mergeResult.results)
  const threadRouteIds = new Map<string, string>()
  const messagesById = new Map(results.map(message => [message.id, message]))

  for (const message of results) {
    const threadRoot = threadIds.get(message.id) || message.id
    const existingMessage = messagesById.get(threadRouteIds.get(threadRoot) ?? '')
    const timestamp = new Date(message.sent_at || message.received_at).getTime()
    const existingTimestamp = existingMessage
      ? new Date(existingMessage.sent_at || existingMessage.received_at).getTime()
      : Number.POSITIVE_INFINITY

    if (timestamp < existingTimestamp) threadRouteIds.set(threadRoot, message.id)
  }

  return Promise.all(results.map(async (message) => {
    const attachmentResult = await bindings.DB.prepare(`
      SELECT id, filename, mime_type, size_bytes
      FROM attachments
      WHERE message_id = ?
      ORDER BY filename COLLATE NOCASE
    `).bind(message.id).all<AttachmentRow>()

    return {
      id: message.id,
      threadId: threadRouteIds.get(threadIds.get(message.id) || message.id) || message.id,
      manualMergeIds: manualMergeIds.get(message.id) ?? [],
      sender: message.sender_name || message.sender_address || message.envelope_from,
      address: message.sender_address || message.envelope_from,
      recipient: message.is_outgoing ? message.envelope_to : '',
      isOutgoing: Boolean(message.is_outgoing),
      subject: message.subject,
      preview: message.text_body.replace(/\s+/g, ' ').trim().slice(0, 180),
      body: message.text_body,
      timestamp: new Date(message.sent_at || message.received_at).toISOString(),
      date: new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      }).format(new Date(message.sent_at || message.received_at)),
      folder: message.trashed_at ? 'Trash' : message.folder,
      screenerState: message.screener_state,
      hasSenderRule: Boolean(message.has_sender_rule),
      isRead: Boolean(message.is_read),
      isSetAside: Boolean(message.is_set_aside),
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
