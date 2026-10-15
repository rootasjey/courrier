import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'
import { createPasskeyRecoveryRecords, generateRecoveryCodes } from '../../../utils/passkeys'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const codes = generateRecoveryCodes()
  const inserts = await createPasskeyRecoveryRecords(db, user.id, codes)
  const createdAt = new Date().toISOString()
  await db.batch([
    db.prepare('DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?').bind(user.id),
    ...inserts,
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      VALUES (?, ?, 'account.recovery_codes_rotated', 'user', ?, '{}', ?)
    `).bind(crypto.randomUUID(), user.id, user.id, createdAt),
  ])
  return { recoveryCodes: codes }
})
