import type { MailStorageBindings } from '../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceMessageScope } from '../utils/account-auth'
import { workspaceActivityCutoff } from '../utils/workspace-activity'
import { threadPath, type MailboxKey } from '../../app/utils/mailbox-routing'

type ActivityRow = {
  id: string
  batch_id: string | null
  group_id: string
  group_total_count: number
  actor_type: 'user' | 'agent' | 'system'
  actor_label: string
  action_type: string
  target_type: string
  target_id: string
  target_label: string | null
  target_folder: string | null
  target_is_set_aside: number | null
  target_is_reply_later: number | null
  target_trashed_at: string | null
  created_at: string
  undo_expires_at: string | null
  undone_at: string | null
  undo_data_json: string | null
  undo_state_valid: number
}

type ActivityGroup = {
  group_id: string
  created_at: string
}

const searchableActionTypes = new Set([
  'thread.mark_seen',
  'thread.mark_unseen',
  'thread.reply_later.added',
  'thread.reply_later.removed',
  'thread.set_aside.added',
  'thread.set_aside.removed',
  'thread.move.inbox',
  'thread.move.feed',
  'thread.move.paper',
  'thread.trashed',
])

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })

  const query = getQuery(event)
  const searchText = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  const searchActionTypes = searchText && typeof query.actions === 'string'
    ? [...new Set(query.actions.split(',').filter(actionType => searchableActionTypes.has(actionType)))]
    : []
  const requestedLimit = Number(query.limit)
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 50)
    : 8
  const cursor = typeof query.cursor === 'string' ? parseActivityCursor(query.cursor) : null
  if (query.cursor && !cursor) {
    throw createError({ statusCode: 400, statusMessage: 'Le curseur de l’historique est invalide.' })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const cutoff = workspaceActivityCutoff(now)
  const canClassify = await bindings.DB.prepare(`
    SELECT 1 AS allowed
    FROM workspace_memberships wm
    JOIN role_permissions rp ON rp.role = wm.role AND rp.permission = 'mail.classify'
    WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
    LIMIT 1
  `).bind(user.id, user.activeWorkspaceId).first<{ allowed: number }>()

  const groupCursorSql = cursor
    ? 'HAVING (MAX(activity.created_at) < ? OR (MAX(activity.created_at) = ? AND COALESCE(activity.batch_id, activity.id) < ?))'
    : ''
  const searchJoins = searchText ? `
    LEFT JOIN messages AS search_target
      ON search_target.id = activity.target_id
      AND activity.target_type = 'thread'
      AND ${workspaceMessageScope('search_target', user.id)}
    LEFT JOIN thread_subject_overrides AS search_override
      ON search_override.thread_id = activity.target_id
      AND search_override.mailbox_domain = search_target.mailbox_domain
  ` : ''
  const searchActionSql = searchActionTypes.length
    ? `OR activity.action_type IN (${searchActionTypes.map(() => '?').join(', ')})`
    : ''
  const searchWhereSql = searchText ? `
      AND (
        instr(lower(activity.actor_label), lower(?)) > 0
        OR instr(lower(activity.action_type), lower(?)) > 0
        ${searchActionSql}
        OR instr(lower(COALESCE(search_override.subject, search_target.subject, '')), lower(?)) > 0
      )
  ` : ''
  const groupBindings: unknown[] = []
  if (searchText) groupBindings.push(user.activeWorkspaceId)
  groupBindings.push(user.activeWorkspaceId, cutoff, user.id)
  if (searchText) {
    groupBindings.push(searchText, searchText, ...searchActionTypes, searchText)
  }
  if (cursor) groupBindings.push(cursor.createdAt, cursor.createdAt, cursor.id)
  groupBindings.push(limit + 1)

  const groupsResult = await bindings.DB.prepare(`
    SELECT COALESCE(activity.batch_id, activity.id) AS group_id,
      MAX(activity.created_at) AS created_at
    FROM workspace_activity AS activity
    ${searchJoins}
    WHERE activity.workspace_id = ?
      AND activity.created_at >= ?
      AND EXISTS (
        SELECT 1 FROM mailbox_access_grants AS activity_access
        WHERE activity_access.workspace_id = activity.workspace_id
          AND activity_access.mailbox_id = activity.mailbox_id
          AND activity_access.user_id = ?
          AND activity_access.status = 'active'
      )
      ${searchWhereSql}
    GROUP BY COALESCE(activity.batch_id, activity.id)
    ${groupCursorSql}
    ORDER BY created_at DESC, group_id DESC
    LIMIT ?
  `).bind(...groupBindings).all<ActivityGroup>()

  const hasMore = groupsResult.results.length > limit
  const groups = groupsResult.results.slice(0, limit)
  if (!groups.length) return { items: [], nextCursor: null }

  const groupIds = groups.map(group => group.group_id)
  const groupPlaceholders = groupIds.map(() => '?').join(', ')
  const rowsResult = await bindings.DB.prepare(`
    SELECT activity.id, activity.batch_id,
      COALESCE(activity.batch_id, activity.id) AS group_id,
      (
        SELECT COUNT(*) FROM workspace_activity AS batch_count
        WHERE batch_count.workspace_id = activity.workspace_id
          AND COALESCE(batch_count.batch_id, batch_count.id) = COALESCE(activity.batch_id, activity.id)
      ) AS group_total_count,
      activity.actor_type, activity.actor_label, activity.action_type,
      activity.target_type, activity.target_id,
      COALESCE(subject_override.subject, target.subject) AS target_label,
      target.folder AS target_folder,
      target.is_set_aside AS target_is_set_aside,
      target.is_reply_later AS target_is_reply_later,
      target.trashed_at AS target_trashed_at,
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
      AND COALESCE(activity.batch_id, activity.id) IN (${groupPlaceholders})
    ORDER BY activity.created_at DESC, activity.id DESC
  `).bind(
    nowIso,
    user.activeWorkspaceId,
    user.activeWorkspaceId,
    user.activeWorkspaceId,
    user.id,
    cutoff,
    ...groupIds,
  ).all<ActivityRow>()

  const rowsByGroup = new Map<string, ActivityRow[]>()
  for (const row of rowsResult.results) {
    const groupRows = rowsByGroup.get(row.group_id) ?? []
    groupRows.push(row)
    rowsByGroup.set(row.group_id, groupRows)
  }

  const items = groups.flatMap((group) => {
    const groupRows = rowsByGroup.get(group.group_id) ?? []
    if (!groupRows.length) return []

    const targets = groupRows.map(row => ({
      id: row.id,
      targetId: row.target_id,
      targetLabel: row.target_label,
      targetHref: activityTargetHref(row),
      canUndo: Boolean(canClassify && row.undo_state_valid
        && row.undo_expires_at && row.undo_expires_at > nowIso),
      undoneAt: row.undone_at,
    }))
    const first = groupRows[0]!
    const allTargetsVisible = groupRows.length === Number(first.group_total_count)
    const allUndoable = allTargetsVisible && targets.every(target => target.canUndo)
    const undoneCount = targets.filter(target => target.undoneAt).length

    return [{
      id: group.group_id,
      batchId: first.batch_id,
      actorType: first.actor_type,
      actorLabel: first.actor_label,
      actionType: first.action_type,
      targetCount: targets.length,
      targets,
      targetId: targets[0]!.targetId,
      targetLabel: targets[0]!.targetLabel,
      targetHref: targets[0]!.targetHref,
      createdAt: group.created_at,
      undoExpiresAt: first.undo_expires_at,
      undoneAt: allTargetsVisible && undoneCount === targets.length ? first.undone_at : null,
      partiallyUndone: undoneCount > 0 && (!allTargetsVisible || undoneCount < targets.length),
      canUndo: Boolean(canClassify && allUndoable),
    }]
  })

  return {
    items,
    nextCursor: hasMore && groups.length
      ? `${groups.at(-1)!.created_at}~${groups.at(-1)!.group_id}`
      : null,
  }
})

function activityTargetHref(row: ActivityRow) {
  if (row.target_type !== 'thread' || !row.target_folder) return null

  const mailbox = row.target_trashed_at
    ? 'Trash'
    : row.target_is_reply_later
      ? 'Reply Later'
      : row.target_folder === 'Imbox' && row.target_is_set_aside
        ? 'Set Aside'
        : row.target_folder
  const allowedMailboxes: MailboxKey[] = [
    'Screener', 'Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside', 'Trash',
  ]

  if (!allowedMailboxes.includes(mailbox as MailboxKey)) return null
  return threadPath(mailbox as MailboxKey, row.target_id)
}

function parseActivityCursor(value: string) {
  const separatorIndex = value.lastIndexOf('~')
  if (separatorIndex < 1) return null

  const createdAt = value.slice(0, separatorIndex)
  const id = value.slice(separatorIndex + 1)
  if (!Number.isFinite(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) return null
  return { createdAt, id }
}
