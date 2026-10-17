import { assertSameOrigin, getAccountDb, isPlatformAdmin, requireMfaAccountIdentity } from '../../../../utils/account-auth'
import {
  assertMfaAttemptsAvailable,
  createAuthenticationOptions,
  getUserPasskeys,
  issueWebAuthnChallenge,
} from '../../../../utils/passkeys'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requireMfaAccountIdentity(event, { allowMfaPending: true })
  const db = getAccountDb(event)
  const platformAdmin = await isPlatformAdmin(event, user.id)
  const session = await requireUserSession(event)
  await assertMfaAttemptsAvailable(event, db, user.id)

  const passkeys = await getUserPasskeys(db, user.id)
  if (!passkeys.length) {
    throw createError({ statusCode: 409, statusMessage: 'Aucune passkey n’est enregistrée pour ce compte.' })
  }

  const { options } = await createAuthenticationOptions(event, passkeys)
  const purpose = session.secure?.mfaPending
    ? 'account_login'
    : platformAdmin ? 'admin_step_up' : 'account_step_up'
  const attemptId = await issueWebAuthnChallenge(db, user, purpose, options.challenge)
  return { options, attemptId }
})
