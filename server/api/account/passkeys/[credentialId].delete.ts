import { getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const user = await requirePlatformAdmin(event)
  const credentialId = getRouterParam(event, 'credentialId') || ''
  if (!/^[A-Za-z0-9_-]{1,1024}$/u.test(credentialId)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de passkey invalide.' })
  }

  const db = getAccountDb(event)
  const passkeyCount = await db.prepare('SELECT COUNT(*) AS count FROM auth_passkeys WHERE user_id = ?')
    .bind(user.id).first<{ count: number }>()
  if (Number(passkeyCount?.count || 0) <= 1) {
    throw createError({ statusCode: 409, statusMessage: 'Conserve au moins une passkey. Ajoute-en une autre avant de supprimer celle-ci.' })
  }

  const createdAt = new Date().toISOString()
  const auditId = crypto.randomUUID()
  const results = await db.batch([
    db.prepare('DELETE FROM auth_passkeys WHERE credential_id = ? AND user_id = ?')
      .bind(credentialId, user.id),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'account.passkey_removed', 'user', ?, '{}', ?
      WHERE changes() > 0
    `).bind(auditId, user.id, user.id, createdAt),
    db.prepare(`
      UPDATE users SET session_version = session_version + 1
      WHERE id = ? AND EXISTS (SELECT 1 FROM platform_audit_log WHERE id = ?)
    `).bind(user.id, auditId),
    db.prepare('DELETE FROM auth_webauthn_challenges WHERE user_id = ?').bind(user.id),
  ])
  if (changedRows(results[0]) !== 1) {
    throw createError({ statusCode: 404, statusMessage: 'Cette passkey n’existe pas.' })
  }
  return { ok: true, requiresReauthentication: true }
})
