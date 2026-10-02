import type { MailStorageBindings } from '../utils/mail-store'
import {
  getThreadGrouping,
  messageIdFromThreadRoot,
  type ManualThreadMergeMember,
  type ThreadableMessage,
} from '../utils/threading'

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

  const body = await readBody<{ threadIds?: unknown }>(event)
  const threadIds = Array.isArray(body?.threadIds)
    ? [...new Set(body.threadIds.filter((id): id is string => typeof id === 'string' && id.trim()))]
    : []
  if (threadIds.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Sélectionne au moins deux fils distincts.' })
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
  const { threadIds: effectiveThreadIds } = getThreadGrouping(messages, mergeResult.results)
  const routeIds = new Map<string, string>()
  const messagesById = new Map(messages.map(message => [message.id, message]))

  for (const message of messages) {
    const root = effectiveThreadIds.get(message.id) ?? message.id
    const existing = messagesById.get(routeIds.get(root) ?? '')
    const timestamp = new Date(message.sent_at || message.received_at).getTime()
    const existingTimestamp = existing
      ? new Date(existing.sent_at || existing.received_at).getTime()
      : Number.POSITIVE_INFINITY
    if (timestamp < existingTimestamp) routeIds.set(root, message.id)
  }

  const rootByRouteId = new Map([...routeIds].map(([root, routeId]) => [routeId, root]))
  const selectedRoots = new Set<string>()
  for (const id of threadIds) {
    const root = rootByRouteId.get(id)
    if (!root) throw createError({ statusCode: 404, statusMessage: 'Un des fils sélectionnés est introuvable.' })
    selectedRoots.add(root)
  }
  if (selectedRoots.size < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Sélectionne au moins deux fils distincts.' })
  }

  const selectedMessages = messages.filter(message => selectedRoots.has(effectiveThreadIds.get(message.id) ?? ''))
  const scopes = new Set(selectedMessages.map(message => `${message.mailbox_domain}\u0000${message.folder}`))
  if (scopes.size !== 1) {
    throw createError({ statusCode: 400, statusMessage: 'Les fils doivent appartenir à la même boîte et au même dossier.' })
  }

  const automaticThreadIds = getThreadGrouping(messages).threadIds
  const rootMessageIds = [...new Set(selectedMessages.map((message) => {
    const root = automaticThreadIds.get(message.id)
    return root ? messageIdFromThreadRoot(root) : ''
  }).filter(Boolean))]
  if (rootMessageIds.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Ces fils sont déjà regroupés.' })
  }

  const [mailboxDomain, folder] = [...scopes][0]!.split('\u0000')
  const mergeId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const statements = [
    bindings.DB.prepare(`
      INSERT INTO thread_merges (id, mailbox_domain, folder, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(mergeId, mailboxDomain, folder, createdAt),
    ...rootMessageIds.map(rootMessageId => bindings.DB.prepare(`
      INSERT INTO thread_merge_members (merge_id, root_message_id)
      VALUES (?, ?)
    `).bind(mergeId, rootMessageId)),
  ]
  await bindings.DB.batch(statements)

  return { mergeId, mergedThreads: selectedRoots.size }
})
