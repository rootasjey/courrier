import type { MailStorageBindings } from '../../../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../../utils/threading.ts'
import { resolveSetAsideRestoreFolder } from '../../../utils/set-aside-restore.ts'

type SetAsideMessage = ThreadableMessage & {
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  is_set_aside: number
  sender_address: string | null
  is_outgoing: number
  trashed_at: string | null
}

type SenderRule = {
  sender_address: string
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'La base de messages n’est pas disponible.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant de message manquant.' })

  const body = await readBody<{ isSetAside?: unknown }>(event)
  if (typeof body?.isSetAside !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Le statut Set Aside est invalide.' })
  }

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, is_set_aside, sender_address, is_outgoing, trashed_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail') AND trashed_at IS NULL
    `).all<SetAsideMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  const selected = messageResult.results.find(message => message.id === id)
  if (!selected) throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  if (selected.folder !== 'Imbox') {
    throw createError({ statusCode: 409, statusMessage: 'Set Aside est réservé aux messages de l’Inbox.' })
  }

  const grouping = getThreadGrouping(messageResult.results, mergeResult.results)
  const selectedThreadId = grouping.threadIds.get(selected.id)
  const threadMessages = messageResult.results
    .filter(message => message.mailbox_domain === selected.mailbox_domain
      && message.folder === selected.folder
      && grouping.threadIds.get(message.id) === selectedThreadId)

  if (!threadMessages.length) throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable.' })

  let destinationFolder = selected.folder
  if (!body.isSetAside && threadMessages.some(message => message.is_set_aside)) {
    const senderAddresses = [...new Set(threadMessages
      .filter(message => !message.is_outgoing)
      .map(message => message.sender_address?.trim().toLocaleLowerCase('en-US'))
      .filter((address): address is string => Boolean(address)))]

    if (senderAddresses.length) {
      const senderRulesResult = await bindings.DB.prepare(`
        SELECT lower(trim(sender_address)) AS sender_address, folder
        FROM sender_rules
        WHERE mailbox_domain = ?
          AND lower(trim(sender_address)) IN (SELECT value FROM json_each(?))
      `).bind(selected.mailbox_domain, JSON.stringify(senderAddresses)).all<SenderRule>()
      const senderRules = new Map(senderRulesResult.results.map(rule => [rule.sender_address, rule.folder]))
      destinationFolder = resolveSetAsideRestoreFolder(selected.folder, senderAddresses, senderRules)
    }
  }

  const threadMessageIds = threadMessages.map(message => message.id)
  const statements = [bindings.DB.prepare(`
    UPDATE messages
    SET is_set_aside = ?, folder = ?
    WHERE id IN (SELECT value FROM json_each(?))
  `).bind(body.isSetAside ? 1 : 0, destinationFolder, JSON.stringify(threadMessageIds))]

  if (!body.isSetAside && destinationFolder !== selected.folder) {
    const mergeIds = [...new Set(threadMessages.flatMap(message => grouping.manualMergeIds.get(message.id) ?? []))]
    statements.push(...mergeIds.map(mergeId => bindings.DB.prepare(`
      UPDATE thread_merges SET folder = ? WHERE id = ? AND mailbox_domain = ?
    `).bind(destinationFolder, mergeId, selected.mailbox_domain)))
  }

  await bindings.DB.batch(statements)

  return { isSetAside: body.isSetAside, folder: destinationFolder, affectedMessages: threadMessageIds.length }
})
