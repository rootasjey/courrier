import type { MailStorageBindings } from '../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceMessageScope } from '../utils/account-auth'
import { workspaceActivityCutoff } from '../utils/workspace-activity'

type ActivityRow = {
  id: string
  actor_type: 'user' | 'agent' | 'system'
  actor_label: string
  action_type: string
  target_id: string
  target_label: string | null
  created_at: string
  undo_expires_at: string | null
  undone_at: string | null
  undo_data_json: string | null
  undo_state_valid: number
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })

  const query = getQuery(event)
  const requestedLimit = Number(query.limit)
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 50)
    : 8
  const cursor = typeof query.cursor === 'string' ? parseActivityCursor(query.cursor) : null
  if (query.cursor && !cursor) {
    throw createError({ statusCode: 400, statusMessage: 'Le curseur de l’historique est invalide.' })
  }

  const now = new Date()
  const cutoff = workspaceActivityCutoff(now)
  const canClassify = await bindings.DB.prepare(`
    SELECT 1 AS allowed
    FROM workspace_memberships wm
    JOIN role_permissions rp ON rp.role = wm.role AND rp.permission = 'mail.classify'
    WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
    LIMIT 1
  `).bind(user.id, user.activeWorkspaceId).first<{ allowed: number }>()

  const cursorSql = cursor
    ? 'AND (activity.created_at < ? OR (activity.created_at = ? AND activity.id < ?))'
    : ''
  const bindingsList: unknown[] = [
    now.toISOString(),
    user.activeWorkspaceId,
    user.activeWorkspaceId,
    user.activeWorkspaceId,
    user.id,
    cutoff,
  ]
  if (cursor) bindingsList.push(cursor.createdAt, cursor.createdAt, cursor.id)
  bindingsList.push(limit + 1)

  const result = await bindings.DB.prepare(`
    SELECT activity.id, activity.actor_type, activity.actor_label,
      activity.action_type, activity.target_id,
      COALESCE(subject_override.subject, target.subject) AS target_label,
      activity.created_at, activity.undo_expires_at, activity.undone_at,
      activity.undo_data_json,
      CASE WHEN activity.undone_at IS NULL
          AND activity.undo_data_json IS NOT NULL
          AND activity.undo_expires_at > ?
          AND (
            SELECT COUNT(*)
            FROM json_each(activity.undo_data_json, '$.messages') AS undo_item
            JOIN messages AS current_message
              ON current_message.id = json_extract(undo_item.value, '$.id')
            WHERE current_message.is_read = CAST(json_extract(undo_item.value, '$.appliedIsRead') AS INTEGER)
              AND current_message.read_state_version = CAST(json_extract(undo_item.value, '$.appliedReadVersion') AS INTEGER)
              AND ${workspaceMessageScope('current_message', user.id)}
          ) = json_array_length(json_extract(activity.undo_data_json, '$.messages'))
        THEN 1 ELSE 0 END AS undo_state_valid
    FROM workspace_activity AS activity
    LEFT JOIN messages AS target
      ON target.id = activity.target_id
      AND ${workspaceMessageScope('target', user.id)}
    LEFT JOIN thread_subject_overrides AS subject_override
      ON subject_override.thread_id = activity.target_id
      AND subject_override.mailbox_domain = target.mailbox_domain
    WHERE activity.workspace_id = ?
      AND EXISTS (
        SELECT 1 FROM mailbox_access_grants AS activity_access
        WHERE activity_access.workspace_id = activity.workspace_id
          AND activity_access.mailbox_id = activity.mailbox_id
          AND activity_access.user_id = ?
          AND activity_access.status = 'active'
      )
      AND activity.created_at >= ?
      ${cursorSql}
    ORDER BY activity.created_at DESC, activity.id DESC
    LIMIT ?
  `).bind(...bindingsList).all<ActivityRow>()

  const hasMore = result.results.length > limit
  const rows = result.results.slice(0, limit)
  const nowIso = now.toISOString()

  return {
    items: rows.map(row => ({
      id: row.id,
      actorType: row.actor_type,
      actorLabel: row.actor_label,
      actionType: row.action_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      createdAt: row.created_at,
      undoExpiresAt: row.undo_expires_at,
      undoneAt: row.undone_at,
      canUndo: Boolean(canClassify && row.undo_state_valid
        && row.undo_expires_at && row.undo_expires_at > nowIso),
    })),
    nextCursor: hasMore && rows.length
      ? `${rows.at(-1)!.created_at}~${rows.at(-1)!.id}`
      : null,
  }
})

function parseActivityCursor(value: string) {
  const separatorIndex = value.lastIndexOf('~')
  if (separatorIndex < 1) return null

  const createdAt = value.slice(0, separatorIndex)
  const id = value.slice(separatorIndex + 1)
  if (!Number.isFinite(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) return null
  return { createdAt, id }
}
