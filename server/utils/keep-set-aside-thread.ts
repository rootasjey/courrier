import { getThreadGrouping, messageReferences, type ManualThreadMergeMember, type ThreadableMessage } from './threading.ts'

type SetAsideMessage = ThreadableMessage & {
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  is_set_aside: number
  trashed_at?: string | null
}

async function getSetAsideMessages(db: D1Database) {
  const [messageResult, mergeResult] = await Promise.all([
    db.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, is_set_aside, trashed_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail') AND trashed_at IS NULL
    `).all<SetAsideMessage>(),
    db.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  return { messages: messageResult.results, merges: mergeResult.results }
}

/** Check whether RFC reply headers point to an Inbox message that is already in Set Aside. */
export async function isLinkedToSetAsideThread(
  db: D1Database,
  mailboxDomain: string,
  inReplyTo: string | null,
  referencesHeader: string | null,
) {
  const references = [...new Set([
    ...messageReferences(inReplyTo),
    ...messageReferences(referencesHeader),
  ])]
  if (!references.length) return false

  const result = await db.prepare(`
    SELECT 1 AS linked
    FROM messages
    WHERE mailbox_domain = ? AND folder = 'Imbox' AND is_set_aside = 1
      AND trashed_at IS NULL
      AND message_id IN (SELECT value FROM json_each(?))
    LIMIT 1
  `).bind(mailboxDomain, JSON.stringify(references)).first<{ linked: number }>()

  return Boolean(result)
}

/** Keep a newly active RFC/manual-merge group in Set Aside when it is already there. */
export async function keepSetAsideThread(db: D1Database, messageId: string) {
  const { messages, merges } = await getSetAsideMessages(db)
  const current = messages.find(message => message.id === messageId)
  if (!current) return 0

  const grouping = getThreadGrouping(messages, merges)
  const threadRoot = grouping.threadIds.get(current.id)
  const members = messages.filter(message => message.mailbox_domain === current.mailbox_domain
    && message.folder === current.folder
    && grouping.threadIds.get(message.id) === threadRoot)
  if (!members.some(message => message.is_set_aside)) return 0

  await db.prepare(`
    UPDATE messages
    SET is_set_aside = 1
    WHERE id IN (SELECT value FROM json_each(?))
  `).bind(JSON.stringify(members.map(message => message.id))).run()

  return members.length
}
