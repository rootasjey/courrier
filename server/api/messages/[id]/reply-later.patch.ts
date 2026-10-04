import type { MailStorageBindings } from '../../../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../../utils/threading.ts'

type ReplyLaterMessage = ThreadableMessage & {
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  is_set_aside: number
  is_reply_later: number
  trashed_at: string | null
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant de message manquant.' })

  const body = await readBody<{ isReplyLater?: unknown }>(event)
  if (typeof body?.isReplyLater !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Le statut Reply Later est invalide.' })
  }

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, is_set_aside, is_reply_later, trashed_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail') AND trashed_at IS NULL
    `).all<ReplyLaterMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  const selected = messageResult.results.find(message => message.id === id)
  if (!selected) throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })

  const grouping = getThreadGrouping(messageResult.results, mergeResult.results)
  const selectedThreadId = grouping.threadIds.get(selected.id)
  const threadMessages = messageResult.results.filter(message => message.mailbox_domain === selected.mailbox_domain
    && message.folder === selected.folder
    && grouping.threadIds.get(message.id) === selectedThreadId)

  if (!threadMessages.length) throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable.' })
  if (body.isReplyLater && threadMessages.some(message => message.is_set_aside)) {
    throw createError({ statusCode: 409, statusMessage: 'Une conversation ne peut pas être à la fois dans Reply Later et Set Aside.' })
  }

  const affectedIds = threadMessages.map(message => message.id)
  await bindings.DB.prepare(`
    UPDATE messages
    SET is_reply_later = ?
    WHERE id IN (SELECT value FROM json_each(?))
  `).bind(body.isReplyLater ? 1 : 0, JSON.stringify(affectedIds)).run()

  return {
    isReplyLater: body.isReplyLater,
    folder: selected.folder,
    affectedMessages: affectedIds.length,
  }
})
