import { assertSameOrigin, getAccountDb } from '../../../utils/account-auth'
import { hashPasswordResetValue, PASSWORD_RESET_TOKEN_PATTERN } from '../../../utils/account-recovery'

const invalidTokenError = () => createError({ statusCode: 400, statusMessage: 'Ce lien de réinitialisation est invalide ou expiré.' })

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const body = await readBody<{ token?: unknown, password?: unknown }>(event)
  const token = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!PASSWORD_RESET_TOKEN_PATTERN.test(token) || password.length < 16 || password.length > 1024) {
    throw invalidTokenError()
  }

  const db = getAccountDb(event)
  const tokenHash = await hashPasswordResetValue(token)
  const account = await db.prepare(`
    SELECT u.id
    FROM auth_password_reset_tokens reset
    JOIN users u ON u.id = reset.user_id AND u.status = 'active'
    JOIN password_credentials pc ON pc.user_id = u.id
    WHERE reset.token_hash = ? AND reset.used_at IS NULL
      AND datetime(reset.expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first<{ id: string }>()
  if (!account) throw invalidTokenError()

  const passwordHash = await hashPassword(password)
  const timestamp = new Date().toISOString()
  const useMarker = `${timestamp}:${crypto.randomUUID()}`
  const results = await db.batch([
    db.prepare(`
      UPDATE auth_password_reset_tokens SET used_at = ?
      WHERE token_hash = ? AND user_id = ? AND used_at IS NULL
        AND datetime(expires_at) > datetime('now')
    `).bind(useMarker, tokenHash, account.id),
    db.prepare(`
      UPDATE password_credentials SET password_hash = ?, updated_at = ?
      WHERE user_id = ? AND changes() > 0
    `).bind(passwordHash, timestamp, account.id),
    db.prepare(`
      UPDATE users SET session_version = session_version + 1, updated_at = ?
      WHERE id = ? AND status = 'active' AND changes() > 0
    `).bind(timestamp, account.id),
    db.prepare(`
      DELETE FROM auth_password_reset_tokens
      WHERE user_id = ? AND token_hash != ? AND changes() > 0
    `).bind(account.id, tokenHash),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'account.password_reset', 'user', ?, '{}', ?
      WHERE EXISTS (
        SELECT 1 FROM auth_password_reset_tokens
        WHERE token_hash = ? AND user_id = ? AND used_at = ?
      )
    `).bind(crypto.randomUUID(), account.id, account.id, timestamp, tokenHash, account.id, useMarker),
  ])
  if (results.slice(0, 3).some(result => Number((result as { meta?: { changes?: number } }).meta?.changes || 0) !== 1)) {
    throw invalidTokenError()
  }

  await clearUserSession(event)
  return { message: 'Mot de passe mis à jour. Connecte-toi avec ton nouveau mot de passe.' }
})
