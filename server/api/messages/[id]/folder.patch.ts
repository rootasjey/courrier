import {
  getThreadGrouping,
  type ManualThreadMergeMember,
  type ThreadableMessage,
} from '../../../utils/threading'

type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'

type ClassificationBindings = {
  DB?: D1Database
}

const folders = new Set<MailFolder>(['Imbox', 'The Feed', 'Paper Trail'])

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as ClassificationBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const body = await readBody<{ folder?: unknown }>(event)
  if (typeof body?.folder !== 'string' || !folders.has(body.folder as MailFolder)) {
    throw createError({ statusCode: 400, statusMessage: 'Boîte de destination invalide.' })
  }

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to, references_header
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail')
    `).all<ThreadableMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
    `).all<ManualThreadMergeMember>(),
  ])

  const message = messageResult.results.find(row => row.id === messageId)

  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  }

  const grouping = getThreadGrouping(messageResult.results, mergeResult.results)
  if (grouping.manualMergeIds.get(messageId)?.length) {
    throw createError({ statusCode: 409, statusMessage: 'Ce message appartient à une conversation fusionnée. Sépare les fils avant de le déplacer seul.' })
  }

  await bindings.DB.prepare(`
    UPDATE messages SET folder = ? WHERE id = ?
  `).bind(body.folder, messageId).run()

  return { folder: body.folder }
})
