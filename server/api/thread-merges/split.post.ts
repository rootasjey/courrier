import type { MailStorageBindings } from '../../utils/mail-store'
import {
  getThreadGrouping,
  type ManualThreadMergeMember,
  type ThreadableMessage,
} from '../../utils/threading'

type MergeableMessage = ThreadableMessage & {
  sent_at: string | null
  received_at: string
  trashed_at: string | null
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })
  }

  const body = await readBody<{ threadId?: unknown }>(event)
  const selectedThreadId = typeof body?.threadId === 'string' ? body.threadId : ''
  if (!selectedThreadId) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de fil manquant.' })
  }

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, sent_at, received_at, trashed_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail')
        AND trashed_at IS NULL
    `).all<MergeableMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  const messages = messageResult.results
  const grouping = getThreadGrouping(messages, mergeResult.results)
  const originalGrouping = getThreadGrouping(messages).threadIds
  const routeIds = new Map<string, string>()
  const messagesById = new Map(messages.map(message => [message.id, message]))

  for (const message of messages) {
    const root = grouping.threadIds.get(message.id) ?? message.id
    const existing = messagesById.get(routeIds.get(root) ?? '')
    const timestamp = new Date(message.sent_at || message.received_at).getTime()
    const existingTimestamp = existing
      ? new Date(existing.sent_at || existing.received_at).getTime()
      : Number.POSITIVE_INFINITY
    if (timestamp < existingTimestamp) routeIds.set(root, message.id)
  }

  const selectedRoot = [...routeIds].find(([, routeId]) => routeId === selectedThreadId)?.[0]
  if (!selectedRoot) throw createError({ statusCode: 404, statusMessage: 'Fil introuvable.' })

  const mergeIds = new Set<string>()
  for (const message of messages) {
    if (grouping.threadIds.get(message.id) !== selectedRoot) continue
    for (const mergeId of grouping.manualMergeIds.get(message.id) ?? []) mergeIds.add(mergeId)
  }
  if (!mergeIds.size) {
    throw createError({ statusCode: 404, statusMessage: 'Cette conversation ne contient pas de fusion manuelle.' })
  }

  const statements = [...mergeIds].flatMap(mergeId => [
    bindings.DB.prepare('DELETE FROM thread_merge_members WHERE merge_id = ?').bind(mergeId),
    bindings.DB.prepare('DELETE FROM thread_merges WHERE id = ?').bind(mergeId),
  ])
  await bindings.DB.batch(statements)

  const originalThreadIds = new Set(messages
    .filter(message => grouping.threadIds.get(message.id) === selectedRoot)
    .map(message => originalGrouping.get(message.id)))

  return { separated: true, originalThreads: originalThreadIds.size }
})
