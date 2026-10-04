import {
  getThreadGrouping,
  type ManualThreadMergeMember,
  type ThreadableMessage,
} from '../../../utils/threading.ts'

type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'
type ClassifiableMessage = ThreadableMessage & { is_reply_later: number }

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
  const folder = body.folder as MailFolder

  const pendingScreenerMessage = await bindings.DB.prepare(`
    SELECT id FROM messages
    WHERE id = ? AND folder = 'Screener' AND screener_state = 'pending' AND trashed_at IS NULL
  `).bind(messageId).first<{ id: string }>()

  if (pendingScreenerMessage) {
    const result = await bindings.DB.prepare(`
      UPDATE messages
      SET folder = ?, screener_state = 'cleared'
      WHERE id = ? AND folder = 'Screener' AND screener_state = 'pending' AND trashed_at IS NULL
    `).bind(folder, messageId).run()

    if (!result.meta.changes) {
      throw createError({ statusCode: 404, statusMessage: 'Message Screener introuvable.' })
    }

    return { folder }
  }

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to, references_header, is_reply_later
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail')
    `).all<ClassifiableMessage>(),
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
  if (message.is_reply_later) {
    throw createError({ statusCode: 409, statusMessage: 'Retire d’abord cette conversation de Reply Later avant de la reclasser.' })
  }

  const grouping = getThreadGrouping(messageResult.results, mergeResult.results)
  if (grouping.manualMergeIds.get(messageId)?.length) {
    throw createError({ statusCode: 409, statusMessage: 'Ce message appartient à une conversation fusionnée. Sépare les fils avant de le déplacer seul.' })
  }

  await bindings.DB.prepare(`
    UPDATE messages SET folder = ? WHERE id = ?
  `).bind(folder, messageId).run()

  return { folder }
})
