import type { MailStorageBindings } from '../../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember, type ThreadableMessage } from '../../utils/threading'
import { getWorkspaceUserFromContext, requireWorkspacePermission, workspaceDomainScope } from '../../utils/account-auth'

type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'
type BulkMessage = ThreadableMessage & {
  is_read: number
  read_state_version: number
  mailbox_id: string
  is_set_aside: number
  is_reply_later: number
  trashed_at: string | null
}
type Action = 'mark-seen' | 'mark-unseen' | 'reply-later' | 'set-aside' | 'move' | 'trash'

const folders = new Set<MailFolder>(['Imbox', 'The Feed', 'Paper Trail'])
const sources = new Set(['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'])
const actions = new Set<Action>(['mark-seen', 'mark-unseen', 'reply-later', 'set-aside', 'move', 'trash'])

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
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
  if (action === 'trash') await requireWorkspacePermission(event, 'mail.trash')
  if (action === 'mark-unseen') await requireWorkspacePermission(event, 'mail.classify')
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
      SELECT messages.id, messages.message_id, messages.mailbox_domain, messages.folder,
        messages.in_reply_to, messages.references_header, messages.is_read,
        messages.read_state_version, messages.is_set_aside, messages.is_reply_later,
        messages.trashed_at, mailboxes.id AS mailbox_id
      FROM messages
      JOIN mailboxes
        ON mailboxes.workspace_id = ?
        AND mailboxes.status = 'active'
        AND lower(mailboxes.address) = lower(trim(
          CASE WHEN messages.is_outgoing = 1 THEN messages.envelope_from ELSE messages.envelope_to END
        ))
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail') AND trashed_at IS NULL
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(user.activeWorkspaceId, user.activeWorkspaceId).all<BulkMessage>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
      WHERE ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
    `).bind(user.activeWorkspaceId).all<ManualThreadMergeMember>(),
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
  const unreadActivityIds: string[] = []

  if (action === 'mark-unseen') {
    const createdAt = new Date().toISOString()
    const undoExpiresAt = new Date(Date.now() + 20_000).toISOString()
    for (const root of threadRoots) {
      const threadMessages = affectedMessages.filter(message => grouping.threadIds.get(message.id) === root)
      const unreadMessages = threadMessages.filter(message => message.is_read === 1)
      if (!unreadMessages.length) continue

      const target = selectedMessages.find(message => grouping.threadIds.get(message!.id) === root)
      if (!target) continue
      const activityId = crypto.randomUUID()
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
      unreadActivityIds.push(activityId)
      statements.push(bindings.DB.prepare(`
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
            AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
        ) = ?
      `).bind(
        activityId,
        user.activeWorkspaceId,
        user.id,
        user.displayName || user.email,
        target.id,
        target.mailbox_id,
        undoDataJson,
        createdAt,
        undoExpiresAt,
        undoDataJson,
        user.activeWorkspaceId,
        unreadMessages.length,
      ))
    }
  }

  if (action === 'mark-seen') {
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET is_read = 1,
        read_state_version = read_state_version + CASE WHEN is_read != 1 THEN 1 ELSE 0 END
      WHERE id IN (SELECT value FROM json_each(?))
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(messageIdsJson, user.activeWorkspaceId))
  } else if (action === 'mark-unseen') {
    if (unreadActivityIds.length) {
      statements.push(bindings.DB.prepare(`
        UPDATE messages
        SET is_read = 0, read_state_version = read_state_version + 1
        WHERE id IN (
          SELECT json_extract(undo_item.value, '$.id')
          FROM workspace_activity AS activity,
            json_each(activity.undo_data_json, '$.messages') AS undo_item
          WHERE activity.id IN (SELECT value FROM json_each(?))
            AND activity.workspace_id = ?
            AND messages.is_read = CAST(json_extract(undo_item.value, '$.previousIsRead') AS INTEGER)
            AND messages.read_state_version = CAST(json_extract(undo_item.value, '$.previousReadVersion') AS INTEGER)
        )
          AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
      `).bind(JSON.stringify(unreadActivityIds), user.activeWorkspaceId, user.activeWorkspaceId))
    }
  } else if (action === 'reply-later') {
    const enabled = body.enabled as boolean
    if (enabled && affectedMessages.some(message => message.is_set_aside)) {
      throw createError({ statusCode: 409, statusMessage: 'Retire d’abord ces conversations de Set Aside.' })
    }
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET is_reply_later = ? WHERE id IN (SELECT value FROM json_each(?))
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(enabled ? 1 : 0, messageIdsJson, user.activeWorkspaceId))
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
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(enabled ? 1 : 0, messageIdsJson, user.activeWorkspaceId))
  } else if (action === 'move') {
    const folder = destination as MailFolder
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET folder = ?, is_set_aside = 0, is_reply_later = 0
      WHERE id IN (SELECT value FROM json_each(?))
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(folder, messageIdsJson, user.activeWorkspaceId))
    if (mergeIds.length) {
      statements.push(bindings.DB.prepare(`
        UPDATE thread_merges SET folder = ? WHERE id IN (SELECT value FROM json_each(?))
          AND ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
      `).bind(folder, mergeIdsJson, user.activeWorkspaceId))
    }
  } else {
    statements.push(bindings.DB.prepare(`
      UPDATE messages SET trashed_at = ? WHERE id IN (SELECT value FROM json_each(?))
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(new Date().toISOString(), messageIdsJson, user.activeWorkspaceId))
  }

  if (!statements.length) {
    return { action, affectedThreads: threadRoots.size, affectedMessages: affectedIds.length }
  }

  await bindings.DB.batch(statements)
  return { action, affectedThreads: threadRoots.size, affectedMessages: affectedIds.length }
})
