import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'

type MembershipStatus = 'active' | 'suspended'
type MembershipPayload = { status?: unknown }
type D1MutationResult = { meta?: { changes?: number } }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const membershipId = getRouterParam(event, 'id')?.trim() ?? ''
  const body = await readBody<MembershipPayload>(event)
  const nextStatus = body?.status

  if (!membershipId || membershipId.length > 256 || /[\u0000-\u001f\u007f]/.test(membershipId)) {
    throw createError({ statusCode: 400, statusMessage: 'Membre invalide.' })
  }
  if (nextStatus !== 'active' && nextStatus !== 'suspended') {
    throw createError({ statusCode: 400, statusMessage: 'État de membre invalide.' })
  }

  const current = await db.prepare(`
    SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.status
    FROM workspace_memberships wm
    WHERE wm.id = ?
    LIMIT 1
  `).bind(membershipId).first<{
    id: string
    workspace_id: string
    user_id: string
    role: string
    status: MembershipStatus
  }>()

  if (!current) throw createError({ statusCode: 404, statusMessage: 'Membre introuvable.' })
  if (current.status === nextStatus) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return { membershipId, status: nextStatus, unchanged: true }
  }

  if (nextStatus === 'suspended' && current.role === 'owner') {
    const anotherOwner = await db.prepare(`
      SELECT 1 AS allowed
      FROM workspace_memberships other_owner
      JOIN users other_owner_user ON other_owner_user.id = other_owner.user_id AND other_owner_user.status = 'active'
      JOIN workspaces other_owner_workspace ON other_owner_workspace.id = other_owner.workspace_id AND other_owner_workspace.status = 'active'
      WHERE other_owner.workspace_id = ? AND other_owner.role = 'owner' AND other_owner.status = 'active' AND other_owner.id <> ?
      LIMIT 1
    `).bind(current.workspace_id, membershipId).first<{ allowed: number }>()
    if (!anotherOwner) {
      throw createError({ statusCode: 409, statusMessage: 'Le dernier propriétaire actif ne peut pas être suspendu.' })
    }
  }

  const now = new Date().toISOString()
  const action = nextStatus === 'suspended'
    ? 'workspace_membership.suspend'
    : 'workspace_membership.reactivate'
  const accessPolicy = nextStatus === 'suspended'
    ? 'mailbox_grants_suspended'
    : 'mailbox_grants_require_explicit_regrant'

  const statements = [
    db.prepare(`
      UPDATE workspace_memberships
      SET status = ?
      WHERE id = ? AND status = ?
        AND (
          ? <> 'suspended'
          OR role <> 'owner'
          OR EXISTS (
            SELECT 1
            FROM workspace_memberships other_owner
            JOIN users other_owner_user ON other_owner_user.id = other_owner.user_id AND other_owner_user.status = 'active'
            JOIN workspaces other_owner_workspace ON other_owner_workspace.id = other_owner.workspace_id AND other_owner_workspace.status = 'active'
            WHERE other_owner.workspace_id = workspace_memberships.workspace_id
              AND other_owner.role = 'owner'
              AND other_owner.status = 'active'
              AND other_owner.id <> workspace_memberships.id
          )
        )
    `).bind(nextStatus, membershipId, current.status, nextStatus),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, ?, 'workspace_membership', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(
      crypto.randomUUID(), actor.id, action, membershipId, current.workspace_id,
      JSON.stringify({ userId: current.user_id, role: current.role, mailboxAccess: accessPolicy }), now,
    ),
  ]

  if (nextStatus === 'suspended') {
    statements.push(db.prepare(`
      UPDATE mailbox_access_grants
      SET status = 'suspended'
      WHERE workspace_id = ? AND user_id = ? AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM workspace_memberships wm
          WHERE wm.id = ? AND wm.workspace_id = ? AND wm.user_id = ? AND wm.status = 'suspended'
        )
        AND changes() > 0
    `).bind(current.workspace_id, current.user_id, membershipId, current.workspace_id, current.user_id))
  }

  const results = await db.batch(statements)
  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const latest = await db.prepare(`
      SELECT status FROM workspace_memberships WHERE id = ? LIMIT 1
    `).bind(membershipId).first<{ status: MembershipStatus }>()

    if (!latest) throw createError({ statusCode: 404, statusMessage: 'Membre introuvable.' })
    if (latest.status !== nextStatus) {
      throw createError({ statusCode: 409, statusMessage: 'Le membre a changé entre-temps. Actualise la console et réessaie.' })
    }
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    membershipId,
    status: nextStatus,
    mailboxAccess: nextStatus === 'active' ? 'explicit_regrant_required' : 'suspended',
    unchanged: !changed,
  }
})
