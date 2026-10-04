import { getThreadGrouping, messageReferences, type ManualThreadMergeMember, type ThreadableMessage } from './threading.ts'

type ReplyLaterMessage = ThreadableMessage & {
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  is_reply_later: number
  trashed_at: string | null
}

async function getActiveMessages(db: D1Database) {
  const [messageResult, mergeResult] = await Promise.all([
    db.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, is_reply_later, trashed_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail') AND trashed_at IS NULL
    `).all<ReplyLaterMessage>(),
    db.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  return { messages: messageResult.results, merges: mergeResult.results }
}

/** Find the source mailbox of a queued conversation linked by RFC reply headers. */
export async function linkedReplyLaterFolder(
  db: D1Database,
  mailboxDomain: string,
  inReplyTo: string | null,
  referencesHeader: string | null,
) {
  const references = [...new Set([
    ...messageReferences(inReplyTo),
    ...messageReferences(referencesHeader),
  ])]
  if (!references.length) return null

  const result = await db.prepare(`
    SELECT folder
    FROM messages
    WHERE mailbox_domain = ? AND is_reply_later = 1
      AND trashed_at IS NULL
      AND message_id IN (SELECT value FROM json_each(?))
    ORDER BY received_at DESC
    LIMIT 1
  `).bind(mailboxDomain, JSON.stringify(references)).first<{ folder: 'Imbox' | 'The Feed' | 'Paper Trail' }>()

  return result?.folder ?? null
}

/** Propagate the queue state to every member of an RFC or manually merged thread. */
export async function keepReplyLaterThread(db: D1Database, messageId: string) {
  const { messages, merges } = await getActiveMessages(db)
  const current = messages.find(message => message.id === messageId)
  if (!current) return 0

  const grouping = getThreadGrouping(messages, merges)
  const threadRoot = grouping.threadIds.get(current.id)
  const members = messages.filter(message => message.mailbox_domain === current.mailbox_domain
    && message.folder === current.folder
    && grouping.threadIds.get(message.id) === threadRoot)
  if (!members.some(message => message.is_reply_later)) return 0

  await db.prepare(`
    UPDATE messages
    SET is_reply_later = 1
    WHERE id IN (SELECT value FROM json_each(?))
  `).bind(JSON.stringify(members.map(message => message.id))).run()

  return members.length
}

/** Clear Reply Later for the whole conversation after a reply has been sent. */
export async function clearReplyLaterThread(db: D1Database, messageId: string) {
  const { messages, merges } = await getActiveMessages(db)
  const current = messages.find(message => message.id === messageId)
  if (!current) return 0

  const grouping = getThreadGrouping(messages, merges)
  const threadRoot = grouping.threadIds.get(current.id)
  const members = messages.filter(message => message.mailbox_domain === current.mailbox_domain
    && message.folder === current.folder
    && grouping.threadIds.get(message.id) === threadRoot)
  if (!members.some(message => message.is_reply_later)) return 0

  await db.prepare(`
    UPDATE messages
    SET is_reply_later = 0
    WHERE id IN (SELECT value FROM json_each(?))
  `).bind(JSON.stringify(members.map(message => message.id))).run()

  return members.length
}
