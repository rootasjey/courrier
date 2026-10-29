import { assertSameOrigin, getAccountDb, requireFreshAccountMfa, requireWorkspacePermission } from '../../../utils/account-auth'

type MembershipPayload = { role?: unknown, status?: unknown }
type D1MutationResult = { meta?: { changes?: number } }

const workspaceRoles = new Set(['admin', 'member', 'viewer'])

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requireWorkspacePermission(event, 'members.manage')
  await requireFreshAccountMfa(event, actor.id)
  const membershipId = getRouterParam(event, 'id')?.trim() ?? ''
  const body = await readBody<MembershipPayload>(event)
  const requestedStatus = body?.status
  const requestedRole = body?.role

  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) {
    throw createError({ statusCode: 400, statusMessage: 'Adhésion invalide.' })
  }
  if (requestedStatus !== undefined && requestedStatus !== 'active' && requestedStatus !== 'suspended') {
    throw createError({ statusCode: 400, statusMessage: 'État de membre invalide.' })
  }
  if (requestedRole !== undefined && (typeof requestedRole !== 'string' || !workspaceRoles.has(requestedRole))) {
    throw createError({ statusCode: 400, statusMessage: 'Rôle de membre invalide.' })
  }

  const db = getAccountDb(event)
  const current = await db.prepare(`
    SELECT id, user_id, role, status FROM workspace_memberships
    WHERE id = ? AND workspace_id = ? LIMIT 1
  `).bind(membershipId, actor.activeWorkspaceId).first<{
    id: string, user_id: string, role: 'owner' | 'admin' | 'member' | 'viewer', status: 'active' | 'suspended',
  }>()
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Membre introuvable dans cet espace.' })
  if (current.role === 'owner') {
    throw createError({ statusCode: 409, statusMessage: 'Les propriétaires doivent être transférés avant de modifier leur accès.' })
  }
  if (current.role === 'admin' && actor.workspaceRole !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Seul le propriétaire peut modifier le rôle ou l’accès d’un administrateur.' })
  }
  const nextStatus = (requestedStatus ?? current.status) as 'active' | 'suspended'
  const nextRole = (requestedRole ?? current.role) as 'admin' | 'member' | 'viewer'
  if (nextRole === 'admin' && actor.workspaceRole !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Seul le propriétaire peut attribuer le rôle d’administrateur.' })
  }
  if (current.status === nextStatus && current.role === nextRole) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return { membershipId, status: nextStatus, unchanged: true }
  }

  const now = new Date().toISOString()
  const action = current.role !== nextRole
    ? 'workspace_membership.role_change'
    : nextStatus === 'suspended' ? 'workspace_membership.suspend' : 'workspace_membership.reactivate'
  const accessPolicy = nextStatus === 'suspended' ? 'mailbox_grants_suspended' : 'mailbox_grants_require_explicit_regrant'
  const statements = [
    db.prepare(`
      UPDATE workspace_memberships SET status = ?, role = ?
      WHERE id = ? AND workspace_id = ? AND status = ?
        AND role = ?
        AND role <> 'owner'
        AND EXISTS (
          SELECT 1
          FROM workspace_memberships actor_membership
          JOIN role_permissions rp ON rp.role = actor_membership.role AND rp.permission = 'members.manage'
          WHERE actor_membership.workspace_id = workspace_memberships.workspace_id
            AND actor_membership.user_id = ? AND actor_membership.status = 'active'
            AND (? <> 'admin' OR actor_membership.role = 'owner')
        )
    `).bind(nextStatus, nextRole, membershipId, actor.activeWorkspaceId, current.status, current.role, actor.id, nextRole),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, ?, 'workspace_membership', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(
      crypto.randomUUID(), actor.id, action, membershipId, actor.activeWorkspaceId,
      JSON.stringify({ userId: current.user_id, previousRole: current.role, role: nextRole, status: nextStatus, mailboxAccess: accessPolicy }), now,
    ),
  ]
  if (nextStatus === 'suspended') {
    statements.push(db.prepare(`
      UPDATE mailbox_access_grants SET status = 'suspended'
      WHERE workspace_id = ? AND user_id = ? AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM workspace_memberships wm
          WHERE wm.id = ? AND wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'suspended'
        )
        AND changes() > 0
    `).bind(actor.activeWorkspaceId, current.user_id, membershipId, actor.activeWorkspaceId, current.user_id))
  }

  const result = await db.batch(statements)
  const changed = Number((result[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) throw createError({ statusCode: 409, statusMessage: 'Le membre a changé entre-temps. Actualise la page et réessaie.' })

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    membershipId,
    status: nextStatus,
    role: nextRole,
    mailboxAccess: nextStatus === 'active' ? 'explicit_regrant_required' : 'suspended',
  }
})
