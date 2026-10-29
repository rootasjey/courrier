import { assertSameOrigin, getAccountDb, requireFreshAccountMfa, requireWorkspacePermission } from '../../../utils/account-auth'

type D1MutationResult = { meta?: { changes?: number } }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requireWorkspacePermission(event, 'members.manage')
  await requireFreshAccountMfa(event, actor.id)
  const invitationId = getRouterParam(event, 'id')?.trim() ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation invalide.' })
  }

  const db = getAccountDb(event)
  const invitation = await db.prepare(`
    SELECT id, role, accepted_at, revoked_at
    FROM workspace_invitations WHERE id = ? AND workspace_id = ? LIMIT 1
  `).bind(invitationId, actor.activeWorkspaceId).first<{
    id: string, role: 'admin' | 'member' | 'viewer', accepted_at: string | null, revoked_at: string | null,
  }>()
  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Invitation introuvable dans cet espace.' })
  if (invitation.role === 'admin' && actor.workspaceRole !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Seul le propriétaire peut révoquer une invitation administrateur.' })
  }
  if (invitation.accepted_at) throw createError({ statusCode: 409, statusMessage: 'Cette invitation a déjà été acceptée.' })
  if (invitation.revoked_at) return { invitationId, revoked: true, unchanged: true }

  const now = new Date().toISOString()
  const result = await db.batch([
    db.prepare(`
      UPDATE workspace_invitations SET revoked_at = ?
      WHERE id = ? AND workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM workspace_memberships actor_membership
          JOIN role_permissions rp ON rp.role = actor_membership.role AND rp.permission = 'members.manage'
          WHERE actor_membership.workspace_id = workspace_invitations.workspace_id
            AND actor_membership.user_id = ? AND actor_membership.status = 'active'
            AND (workspace_invitations.role <> 'admin' OR actor_membership.role = 'owner')
        )
    `).bind(now, invitationId, actor.activeWorkspaceId, actor.id),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'workspace_invitation.revoke', 'workspace_invitation', ?, ?, '{}', ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, invitationId, actor.activeWorkspaceId, now),
  ])
  const changed = Number((result[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) throw createError({ statusCode: 409, statusMessage: 'Cette invitation a déjà changé d’état.' })

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { invitationId, revoked: true }
})
