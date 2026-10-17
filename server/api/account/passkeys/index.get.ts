import { getAccountDb, requireMfaAccountIdentity } from '../../../utils/account-auth'
import { getUserPasskeys } from '../../../utils/passkeys'

export default defineEventHandler(async (event) => {
  const user = await requireMfaAccountIdentity(event)

  const db = getAccountDb(event)
  const [passkeys, recoveryCodes] = await Promise.all([
    getUserPasskeys(db, user.id),
    db.prepare(`SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL`)
      .bind(user.id).first<{ count: number }>(),
  ])
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    passkeys: passkeys.map(passkey => ({
      id: passkey.credential_id,
      label: passkey.label,
      deviceType: passkey.device_type,
      backedUp: Boolean(passkey.backed_up),
      createdAt: passkey.created_at,
      lastUsedAt: passkey.last_used_at,
    })),
    recoveryCodesRemaining: Number(recoveryCodes?.count || 0),
  }
})
