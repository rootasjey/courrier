import type { AuthenticationResponseJSON } from '@simplewebauthn/types'
import { assertSameOrigin, getAccountDb, isPlatformAdmin, requireSessionIdentity } from '../../../../utils/account-auth'
import {
  assertMfaAttemptsAvailable,
  clearMfaFailures,
  consumeWebAuthnChallenge,
  hashRecoveryCode,
  markMfaVerified,
  normalizeRecoveryCode,
  recordMfaFailure,
  verifyAuthentication,
  getUserPasskeys,
} from '../../../../utils/passkeys'

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requireSessionIdentity(event)
  const db = getAccountDb(event)
  if (!await isPlatformAdmin(event, user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'La vérification passkey est réservée aux administrateurs de plateforme.' })
  }
  await assertMfaAttemptsAvailable(event, db, user.id)

  const body = await readBody<{
    attemptId?: unknown
    response?: unknown
    recoveryCode?: unknown
  }>(event)

  const recoveryCode = normalizeRecoveryCode(body?.recoveryCode)
  if (recoveryCode) {
    const codeHash = await hashRecoveryCode(recoveryCode)
    const saved = await db.prepare(`
      SELECT id FROM auth_mfa_recovery_codes
      WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
      LIMIT 1
    `).bind(user.id, codeHash).first<{ id: string }>()
    if (saved) {
      const usedAt = `${new Date().toISOString()}:${crypto.randomUUID()}`
      const results = await db.batch([
        db.prepare(`
          UPDATE auth_mfa_recovery_codes SET used_at = ?
          WHERE id = ? AND user_id = ? AND used_at IS NULL
        `).bind(usedAt, saved.id, user.id),
        db.prepare(`
          INSERT INTO platform_audit_log
            (id, actor_user_id, action, target_type, target_id, details_json, created_at)
          SELECT ?, ?, 'account.mfa_recovery_code_used', 'user', ?, '{}', ?
          WHERE EXISTS (
            SELECT 1 FROM auth_mfa_recovery_codes WHERE id = ? AND user_id = ? AND used_at = ?
          )
        `).bind(crypto.randomUUID(), user.id, user.id, new Date().toISOString(), saved.id, user.id, usedAt),
      ])
      if (changedRows(results[0]) === 1) {
        await clearMfaFailures(event, db, user.id)
        await markMfaVerified(event, 'recovery_code')
        return { ok: true, method: 'recovery_code' }
      }
    }
    await recordMfaFailure(event, db, user.id)
    throw createError({ statusCode: 401, statusMessage: 'Le code de récupération est invalide ou a déjà été utilisé.' })
  }

  if (!body?.response || typeof body.response !== 'object' || Array.isArray(body.response)) {
    throw createError({ statusCode: 400, statusMessage: 'La réponse de la passkey est invalide.' })
  }
  const response = body.response as AuthenticationResponseJSON
  const challenge = await consumeWebAuthnChallenge(db, {
    attemptId: body.attemptId,
    user,
    purpose: 'admin_step_up',
  })
  if (!challenge) throw createError({ statusCode: 400, statusMessage: 'Cette tentative de passkey a expiré ou a déjà été utilisée.' })

  const passkey = (await getUserPasskeys(db, user.id))
    .find(candidate => candidate.credential_id === response.id)
  if (!passkey) {
    await recordMfaFailure(event, db, user.id)
    throw createError({ statusCode: 401, statusMessage: 'La passkey n’a pas pu être vérifiée.' })
  }

  let verification
  try {
    verification = await verifyAuthentication(event, response, challenge.challenge, passkey)
  } catch {
    await recordMfaFailure(event, db, user.id)
    throw createError({ statusCode: 401, statusMessage: 'La passkey n’a pas pu être vérifiée.' })
  }
  if (!verification.verified || !verification.authenticationInfo.userVerified) {
    await recordMfaFailure(event, db, user.id)
    throw createError({ statusCode: 401, statusMessage: 'La passkey n’a pas pu être vérifiée.' })
  }

  const updatedAt = new Date().toISOString()
  const credentialUpdate = await db.prepare(`
    UPDATE auth_passkeys SET counter = ?, backed_up = ?, device_type = ?, last_used_at = ?
    WHERE credential_id = ? AND user_id = ?
  `).bind(
    verification.authenticationInfo.newCounter,
    verification.authenticationInfo.credentialBackedUp ? 1 : 0,
    verification.authenticationInfo.credentialDeviceType,
    updatedAt,
    passkey.credential_id,
    user.id,
  ).run()
  if (changedRows(credentialUpdate) !== 1) {
    await recordMfaFailure(event, db, user.id)
    throw createError({ statusCode: 401, statusMessage: 'La passkey n’a pas pu être vérifiée.' })
  }
  await clearMfaFailures(event, db, user.id)
  await markMfaVerified(event, 'passkey')
  return { ok: true, method: 'passkey' }
})
