import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'

type D1MutationResult = { meta?: { changes?: number } }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const invitationId = getRouterParam(event, 'id')?.trim() ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation invalide.' })
  }

  const invitation = await db.prepare(`
    SELECT id, workspace_id, accepted_at, revoked_at FROM workspace_invitations WHERE id = ? LIMIT 1
  `).bind(invitationId).first<{ id: string, workspace_id: string, accepted_at: string | null, revoked_at: string | null }>()
  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Invitation introuvable.' })
  if (invitation.accepted_at) throw createError({ statusCode: 409, statusMessage: 'Cette invitation a déjà été acceptée.' })
  if (invitation.revoked_at) return { invitationId, revoked: true, unchanged: true }

  const now = new Date().toISOString()
  const results = await db.batch([
    db.prepare(`
      UPDATE workspace_invitations SET revoked_at = ?
      WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL
    `).bind(now, invitationId),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'workspace_invitation.revoke', 'workspace_invitation', ?, ?, '{}', ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, invitationId, invitation.workspace_id, now),
  ])
  const updated = (results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0
  if (!updated) throw createError({ statusCode: 409, statusMessage: 'Cette invitation a déjà changé d’état.' })

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { invitationId, revoked: true }
})
