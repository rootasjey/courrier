import type { MailStorageBindings } from '../../../utils/mail-store'
import {
  getThreadGrouping,
  messageIdFromThreadRoot,
  type ManualThreadMergeMember,
  type ThreadableMessage,
} from '../../../utils/threading'

type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'
type GroupMessage = ThreadableMessage & {
  folder: MailFolder
  mailbox_domain: string
  is_reply_later: number
}

const folders = new Set<MailFolder>(['Imbox', 'The Feed', 'Paper Trail'])

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const body = await readBody<{ folder?: unknown }>(event)
  if (typeof body?.folder !== 'string' || !folders.has(body.folder as MailFolder)) {
    throw createError({ statusCode: 400, statusMessage: 'Boîte de destination invalide.' })
  }

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to, references_header, is_reply_later
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail')
    `).all<GroupMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  const messages = messageResult.results
  const selected = messages.find(message => message.id === messageId)
  if (!selected) throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  if (selected.is_reply_later) {
    throw createError({ statusCode: 409, statusMessage: 'Retire d’abord cette conversation de Reply Later avant de la reclasser.' })
  }

  const grouping = getThreadGrouping(messages, mergeResult.results)
  const selectedRoot = grouping.threadIds.get(selected.id)
  if (!selectedRoot) throw createError({ statusCode: 409, statusMessage: 'Cette conversation ne peut pas être déplacée comme un groupe.' })

  const groupMessages = messages.filter(message => grouping.threadIds.get(message.id) === selectedRoot)
  if (groupMessages.some(message => message.is_reply_later)) {
    throw createError({ statusCode: 409, statusMessage: 'Retire d’abord cette conversation de Reply Later avant de la reclasser.' })
  }
  const mergeIds = new Set(groupMessages.flatMap(message => grouping.manualMergeIds.get(message.id) ?? []))
  const originalGrouping = getThreadGrouping(messages).threadIds
  const allFolderRfcGrouping = getThreadGrouping(messages.map(message => ({ ...message, folder: '__all_folders__' }))).threadIds
  const originalRoots = new Set(groupMessages
    .map(message => originalGrouping.get(message.id))
    .filter((root): root is string => Boolean(root)))

  if (!mergeIds.size || originalRoots.size < 2) {
    throw createError({ statusCode: 409, statusMessage: 'Cette conversation n’est plus réunie dans une seule boîte. Sépare les fils avant de les déplacer.' })
  }

  const originalRootMessageIds = new Set([...originalRoots].map(messageIdFromThreadRoot))
  const mergeMembers = mergeResult.results.filter(member => mergeIds.has(member.merge_id))
  const originalRfcThreads = new Set(groupMessages
    .map(message => allFolderRfcGrouping.get(message.id))
    .filter((root): root is string => Boolean(root)))
  const groupScopeIsIntact = mergeMembers.length > 0
    && mergeMembers.every(member => member.mailbox_domain === selected.mailbox_domain
      && member.folder === selected.folder
      && originalRootMessageIds.has(member.root_message_id))
  const originalMessagesAreTogether = !messages.some(message => message.mailbox_domain === selected.mailbox_domain
    && message.folder !== selected.folder
    && originalRfcThreads.has(allFolderRfcGrouping.get(message.id) ?? ''))

  if (!groupScopeIsIntact || !originalMessagesAreTogether || groupMessages.some(message => message.mailbox_domain !== selected.mailbox_domain || message.folder !== selected.folder)) {
    throw createError({ statusCode: 409, statusMessage: 'Cette conversation n’est plus réunie dans une seule boîte. Sépare les fils avant de les déplacer.' })
  }

  const folder = body.folder as MailFolder
  await bindings.DB.batch([
    bindings.DB.prepare(`
      UPDATE messages SET folder = ?
      WHERE mailbox_domain = ? AND folder = ? AND id IN (SELECT value FROM json_each(?))
    `).bind(folder, selected.mailbox_domain, selected.folder, JSON.stringify(groupMessages.map(message => message.id))),
    bindings.DB.prepare(`
      UPDATE thread_merges SET folder = ?
      WHERE mailbox_domain = ? AND folder = ? AND id IN (SELECT value FROM json_each(?))
    `).bind(folder, selected.mailbox_domain, selected.folder, JSON.stringify([...mergeIds])),
  ])

  return { folder, movedMessages: groupMessages.length }
})
