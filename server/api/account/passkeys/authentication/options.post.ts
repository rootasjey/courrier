import { assertSameOrigin, getAccountDb, isPlatformAdmin, requireSessionIdentity } from '../../../../utils/account-auth'
import {
  assertMfaAttemptsAvailable,
  createAuthenticationOptions,
  getUserPasskeys,
  issueWebAuthnChallenge,
} from '../../../../utils/passkeys'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requireSessionIdentity(event)
  const db = getAccountDb(event)
  if (!await isPlatformAdmin(event, user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'La vérification passkey est réservée aux administrateurs de plateforme.' })
  }
  await assertMfaAttemptsAvailable(event, db, user.id)

  const passkeys = await getUserPasskeys(db, user.id)
  if (!passkeys.length) {
    throw createError({ statusCode: 409, statusMessage: 'Aucune passkey n’est enregistrée pour ce compte.' })
  }

  const { options } = await createAuthenticationOptions(event, passkeys)
  const attemptId = await issueWebAuthnChallenge(db, user, 'admin_step_up', options.challenge)
  return { options, attemptId }
})
