import type { MailStorageBindings } from '../../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../utils/threading'

type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'
type BulkMessage = ThreadableMessage & {
  is_read: number
  is_set_aside: number
  is_reply_later: number
  trashed_at: string | null
}
type Action = 'mark-seen' | 'reply-later' | 'set-aside' | 'move' | 'trash'

const folders = new Set<MailFolder>(['Imbox', 'The Feed', 'Paper Trail'])
const sources = new Set(['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'])
const actions = new Set<Action>(['mark-seen', 'reply-later', 'set-aside', 'move', 'trash'])

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })

  const body = await readBody<{ threadIds?: unknown, source?: unknown, action?: unknown, folder?: unknown, enabled?: unknown }>(event)
  if (!Array.isArray(body?.threadIds) || !body.threadIds.length || body.threadIds.length > 100
    || body.threadIds.some(id => typeof id !== 'string' || id.length > 300)) {
    throw createError({ statusCode: 400, statusMessage: 'La sélection de conversations est invalide.' })
  }
  if (typeof body.source !== 'string' || !sources.has(body.source)) {
    throw createError({ statusCode: 400, statusMessage: 'La boîte source est invalide.' })
  }
  if (typeof body.action !== 'string' || !actions.has(body.action as Action)) {
    throw createError({ statusCode: 400, statusMessage: 'Cette action groupée est inconnue.' })
  }

  const action = body.action as Action
  const source = body.source
  const destination = body.folder
  if (action === 'move' && (typeof destination !== 'string' || !folders.has(destination as MailFolder))) {
    throw createError({ statusCode: 400, statusMessage: 'La boîte de destination est invalide.' })
  }
  if ((action === 'reply-later' || action === 'set-aside') && typeof body.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Le nouvel état de la conversation est invalide.' })
  }

  const [messagesResult, mergesResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to, references_header,
        is_read, is_set_aside, is_reply_later, trashed_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail') AND trashed_at IS NULL
    `).all<BulkMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  const messages = messagesResult.results
  const grouping = getThreadGrouping(messages, mergesResult.results)
  const selectedIds = [...new Set(body.threadIds as string[])]
  const selectedMessages = selectedIds.map(id => messages.find(message => message.id === id))
  if (selectedMessages.some(message => !message)) {
    throw createError({ statusCode: 404, statusMessage: 'Une conversation sélectionnée n’est plus disponible.' })
  }

  const threadRoots = new Set<string>()
  for (const message of selectedMessages as BulkMessage[]) {
    const isInSource = source === 'Reply Later'
      ? message.is_reply_later === 1
      : source === 'Set Aside'
        ? message.folder === 'Imbox' && message.is_set_aside === 1
        : message.folder === source && (source !== 'Imbox' || (message.is_set_aside === 0 && message.is_reply_later === 0))
    if (!isInSource) throw createError({ statusCode: 409, statusMessage: 'Une conversation a changé de boîte. Actualise la liste avant de réessayer.' })
    const root = grouping.threadIds.get(message.id)
    if (!root) throw createError({ statusCode: 409, statusMessage: 'Une conversation ne peut plus être identifiée.' })
    threadRoots.add(root)
  }

  const affectedMessages = messages.filter(message => threadRoots.has(grouping.threadIds.get(message.id) || ''))
  if (!affectedMessages.length) throw createError({ statusCode: 404, statusMessage: 'Aucune conversation sélectionnée n’est disponible.' })
  const affectedIds = affectedMessages.map(message => message.id)
  const mergeIds = [...new Set(affectedMessages.flatMap(message => grouping.manualMergeIds.get(message.id) ?? []))]
  const messageIdsJson = JSON.stringify(affectedIds)
  const mergeIdsJson = JSON.stringify(mergeIds)
  const statements: D1PreparedStatement[] = []

  if (action === 'mark-seen') {
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET is_read = 1 WHERE id IN (SELECT value FROM json_each(?))
    `).bind(messageIdsJson))
  } else if (action === 'reply-later') {
    const enabled = body.enabled as boolean
    if (enabled && affectedMessages.some(message => message.is_set_aside)) {
      throw createError({ statusCode: 409, statusMessage: 'Retire d’abord ces conversations de Set Aside.' })
    }
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET is_reply_later = ? WHERE id IN (SELECT value FROM json_each(?))
    `).bind(enabled ? 1 : 0, messageIdsJson))
  } else if (action === 'set-aside') {
    const enabled = body.enabled as boolean
    if (source !== 'Imbox' && source !== 'Set Aside') {
      throw createError({ statusCode: 409, statusMessage: 'Set Aside est réservé aux conversations de l’Inbox.' })
    }
    if (enabled && affectedMessages.some(message => message.is_reply_later)) {
      throw createError({ statusCode: 409, statusMessage: 'Une conversation ne peut pas être à la fois dans Reply Later et Set Aside.' })
    }
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET is_set_aside = ? WHERE id IN (SELECT value FROM json_each(?))
    `).bind(enabled ? 1 : 0, messageIdsJson))
  } else if (action === 'move') {
    const folder = destination as MailFolder
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET folder = ?, is_set_aside = 0, is_reply_later = 0
      WHERE id IN (SELECT value FROM json_each(?))
    `).bind(folder, messageIdsJson))
    if (mergeIds.length) {
      statements.push(bindings.DB.prepare(`
        UPDATE thread_merges SET folder = ? WHERE id IN (SELECT value FROM json_each(?))
      `).bind(folder, mergeIdsJson))
    }
  } else {
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET trashed_at = ? WHERE id IN (SELECT value FROM json_each(?))
    `).bind(new Date().toISOString(), messageIdsJson))
  }

  await bindings.DB.batch(statements)
  return { action, affectedThreads: threadRoots.size, affectedMessages: affectedIds.length }
})
