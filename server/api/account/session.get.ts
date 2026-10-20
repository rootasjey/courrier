import { getAccountDb, isPlatformAdmin, requireSessionIdentity } from '../../utils/account-auth'
import { isMfaFresh } from '../../utils/passkeys'
import { isTroncheAvatarConfig, type TroncheAvatarConfig } from '#shared/utils/tronche-avatar'

export default defineEventHandler(async (event) => {
  const user = await requireSessionIdentity(event, { allowMfaPending: true })
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

  const [preferences, passkeys, recoveryCodes] = await Promise.all([
    getAccountDb(event).prepare(
      'SELECT theme_mode, theme_name, avatar_mode, avatar_config FROM users WHERE id = ? LIMIT 1',
    ).bind(user.id).first<{ theme_mode: string | null, theme_name: string | null, avatar_mode: 'default' | 'photo' | 'tronche' | null, avatar_config: string | null }>(),
    getAccountDb(event).prepare('SELECT COUNT(*) AS count FROM auth_passkeys WHERE user_id = ?')
      .bind(user.id).first<{ count: number }>(),
    getAccountDb(event).prepare('SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL')
      .bind(user.id).first<{ count: number }>(),
  ])
  const hasPasskeys = Number(passkeys?.count || 0) > 0
  const recoveryCodesRemaining = Number(recoveryCodes?.count || 0)
  const mfaConfigured = hasPasskeys || recoveryCodesRemaining > 0
  const mfaVerified = mfaConfigured && isMfaFresh(session)
  const adminMfaConfigured = platformAdmin && mfaConfigured
  let avatarConfig: TroncheAvatarConfig | null = null
  try {
    const parsed = preferences?.avatar_config ? JSON.parse(preferences.avatar_config) : null
    if (isTroncheAvatarConfig(parsed)) avatarConfig = parsed
  } catch {
    avatarConfig = null
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      themeMode: preferences?.theme_mode ?? null,
      themeName: preferences?.theme_name ?? null,
      avatarMode: preferences?.avatar_mode ?? null,
      avatarConfig,
    },
    activeWorkspaceId: membership?.id ?? null,
    isPlatformAdmin: platformAdmin,
    hasPasskeys,
    recoveryCodesRemaining,
    mfaConfigured,
    mfaVerified,
    mfaPending: session.secure?.mfaPending === true,
    adminMfaConfigured,
    requiresAdminMfa: platformAdmin,
    adminMfaVerified: platformAdmin && adminMfaConfigured && mfaVerified,
  }
})
