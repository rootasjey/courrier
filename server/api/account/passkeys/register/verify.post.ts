import type { RegistrationResponseJSON } from '@simplewebauthn/types'
import { assertSameOrigin, getAccountDb, requireMfaAccountIdentity } from '../../../../utils/account-auth'
import {
  clearMfaFailures,
  consumeWebAuthnChallenge,
  createPasskeyRecoveryRecords,
  generateRecoveryCodes,
  getUserPasskeys,
  isMfaFresh,
  markMfaVerified,
  verifyRegistration,
  base64UrlFromBytes,
} from '../../../../utils/passkeys'

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requireMfaAccountIdentity(event)
  const db = getAccountDb(event)

  const body = await readBody<{ attemptId?: unknown, response?: unknown }>(event)
  if (!body?.response || typeof body.response !== 'object' || Array.isArray(body.response)) {
    throw createError({ statusCode: 400, statusMessage: 'La réponse de la passkey est invalide.' })
  }
  const challenge = await consumeWebAuthnChallenge(db, {
    attemptId: body.attemptId,
    user,
    purpose: 'register',
  })
  if (!challenge) throw createError({ statusCode: 400, statusMessage: 'Cette tentative de passkey a expiré ou a déjà été utilisée.' })

  const priorPasskeys = await getUserPasskeys(db, user.id)
  const priorRecoveryCodes = await db.prepare(`
    SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL
  `).bind(user.id).first<{ count: number }>()
  const mfaAlreadyConfigured = priorPasskeys.length > 0 || Number(priorRecoveryCodes?.count || 0) > 0
  if (mfaAlreadyConfigured && !isMfaFresh(await requireUserSession(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Vérifie un facteur de sécurité existant avant de gérer les passkeys.' })
  }

  let verification
  try {
    verification = await verifyRegistration(event, body.response as RegistrationResponseJSON, challenge.challenge)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'La vérification de la passkey a échoué. Réessaie.' })
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw createError({ statusCode: 400, statusMessage: 'La passkey n’a pas pu être vérifiée.' })
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const createdAt = new Date().toISOString()
  const nextSessionVersion = user.sessionVersion + 1
  const recoveryCount = await db.prepare(`
    SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL
  `).bind(user.id).first<{ count: number }>()
  const recoveryCodes = Number(recoveryCount?.count || 0) === 0 ? generateRecoveryCodes() : []
  const recoveryStatements = await createPasskeyRecoveryRecords(db, user.id, recoveryCodes, nextSessionVersion)
  const statements = [
    db.prepare('UPDATE users SET session_version = ? WHERE id = ? AND session_version = ?')
      .bind(nextSessionVersion, user.id, user.sessionVersion),
    db.prepare(`
      INSERT INTO auth_passkeys
        (credential_id, user_id, public_key, counter, transports_json, device_type, backed_up, label, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(
      credential.id,
      user.id,
      base64UrlFromBytes(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports || []),
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      challenge.label || 'Passkey Courrier',
      createdAt,
      user.id,
      nextSessionVersion,
    ),
    ...recoveryStatements,
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'account.passkey_added', 'user', ?, '{}', ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(crypto.randomUUID(), user.id, user.id, createdAt, user.id, nextSessionVersion),
    db.prepare('DELETE FROM auth_webauthn_challenges WHERE user_id = ?').bind(user.id),
  ]

  try {
    const results = await db.batch(statements)
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw new Error('Passkey was not stored for the current session.')
    }
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Cette passkey est déjà enregistrée ou n’a pas pu être sauvegardée.' })
  }

  await clearMfaFailures(event, db, user.id)
  await markMfaVerified(event, 'passkey', nextSessionVersion)
  return { ok: true, recoveryCodes }
})
