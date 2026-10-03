import type { MailStorageBindings } from '../../../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../../utils/threading'

type SetAsideMessage = ThreadableMessage & {
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  is_set_aside: number
  trashed_at: string | null
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
        references_header, is_set_aside, trashed_at
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
  const threadMessageIds = messageResult.results
    .filter(message => message.mailbox_domain === selected.mailbox_domain
      && message.folder === selected.folder
      && grouping.threadIds.get(message.id) === selectedThreadId)
    .map(message => message.id)

  if (!threadMessageIds.length) throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable.' })

  await bindings.DB.prepare(`
    UPDATE messages
    SET is_set_aside = ?
    WHERE id IN (SELECT value FROM json_each(?))
  `).bind(body.isSetAside ? 1 : 0, JSON.stringify(threadMessageIds)).run()

  return { isSetAside: body.isSetAside, affectedMessages: threadMessageIds.length }
})
