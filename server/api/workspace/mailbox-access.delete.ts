import { assertSameOrigin, getAccountDb, requireWorkspacePermission } from '../../utils/account-auth'
import { requireFreshWorkspaceMfa } from '../../utils/workspace-management'

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
  assertSameOrigin(event)
  const actor = await requireWorkspacePermission(event, 'mailbox.access.manage')
  await requireFreshWorkspaceMfa(event, actor.id)
  const { mailboxId, userId } = parseIds(await readBody<MailboxAccessPayload>(event))
  const db = getAccountDb(event)
  const workspaceId = actor.activeWorkspaceId

  const target = await db.prepare(`
    SELECT wm.role
    FROM mailbox_access_grants mag
    JOIN workspace_memberships wm ON wm.workspace_id = mag.workspace_id AND wm.user_id = mag.user_id AND wm.status = 'active'
    WHERE mag.workspace_id = ? AND mag.mailbox_id = ? AND mag.user_id = ? AND mag.status = 'active'
    LIMIT 1
  `).bind(workspaceId, mailboxId, userId).first<{ role: string }>()
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Accès actif introuvable dans cet espace.' })
  if (target.role === 'owner') {
    throw createError({ statusCode: 409, statusMessage: 'L’accès du propriétaire de l’espace doit être conservé.' })
  }
  if (target.role === 'admin' && actor.workspaceRole !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Seul le propriétaire peut modifier l’accès d’un administrateur.' })
  }

  const now = new Date().toISOString()
  const results = await db.batch([
    db.prepare(`
      UPDATE mailbox_access_grants
      SET status = 'suspended', revoked_at = ?
      WHERE workspace_id = ? AND mailbox_id = ? AND user_id = ? AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM workspace_memberships target_membership
          WHERE target_membership.workspace_id = ?
            AND target_membership.user_id = ?
            AND target_membership.status = 'active' AND target_membership.role <> 'owner'
        )
        AND EXISTS (
          SELECT 1 FROM workspace_memberships actor_membership
          JOIN role_permissions rp ON rp.role = actor_membership.role AND rp.permission = 'mailbox.access.manage'
          WHERE actor_membership.workspace_id = ?
            AND actor_membership.user_id = ? AND actor_membership.status = 'active'
            AND EXISTS (
              SELECT 1 FROM workspace_memberships target_membership
              WHERE target_membership.workspace_id = ?
                AND target_membership.user_id = ?
                AND target_membership.status = 'active'
                AND (target_membership.role <> 'admin' OR EXISTS (
                  SELECT 1 FROM workspace_memberships owner_membership
                  WHERE owner_membership.workspace_id = ?
                    AND owner_membership.user_id = ?
                    AND owner_membership.status = 'active'
                    AND owner_membership.role = 'owner'
                ))
            )
        )
    `).bind(now, workspaceId, mailboxId, userId, workspaceId, userId, workspaceId, actor.id,
      workspaceId, userId, workspaceId, actor.id),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'mailbox_access.revoke', 'mailbox_access_grant', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, `${mailboxId}:${userId}`, workspaceId,
      JSON.stringify({ mailboxId, userId, source: 'workspace_management' }), now),
  ])

  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const current = await db.prepare(`
      SELECT wm.role FROM workspace_memberships wm
      WHERE wm.workspace_id = ? AND wm.user_id = ? LIMIT 1
    `).bind(workspaceId, userId).first<{ role: string }>()
    if (current?.role === 'owner') {
      throw createError({ statusCode: 409, statusMessage: 'L’accès du propriétaire de l’espace doit être conservé.' })
    }
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { revoked: changed, unchanged: !changed }
})
