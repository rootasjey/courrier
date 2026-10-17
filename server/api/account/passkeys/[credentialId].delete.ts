import {
  getAccountDb,
  isPlatformAdmin,
  requireFreshAccountMfa,
  requireMfaAccountIdentity,
  requirePlatformAdmin,
} from '../../../utils/account-auth'

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  let user = await requireMfaAccountIdentity(event)
  const platformAdmin = await isPlatformAdmin(event, user.id)
  if (platformAdmin) {
    user = await requirePlatformAdmin(event)
  } else {
    await requireFreshAccountMfa(event, user.id)
  }
  const credentialId = getRouterParam(event, 'credentialId') || ''
  if (!/^[A-Za-z0-9_-]{1,1024}$/u.test(credentialId)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de passkey invalide.' })
  }

  const db = getAccountDb(event)
  const passkeyCount = await db.prepare('SELECT COUNT(*) AS count FROM auth_passkeys WHERE user_id = ?')
    .bind(user.id).first<{ count: number }>()
  const recoveryCount = platformAdmin ? null : await db.prepare(`
    SELECT COUNT(*) AS count FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL
  `).bind(user.id).first<{ count: number }>()
  const canRemoveLastMemberPasskey = !platformAdmin && Number(recoveryCount?.count || 0) > 0
  if (Number(passkeyCount?.count || 0) <= 1 && !canRemoveLastMemberPasskey) {
    throw createError({ statusCode: 409, statusMessage: 'Conserve au moins une passkey. Ajoute-en une autre avant de supprimer celle-ci.' })
  }

  const createdAt = new Date().toISOString()
  const auditId = crypto.randomUUID()
  const results = await db.batch([
    db.prepare(`
      DELETE FROM auth_passkeys WHERE credential_id = ? AND user_id = ?
        AND EXISTS (SELECT 1 FROM users WHERE id = ? AND session_version = ?)
    `).bind(credentialId, user.id, user.id, user.sessionVersion),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'account.passkey_removed', 'user', ?, '{}', ?
      WHERE changes() > 0
    `).bind(auditId, user.id, user.id, createdAt),
    db.prepare(`
      UPDATE users SET session_version = ?
      WHERE id = ? AND session_version = ? AND EXISTS (SELECT 1 FROM platform_audit_log WHERE id = ?)
    `).bind(user.sessionVersion + 1, user.id, user.sessionVersion, auditId),
    db.prepare('DELETE FROM auth_webauthn_challenges WHERE user_id = ?').bind(user.id),
  ])
  if (changedRows(results[0]) !== 1) {
    throw createError({ statusCode: 404, statusMessage: 'Cette passkey n’existe pas.' })
  }
  return { ok: true, requiresReauthentication: true }
})
