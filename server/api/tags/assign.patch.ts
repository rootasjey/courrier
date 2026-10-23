import { getAccountDb, getWorkspaceUserFromContext, workspaceMessageScope } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const body = await readBody<{ tagId?: unknown, messageIds?: unknown, enabled?: unknown }>(event)
  const tagId = typeof body?.tagId === 'string' ? body.tagId : ''
  const messageIds = Array.isArray(body?.messageIds)
    ? [...new Set(body.messageIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : []
  if (!/^[0-9a-f-]{36}$/i.test(tagId) || messageIds.length < 1 || messageIds.length > 500
    || messageIds.some(id => id.length > 300) || typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'La sélection de tag est invalide.' })
  }

  const db = getAccountDb(event)
  const tag = await db.prepare('SELECT id FROM workspace_tags WHERE id = ? AND workspace_id = ?')
    .bind(tagId, user.activeWorkspaceId).first<{ id: string }>()
  if (!tag) throw createError({ statusCode: 404, statusMessage: 'Ce tag est introuvable.' })

  const placeholders = messageIds.map(() => '?').join(', ')
  const visible = await db.prepare(`
    SELECT messages.id FROM messages
    WHERE messages.id IN (${placeholders})
      AND ${workspaceMessageScope('messages', user.id)}
  `).bind(...messageIds, user.activeWorkspaceId).all<{ id: string }>()
  if (visible.results.length !== messageIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'Un ou plusieurs messages sont introuvables dans cet espace.' })
  }

  const now = new Date().toISOString()
  const statements = messageIds.map((messageId) => body.enabled
    ? db.prepare(`INSERT OR IGNORE INTO message_tags (tag_id, message_id, assigned_by_user_id, assigned_at) VALUES (?, ?, ?, ?)`)
      .bind(tagId, messageId, user.id, now)
    : db.prepare('DELETE FROM message_tags WHERE tag_id = ? AND message_id = ?').bind(tagId, messageId))
  await db.batch(statements)
  return { tagId, messageCount: messageIds.length, enabled: body.enabled }
})
