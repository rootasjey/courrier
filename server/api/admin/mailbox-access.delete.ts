import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'

type MailboxAccessPayload = { mailboxId?: unknown, userId?: unknown }
type D1MutationResult = { meta?: { changes?: number } }

function parseIds(body: MailboxAccessPayload | undefined) {
  const mailboxId = typeof body?.mailboxId === 'string' ? body.mailboxId.trim() : ''
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!mailboxId || mailboxId.length > 256 || /[\u0000-\u001f\u007f]/.test(mailboxId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Boîte ou membre invalide.' })
  }
  return { mailboxId, userId: userId.toLowerCase() }
}

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const { mailboxId, userId } = parseIds(await readBody<MailboxAccessPayload>(event))

  const target = await db.prepare(`
    SELECT mag.workspace_id, wm.role
    FROM mailbox_access_grants mag
    JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id
    WHERE mag.mailbox_id = ? AND mag.user_id = ? AND mag.status = 'active'
    LIMIT 1
  `).bind(mailboxId, userId).first<{ workspace_id: string, role: string }>()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'Accès actif introuvable.' })
  if (target.role === 'owner') {
    throw createError({ statusCode: 409, statusMessage: 'L’accès d’un propriétaire d’espace doit être conservé.' })
  }

  const now = new Date().toISOString()
  const targetId = `${mailboxId}:${userId}`
  const results = await db.batch([
    db.prepare(`
      UPDATE mailbox_access_grants
      SET status = 'suspended', revoked_at = ?
      WHERE workspace_id = ? AND mailbox_id = ? AND user_id = ? AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM workspace_memberships wm
          WHERE wm.workspace_id = ?
            AND wm.user_id = ?
            AND wm.role <> 'owner'
        )
    `).bind(now, target.workspace_id, mailboxId, userId, target.workspace_id, userId),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'mailbox_access.revoke', 'mailbox_access_grant', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, targetId, target.workspace_id,
      JSON.stringify({ mailboxId, userId }), now),
  ])

  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const current = await db.prepare(`
      SELECT role FROM workspace_memberships WHERE workspace_id = ? AND user_id = ? LIMIT 1
    `).bind(target.workspace_id, userId).first<{ role: string }>()
    if (current?.role === 'owner') {
      throw createError({ statusCode: 409, statusMessage: 'L’accès d’un propriétaire d’espace doit être conservé.' })
    }
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { revoked: changed, unchanged: !changed }
})
