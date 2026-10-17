import {
  assertSameOrigin,
  getAccountDb,
  isPlatformAdmin,
  requireFreshAccountMfa,
  requireMfaAccountIdentity,
} from '../../../utils/account-auth'

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requireMfaAccountIdentity(event)
  if (await isPlatformAdmin(event, user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'La MFA reste obligatoire pour les administrateurs de plateforme.' })
  }
  await requireFreshAccountMfa(event, user.id)

  const db = getAccountDb(event)
  const nextSessionVersion = user.sessionVersion + 1
  const createdAt = new Date().toISOString()
  const auditId = crypto.randomUUID()
  const results = await db.batch([
    db.prepare('UPDATE users SET session_version = ? WHERE id = ? AND session_version = ?')
      .bind(nextSessionVersion, user.id, user.sessionVersion),
    db.prepare(`
      DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(user.id, user.id, nextSessionVersion),
    db.prepare(`
      DELETE FROM auth_passkeys WHERE user_id = ?
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(user.id, user.id, nextSessionVersion),
    db.prepare(`
      DELETE FROM auth_webauthn_challenges WHERE user_id = ?
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(user.id, user.id, nextSessionVersion),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'account.mfa_disabled', 'user', ?, '{}', ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(auditId, user.id, user.id, createdAt, user.id, nextSessionVersion),
  ])

  if (changedRows(results[0]) !== 1) {
    throw createError({ statusCode: 401, statusMessage: 'Session Courrier expirée ou révoquée.' })
  }
  return { ok: true, requiresReauthentication: true }
})
