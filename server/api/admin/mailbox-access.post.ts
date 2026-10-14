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

  const eligible = await db.prepare(`
    SELECT mb.workspace_id, wm.role
    FROM mailboxes mb
    JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
    JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      AND d.verification_status IN ('verified', 'legacy_unverified')
    JOIN workspace_memberships wm ON wm.workspace_id = mb.workspace_id AND wm.user_id = ? AND wm.status = 'active'
    JOIN users u ON u.id = wm.user_id AND u.status = 'active'
    WHERE mb.id = ? AND mb.status = 'active'
    LIMIT 1
  `).bind(userId, mailboxId).first<{ workspace_id: string, role: string }>()

  if (!eligible) throw createError({ statusCode: 404, statusMessage: 'Boîte active ou membre de cet espace introuvable.' })

  const now = new Date().toISOString()
  const targetId = `${mailboxId}:${userId}`
  const results = await db.batch([
    db.prepare(`
      INSERT INTO mailbox_access_grants
        (workspace_id, mailbox_id, user_id, granted_by_user_id, status, created_at, revoked_at)
      SELECT mb.workspace_id, mb.id, wm.user_id, ?, 'active', ?, NULL
      FROM mailboxes mb
      JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
        AND d.verification_status IN ('verified', 'legacy_unverified')
      JOIN workspace_memberships wm ON wm.workspace_id = mb.workspace_id AND wm.user_id = ? AND wm.status = 'active'
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE mb.id = ? AND mb.status = 'active'
      ON CONFLICT(workspace_id, mailbox_id, user_id) DO UPDATE SET
        granted_by_user_id = excluded.granted_by_user_id,
        status = 'active',
        created_at = excluded.created_at,
        revoked_at = NULL
      WHERE mailbox_access_grants.status <> 'active'
    `).bind(actor.id, now, userId, mailboxId),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'mailbox_access.grant', 'mailbox_access_grant', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, targetId, eligible.workspace_id,
      JSON.stringify({ mailboxId, userId }), now),
  ])

  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const currentGrant = await db.prepare(`
      SELECT 1 AS allowed
      FROM mailbox_access_grants mag
      JOIN mailboxes mb ON mb.id = mag.mailbox_id AND mb.workspace_id = mag.workspace_id AND mb.status = 'active'
      JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
        AND d.verification_status IN ('verified', 'legacy_unverified')
      JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
      JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id AND wm.status = 'active'
      JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE mag.workspace_id = ? AND mag.mailbox_id = ? AND mag.user_id = ? AND mag.status = 'active'
      LIMIT 1
    `).bind(eligible.workspace_id, mailboxId, userId).first<{ allowed: number }>()
    if (!currentGrant) {
      throw createError({ statusCode: 409, statusMessage: 'La boîte ou le membre n’est plus disponible.' })
    }
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { granted: true, unchanged: !changed }
})
