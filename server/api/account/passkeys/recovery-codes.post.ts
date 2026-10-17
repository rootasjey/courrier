import {
  assertSameOrigin,
  getAccountDb,
  isPlatformAdmin,
  requireFreshAccountMfa,
  requireMfaAccountIdentity,
  requirePlatformAdmin,
} from '../../../utils/account-auth'
import { createPasskeyRecoveryRecords, generateRecoveryCodes, markMfaVerified } from '../../../utils/passkeys'

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  let user = await requireMfaAccountIdentity(event)
  if (await isPlatformAdmin(event, user.id)) {
    user = await requirePlatformAdmin(event)
  } else {
    await requireFreshAccountMfa(event, user.id)
  }
  const db = getAccountDb(event)
  const codes = generateRecoveryCodes()
  const nextSessionVersion = user.sessionVersion + 1
  const inserts = await createPasskeyRecoveryRecords(db, user.id, codes, nextSessionVersion)
  const createdAt = new Date().toISOString()
  const results = await db.batch([
    db.prepare('UPDATE users SET session_version = ? WHERE id = ? AND session_version = ?')
      .bind(nextSessionVersion, user.id, user.sessionVersion),
    db.prepare(`
      DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(user.id, user.id, nextSessionVersion),
    ...inserts,
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'account.recovery_codes_rotated', 'user', ?, '{}', ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(crypto.randomUUID(), user.id, user.id, createdAt, user.id, nextSessionVersion),
  ])
  if (changedRows(results[0]) !== 1 || changedRows(results.at(-1)) !== 1) {
    throw createError({ statusCode: 401, statusMessage: 'Session Courrier expirée ou révoquée.' })
  }
  const session = await requireUserSession(event)
  const method = session.secure?.mfaMethod === 'recovery_code' ? 'recovery_code' : 'passkey'
  await markMfaVerified(event, method, nextSessionVersion)
  return { recoveryCodes: codes }
})
