import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope, workspaceMessageScope } from '../../../utils/account-auth'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../../utils/threading'
import { createZipStream } from '../../../utils/zip-stream'

type ThreadMessageRow = ThreadableMessage & { received_at: string, sent_at: string | null }
type AttachmentRow = { id: string, filename: string, object_key: string }

function safeArchiveName(filename: string, index: number) {
  const cleaned = Array.from((filename || `piece-jointe-${index}`).replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim()).slice(0, 180).join('')
  return `${String(index).padStart(2, '0')}-${cleaned || `piece-jointe-${index}`}`
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des pièces jointes n’est pas prêt.' })
  }

  const requestedId = getRouterParam(event, 'id')
  if (!requestedId) throw createError({ statusCode: 400, statusMessage: 'Identifiant de fil manquant.' })

  const [messageResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT messages.id, messages.message_id, messages.mailbox_domain, messages.folder,
        messages.in_reply_to, messages.references_header, messages.received_at, messages.sent_at
      FROM messages
      WHERE ${workspaceMessageScope('messages', user.id)}
    `).bind(user.activeWorkspaceId).all<ThreadMessageRow>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
      WHERE ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
    `).bind(user.activeWorkspaceId).all<ManualThreadMergeMember>(),
  ])

  const requestedMessage = messageResult.results.find(message => message.id === requestedId)
  if (!requestedMessage) throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable.' })

  const grouping = getThreadGrouping(messageResult.results, mergeResult.results)
  const rootId = grouping.threadIds.get(requestedId) || requestedId
  const messageIds = messageResult.results
    .filter(message => (grouping.threadIds.get(message.id) || message.id) === rootId)
    .map(message => message.id)
  if (!messageIds.length) throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable.' })

  const attachments = await bindings.DB.prepare(`
    SELECT attachments.id, attachments.filename, attachments.object_key
    FROM attachments
    JOIN messages ON messages.id = attachments.message_id
    WHERE messages.id IN (${messageIds.map(() => '?').join(', ')})
      AND ${workspaceMessageScope('messages', user.id)}
    ORDER BY messages.received_at ASC, attachments.filename COLLATE NOCASE ASC
  `).bind(...messageIds, user.activeWorkspaceId).all<AttachmentRow>()

  if (!attachments.results.length) throw createError({ statusCode: 404, statusMessage: 'Aucune pièce jointe dans ce fil.' })

  const createdAt = new Date()
  async function* archiveEntries() {
    for (const [index, attachment] of attachments.results.entries()) {
      const object = await bindings.MAIL_STORE.get(attachment.object_key)
      if (!object?.body) throw new Error(`La pièce jointe ${attachment.id} est introuvable.`)
      yield { name: safeArchiveName(attachment.filename, index + 1), body: object.body }
    }
  }

  return new Response(createZipStream(archiveEntries(), createdAt), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="courrier-pieces-jointes-${createdAt.toISOString().slice(0, 10)}.zip"`,
      'Content-Type': 'application/zip',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
