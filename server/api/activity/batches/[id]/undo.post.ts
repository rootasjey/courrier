import type { MailStorageBindings } from '../../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceMessageScope } from '../../../../utils/account-auth'

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
  has_access: number
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })

  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant d’action invalide.' })
  }

  const rowsResult = await bindings.DB.prepare(`
    SELECT activity.id, activity.action_type, activity.mailbox_id,
      activity.undo_data_json, activity.undo_expires_at, activity.undone_at,
      EXISTS (
        SELECT 1 FROM mailbox_access_grants AS activity_access
        WHERE activity_access.workspace_id = activity.workspace_id
          AND activity_access.mailbox_id = activity.mailbox_id
          AND activity_access.user_id = ?
          AND activity_access.status = 'active'
      ) AS has_access
    FROM workspace_activity AS activity
    WHERE activity.batch_id = ? AND activity.workspace_id = ?
    ORDER BY activity.id
  `).bind(user.id, id, user.activeWorkspaceId).all<ActivityUndoRow>()

  const rows = rowsResult.results
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Action introuvable.' })
  if (rows.length > 100 || rows.some(row => !row.has_access)) {
    throw createError({ statusCode: 409, statusMessage: 'Toutes les conversations de cette action ne sont plus accessibles.' })
  }

  const now = new Date().toISOString()
  const snapshots: UndoSnapshot[] = []
  for (const row of rows) {
    if (row.action_type !== 'thread.mark_unseen'
      || row.undone_at
      || !row.undo_data_json
      || !row.undo_expires_at
      || row.undo_expires_at <= now) {
      throw createError({ statusCode: 409, statusMessage: 'Toutes les conversations de cette action ne peuvent plus être annulées.' })
    }
    const snapshot = parseUndoSnapshot(row.undo_data_json)
    if (!snapshot) {
      throw createError({ statusCode: 409, statusMessage: 'Les données d’annulation ne sont plus disponibles.' })
    }
    snapshots.push(snapshot)
  }

  const expectedMessageCount = snapshots.reduce((count, snapshot) => count + snapshot.messages.length, 0)
  const scopeOnSnapshot = workspaceMessageScope('snapshot_message', user.id)
  const statements = [
    bindings.DB.prepare(`
      UPDATE workspace_activity
      SET undone_at = ?
      WHERE batch_id = ? AND workspace_id = ?
        AND (
          SELECT COUNT(*) FROM workspace_activity AS batch_all
          WHERE batch_all.batch_id = ? AND batch_all.workspace_id = ?
        ) = ?
        AND (
          SELECT COUNT(*) FROM workspace_activity AS batch_check
          WHERE batch_check.batch_id = ? AND batch_check.workspace_id = ?
            AND batch_check.action_type = 'thread.mark_unseen'
            AND batch_check.undone_at IS NULL
            AND batch_check.undo_data_json IS NOT NULL
            AND batch_check.undo_expires_at > ?
            AND EXISTS (
              SELECT 1 FROM mailbox_access_grants AS activity_access
              WHERE activity_access.workspace_id = batch_check.workspace_id
                AND activity_access.mailbox_id = batch_check.mailbox_id
                AND activity_access.user_id = ?
                AND activity_access.status = 'active'
            )
            AND (
              SELECT COUNT(*)
              FROM json_each(batch_check.undo_data_json, '$.messages') AS undo_item
              JOIN messages AS snapshot_message
                ON snapshot_message.id = json_extract(undo_item.value, '$.id')
              WHERE snapshot_message.is_read = CAST(json_extract(undo_item.value, '$.appliedIsRead') AS INTEGER)
                AND snapshot_message.read_state_version = CAST(json_extract(undo_item.value, '$.appliedReadVersion') AS INTEGER)
                AND ${scopeOnSnapshot}
            ) = json_array_length(json_extract(batch_check.undo_data_json, '$.messages'))
        ) = ?
    `).bind(
      now,
      id,
      user.activeWorkspaceId,
      id,
      user.activeWorkspaceId,
      rows.length,
      id,
      user.activeWorkspaceId,
      now,
      user.id,
      user.activeWorkspaceId,
      rows.length,
    ),
    bindings.DB.prepare(`
      UPDATE messages
      SET is_read = CAST((
            SELECT json_extract(undo_item.value, '$.previousIsRead')
            FROM workspace_activity AS activity,
              json_each(activity.undo_data_json, '$.messages') AS undo_item
            WHERE activity.batch_id = ? AND activity.workspace_id = ? AND activity.undone_at = ?
              AND json_extract(undo_item.value, '$.id') = messages.id
          ) AS INTEGER),
          read_state_version = read_state_version + 1
      WHERE EXISTS (
        SELECT 1
        FROM workspace_activity AS activity,
          json_each(activity.undo_data_json, '$.messages') AS undo_item
        WHERE activity.batch_id = ? AND activity.workspace_id = ? AND activity.undone_at = ?
          AND json_extract(undo_item.value, '$.id') = messages.id
          AND messages.read_state_version = CAST(json_extract(undo_item.value, '$.appliedReadVersion') AS INTEGER)
          AND messages.is_read = CAST(json_extract(undo_item.value, '$.appliedIsRead') AS INTEGER)
      )
        AND ${workspaceMessageScope('messages', user.id)}
    `).bind(
      id,
      user.activeWorkspaceId,
      now,
      id,
      user.activeWorkspaceId,
      now,
      user.activeWorkspaceId,
    ),
    bindings.DB.prepare(`
      UPDATE workspace_activity
      SET undo_data_json = NULL
      WHERE batch_id = ? AND workspace_id = ? AND undone_at = ?
    `).bind(id, user.activeWorkspaceId, now),
  ]

  const results = await bindings.DB.batch(statements)
  if (results[0]?.meta.changes !== rows.length || results[1]?.meta.changes !== expectedMessageCount) {
    throw createError({ statusCode: 409, statusMessage: 'Une conversation a changé ou cette action a déjà été annulée.' })
  }

  return {
    id,
    undoneAt: now,
    restoredMessageCount: expectedMessageCount,
    restoredThreadCount: rows.length,
  }
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
