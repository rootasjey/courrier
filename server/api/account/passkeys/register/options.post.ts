import { assertSameOrigin, getAccountDb, isPlatformAdmin, requireSessionIdentity } from '../../../../utils/account-auth'
import {
  assertMfaAttemptsAvailable,
  createRegistrationOptions,
  getUserPasskeys,
  isMfaFresh,
  issueWebAuthnChallenge,
  isValidPasskeyLabel,
  recordMfaFailure,
} from '../../../../utils/passkeys'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requireSessionIdentity(event)
  const db = getAccountDb(event)
  if (!await isPlatformAdmin(event, user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'La gestion des passkeys est réservée aux administrateurs de plateforme.' })
  }

  await assertMfaAttemptsAvailable(event, db, user.id)
  const body = await readBody<{ password?: unknown, label?: unknown }>(event)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!isValidPasskeyLabel(body?.label)) {
    throw createError({ statusCode: 400, statusMessage: 'Indique un nom de passkey valide.' })
  }

  const passkeys = await getUserPasskeys(db, user.id)
  const recoveryCodes = await db.prepare(`
    SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL
  `).bind(user.id).first<{ count: number }>()
  const mfaIsEnabled = passkeys.length > 0 || Number(recoveryCodes?.count || 0) > 0
  if (mfaIsEnabled && !isMfaFresh(await requireUserSession(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Vérifie un facteur de sécurité existant avant de gérer les passkeys.' })
  }
  if (!mfaIsEnabled) {
    if (!password || password.length > 1024) {
      throw createError({ statusCode: 400, statusMessage: 'Confirme ton mot de passe pour configurer la première passkey.' })
    }
    const credential = await db.prepare('SELECT password_hash FROM password_credentials WHERE user_id = ? LIMIT 1')
      .bind(user.id).first<{ password_hash: string }>()
    let passwordMatches = false
    try { passwordMatches = Boolean(credential && await verifyPassword(credential.password_hash, password)) } catch { passwordMatches = false }
    if (!passwordMatches) {
      await recordMfaFailure(event, db, user.id)
      throw createError({ statusCode: 401, statusMessage: 'Le mot de passe est incorrect.' })
    }
  }

  const { options } = await createRegistrationOptions(event, user, passkeys)
  const attemptId = await issueWebAuthnChallenge(db, user, 'register', options.challenge, body.label.trim())
  return { options, attemptId }
})
