import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../../utils/account-auth'

type RecoveryPayload = { confirmationEmail?: unknown }
type D1MutationResult = { meta?: { changes?: number } }

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECOVERY_ACTION = 'platform_admin.mfa_recovered_by_admin'
const RECOVERY_DETAILS = JSON.stringify({
  method: 'second_platform_admin',
  target_sessions_revoked: true,
  target_factors_removed: true,
})

function changedRows(result: unknown) {
  return Number((result as D1MutationResult | undefined)?.meta?.changes ?? 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const userId = getRouterParam(event, 'userId')?.trim().toLowerCase() ?? ''

  if (!USER_ID_PATTERN.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Compte administrateur invalide.' })
  }
  if (userId === actor.id.toLowerCase()) {
    throw createError({ statusCode: 409, statusMessage: 'Un administrateur ne peut pas réinitialiser ses propres facteurs.' })
  }

  const body = await readBody<RecoveryPayload>(event)
  const confirmationEmail = typeof body?.confirmationEmail === 'string'
    ? body.confirmationEmail.trim().toLowerCase()
    : ''
  if (!confirmationEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Confirme l’adresse du compte à récupérer.' })
  }

  const target = await db.prepare('SELECT u.id, u.email, u.status, u.session_version, EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id) AS is_platform_admin, EXISTS (SELECT 1 FROM password_credentials pc WHERE pc.user_id = u.id) AS has_password FROM users u WHERE u.id = ? LIMIT 1')
    .bind(userId).first<{
      id: string
      email: string
      status: string
      session_version: number
      is_platform_admin: number
      has_password: number
    }>()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'Compte administrateur introuvable.' })
  if (target.status !== 'active' || !target.is_platform_admin || !target.has_password) {
    throw createError({ statusCode: 409, statusMessage: 'Seul un autre compte administrateur actif avec mot de passe peut être récupéré ainsi.' })
  }
  if (confirmationEmail !== target.email.trim().toLowerCase()) {
    throw createError({ statusCode: 400, statusMessage: 'L’adresse confirmée ne correspond pas au compte ciblé.' })
  }

  const now = new Date().toISOString()
  const auditId = crypto.randomUUID()
  const results = await db.batch([
    db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ? AND status = \'active\' AND session_version = ? AND lower(email) = ? AND EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = users.id) AND EXISTS (SELECT 1 FROM password_credentials pc WHERE pc.user_id = users.id) AND EXISTS (SELECT 1 FROM users actor_user JOIN platform_admins actor_admin ON actor_admin.user_id = actor_user.id WHERE actor_user.id = ? AND actor_user.status = \'active\' AND actor_user.session_version = ? AND (EXISTS (SELECT 1 FROM auth_passkeys ap WHERE ap.user_id = actor_user.id) OR EXISTS (SELECT 1 FROM auth_mfa_recovery_codes arc WHERE arc.user_id = actor_user.id AND arc.used_at IS NULL)))')
      .bind(userId, target.session_version, confirmationEmail, actor.id, actor.sessionVersion),
    db.prepare('INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at) SELECT ?, ?, ?, \'platform_admin\', ?, ?, ? WHERE changes() = 1')
      .bind(auditId, actor.id, RECOVERY_ACTION, userId, RECOVERY_DETAILS, now),
    db.prepare('DELETE FROM auth_webauthn_challenges WHERE user_id = ? AND EXISTS (SELECT 1 FROM platform_audit_log WHERE id = ?)')
      .bind(userId, auditId),
    db.prepare('DELETE FROM auth_mfa_recovery_codes WHERE user_id = ? AND EXISTS (SELECT 1 FROM platform_audit_log WHERE id = ?)')
      .bind(userId, auditId),
    db.prepare('DELETE FROM auth_passkeys WHERE user_id = ? AND EXISTS (SELECT 1 FROM platform_audit_log WHERE id = ?)')
      .bind(userId, auditId),
  ])

  if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Le compte ou ses droits ont changé. Actualise la console et réessaie.' })
  }

  return { userId, recovered: true, reauthenticationRequired: true }
})
