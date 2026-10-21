import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceMessageScope } from '../../../utils/account-auth'

type UndoSnapshot = {
  version: 1
  messages: {
    id: string
    previousIsRead: 0 | 1
    previousReadVersion: number
    appliedIsRead: 0 | 1
    appliedReadVersion: number
  }[]
}

type ActivityUndoRow = {
  id: string
  action_type: string
  mailbox_id: string
  undo_data_json: string | null
  undo_expires_at: string | null
  undone_at: string | null
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })

  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant d’action invalide.' })
  }

  const activity = await bindings.DB.prepare(`
    SELECT activity.id, activity.action_type, activity.mailbox_id,
      activity.undo_data_json, activity.undo_expires_at, activity.undone_at
    FROM workspace_activity AS activity
    WHERE activity.id = ? AND activity.workspace_id = ?
      AND EXISTS (
        SELECT 1 FROM mailbox_access_grants AS activity_access
        WHERE activity_access.workspace_id = activity.workspace_id
          AND activity_access.mailbox_id = activity.mailbox_id
          AND activity_access.user_id = ?
          AND activity_access.status = 'active'
      )
    LIMIT 1
  `).bind(id, user.activeWorkspaceId, user.id).first<ActivityUndoRow>()

  if (!activity) throw createError({ statusCode: 404, statusMessage: 'Action introuvable.' })
  if (activity.action_type !== 'thread.mark_unseen'
    || activity.undone_at
    || !activity.undo_data_json
    || !activity.undo_expires_at
    || activity.undo_expires_at <= new Date().toISOString()) {
    throw createError({ statusCode: 409, statusMessage: 'Cette action ne peut plus être annulée.' })
  }

  const snapshot = parseUndoSnapshot(activity.undo_data_json)
  if (!snapshot) throw createError({ statusCode: 409, statusMessage: 'Les données d’annulation ne sont plus disponibles.' })

  const now = new Date().toISOString()
  const results = await bindings.DB.batch([
    bindings.DB.prepare(`
      UPDATE workspace_activity
      SET undone_at = ?
      WHERE id = ? AND workspace_id = ? AND undone_at IS NULL
        AND undo_expires_at > ? AND undo_data_json IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM mailbox_access_grants AS activity_access
          WHERE activity_access.workspace_id = workspace_activity.workspace_id
            AND activity_access.mailbox_id = workspace_activity.mailbox_id
            AND activity_access.user_id = ?
            AND activity_access.status = 'active'
        )
        AND (
          SELECT COUNT(*)
          FROM json_each(workspace_activity.undo_data_json, '$.messages') AS undo_item
          JOIN messages AS current_message
            ON current_message.id = json_extract(undo_item.value, '$.id')
          WHERE current_message.is_read = CAST(json_extract(undo_item.value, '$.appliedIsRead') AS INTEGER)
            AND current_message.read_state_version = CAST(json_extract(undo_item.value, '$.appliedReadVersion') AS INTEGER)
            AND ${workspaceMessageScope('current_message', user.id)}
        ) = json_array_length(json_extract(workspace_activity.undo_data_json, '$.messages'))
    `).bind(now, id, user.activeWorkspaceId, now, user.id, user.activeWorkspaceId),
    bindings.DB.prepare(`
      UPDATE messages
      SET is_read = CAST((
            SELECT json_extract(undo_item.value, '$.previousIsRead')
            FROM workspace_activity AS activity,
              json_each(activity.undo_data_json, '$.messages') AS undo_item
            WHERE activity.id = ? AND activity.undone_at = ?
              AND json_extract(undo_item.value, '$.id') = messages.id
          ) AS INTEGER),
          read_state_version = read_state_version + 1
      WHERE EXISTS (
        SELECT 1
        FROM workspace_activity AS activity,
          json_each(activity.undo_data_json, '$.messages') AS undo_item
        WHERE activity.id = ? AND activity.undone_at = ?
          AND json_extract(undo_item.value, '$.id') = messages.id
          AND messages.read_state_version = CAST(json_extract(undo_item.value, '$.appliedReadVersion') AS INTEGER)
          AND messages.is_read = CAST(json_extract(undo_item.value, '$.appliedIsRead') AS INTEGER)
      )
        AND ${workspaceMessageScope('messages', user.id)}
    `).bind(id, now, id, now, user.activeWorkspaceId),
    bindings.DB.prepare(`
      UPDATE workspace_activity
      SET undo_data_json = NULL
      WHERE id = ? AND workspace_id = ? AND undone_at = ?
    `).bind(id, user.activeWorkspaceId, now),
  ])

  if (!results[0]?.meta.changes) {
    throw createError({ statusCode: 409, statusMessage: 'Le fil a changé ou cette action a déjà été annulée.' })
  }

  return { id, undoneAt: now, restoredMessageIds: snapshot.messages.map(message => message.id) }
})

function parseUndoSnapshot(value: string): UndoSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<UndoSnapshot>
    if (parsed.version !== 1 || !Array.isArray(parsed.messages) || !parsed.messages.length) return null
    if (parsed.messages.length > 500) return null
    if (parsed.messages.some(message =>
      !message || typeof message.id !== 'string' || message.id.length > 300
      || (message.previousIsRead !== 0 && message.previousIsRead !== 1)
      || !Number.isInteger(message.previousReadVersion) || message.previousReadVersion < 0
      || (message.appliedIsRead !== 0 && message.appliedIsRead !== 1)
      || !Number.isInteger(message.appliedReadVersion) || message.appliedReadVersion !== message.previousReadVersion + 1,
    )) return null
    return parsed as UndoSnapshot
  } catch {
    return null
  }
}
