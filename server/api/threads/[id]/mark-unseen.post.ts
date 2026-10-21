import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope, workspaceMessageScope } from '../../../utils/account-auth'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../../utils/threading'

type ReadableThreadMessage = ThreadableMessage & {
  is_read: number
  read_state_version: number
  mailbox_id: string
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })

  const threadId = getRouterParam(event, 'id')
  if (!threadId) throw createError({ statusCode: 400, statusMessage: 'Identifiant de fil manquant.' })

  const [messagesResult, mergesResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT messages.id, messages.message_id, messages.mailbox_domain, messages.folder,
        messages.in_reply_to, messages.references_header, messages.is_read,
        messages.read_state_version,
        mailboxes.id AS mailbox_id
      FROM messages
      JOIN mailboxes
        ON mailboxes.workspace_id = ?
        AND mailboxes.status = 'active'
        AND lower(mailboxes.address) = lower(trim(
          CASE WHEN messages.is_outgoing = 1 THEN messages.envelope_from ELSE messages.envelope_to END
        ))
      WHERE ${workspaceMessageScope('messages', user.id)}
    `).bind(user.activeWorkspaceId, user.activeWorkspaceId).all<ReadableThreadMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
      WHERE ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
    `).bind(user.activeWorkspaceId).all<ManualThreadMergeMember>(),
  ])

  const target = messagesResult.results.find(message => message.id === threadId)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Conversation introuvable.' })

  const grouping = getThreadGrouping(messagesResult.results, mergesResult.results)
  const rootId = grouping.threadIds.get(threadId) || threadId
  const unreadMessages = messagesResult.results.filter((message) =>
    (grouping.threadIds.get(message.id) || message.id) === rootId && message.is_read === 1,
  )
  if (!unreadMessages.length) return { alreadyUnseen: true }

  const messageIds = unreadMessages.map(message => message.id)
  const undoDataJson = JSON.stringify({
    version: 1,
    messages: unreadMessages.map(message => ({
      id: message.id,
      previousIsRead: 1,
      previousReadVersion: message.read_state_version,
      appliedIsRead: 0,
      appliedReadVersion: message.read_state_version + 1,
    })),
  })
  const id = crypto.randomUUID()
  const now = new Date()
  const createdAt = now.toISOString()
  const undoExpiresAt = new Date(now.getTime() + 20_000).toISOString()

  const results = await bindings.DB.batch([
    bindings.DB.prepare(`
      INSERT INTO workspace_activity (
        id, workspace_id, actor_type, actor_id, actor_label, action_type,
        target_type, target_id, mailbox_id, undo_data_json, created_at, undo_expires_at
      )
      SELECT ?, ?, 'user', ?, ?, 'thread.mark_unseen', 'thread', ?, ?, ?, ?, ?
      WHERE (
        SELECT COUNT(*) FROM json_each(?, '$.messages') AS undo_item
        JOIN messages ON messages.id = json_extract(undo_item.value, '$.id')
        WHERE messages.is_read = CAST(json_extract(undo_item.value, '$.previousIsRead') AS INTEGER)
          AND messages.read_state_version = CAST(json_extract(undo_item.value, '$.previousReadVersion') AS INTEGER)
          AND ${workspaceMessageScope('messages', user.id)}
      ) = ?
    `).bind(
      id,
      user.activeWorkspaceId,
      user.id,
      user.displayName || user.email,
      threadId,
      target.mailbox_id,
      undoDataJson,
      createdAt,
      undoExpiresAt,
      undoDataJson,
      user.activeWorkspaceId,
      messageIds.length,
    ),
    bindings.DB.prepare(`
      UPDATE messages
      SET is_read = 0, read_state_version = read_state_version + 1
      WHERE EXISTS (
        SELECT 1 FROM json_each(?, '$.messages') AS undo_item
        WHERE json_extract(undo_item.value, '$.id') = messages.id
          AND messages.is_read = CAST(json_extract(undo_item.value, '$.previousIsRead') AS INTEGER)
          AND messages.read_state_version = CAST(json_extract(undo_item.value, '$.previousReadVersion') AS INTEGER)
      )
        AND ${workspaceMessageScope('messages', user.id)}
        AND EXISTS (
          SELECT 1 FROM workspace_activity
          WHERE id = ? AND workspace_id = ? AND undone_at IS NULL
        )
    `).bind(undoDataJson, user.activeWorkspaceId, id, user.activeWorkspaceId),
  ])

  if (!results[0]?.meta.changes) {
    throw createError({ statusCode: 409, statusMessage: 'Le fil a changé. Actualise la liste avant de réessayer.' })
  }

  return { activityId: id, targetId: threadId, messageIds }
})
