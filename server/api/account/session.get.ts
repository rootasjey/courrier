import { getAccountDb, isPlatformAdmin, requireSessionIdentity } from '../../utils/account-auth'
import { isMfaFresh } from '../../utils/passkeys'

export default defineEventHandler(async (event) => {
  const user = await requireSessionIdentity(event)
  const session = await requireUserSession(event)
  const activeWorkspaceId = typeof session.activeWorkspaceId === 'string' ? session.activeWorkspaceId : null
  const membership = activeWorkspaceId
    ? await getAccountDb(event).prepare(`
      SELECT w.id
      FROM workspace_memberships wm
      JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
      WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
      LIMIT 1
    `).bind(user.id, activeWorkspaceId).first<{ id: string }>()
    : null
  const platformAdmin = await isPlatformAdmin(event, user.id)
  if (!membership && !platformAdmin) {
    throw createError({ statusCode: 401, statusMessage: 'Aucun espace Courrier actif.' })
  }

  const [passkeys, recoveryCodes] = platformAdmin
    ? await Promise.all([
      getAccountDb(event).prepare('SELECT COUNT(*) AS count FROM auth_passkeys WHERE user_id = ?')
        .bind(user.id).first<{ count: number }>(),
      getAccountDb(event).prepare('SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL')
        .bind(user.id).first<{ count: number }>(),
    ])
    : [null, null]
  const adminMfaEnabled = Number(passkeys?.count || 0) > 0 || Number(recoveryCodes?.count || 0) > 0

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    activeWorkspaceId: membership?.id ?? null,
    isPlatformAdmin: platformAdmin,
    hasPasskeys: Number(passkeys?.count || 0) > 0,
    recoveryCodesRemaining: Number(recoveryCodes?.count || 0),
    requiresAdminMfa: adminMfaEnabled,
    adminMfaVerified: adminMfaEnabled && isMfaFresh(session),
  }
})
