import { assertSameOrigin, getAccountDb } from '../../utils/account-auth'
import { createPasswordResetToken, hashPasswordResetValue, passwordResetEmail } from '../../utils/account-recovery'

const MAX_EMAIL_REQUESTS_PER_HOUR = 3
const MAX_IP_REQUESTS_PER_HOUR = 10
const GENERIC_RESPONSE = { message: 'Si un compte actif correspond à cette adresse, un e-mail de réinitialisation va être envoyé.' }

type PasswordResetEmailBinding = {
  send: (message: {
    from: { email: string, name: string }
    to: string
    subject: string
    text: string
    html: string
  }) => Promise<{ messageId?: string }>
}

function changedRows(result: unknown) {
  return Number((result as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  const body = await readBody<{ email?: unknown }>(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLocaleLowerCase('en-US') : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Adresse e-mail invalide.' })
  }

  const bindings = (event.context.cloudflare as { env?: { EMAIL?: PasswordResetEmailBinding, COURRIER_PUBLIC_ORIGIN?: string } } | undefined)?.env
  if (!bindings?.EMAIL) throw createError({ statusCode: 503, statusMessage: 'La récupération de compte est temporairement indisponible.' })

  const ip = getRequestHeader(event, 'cf-connecting-ip') || (import.meta.dev ? 'local' : '')
  if (!ip) throw createError({ statusCode: 503, statusMessage: 'La récupération de compte est temporairement indisponible.' })

  const db = getAccountDb(event)
  await db.prepare("DELETE FROM auth_password_reset_requests WHERE created_at <= datetime('now', '-1 day')").run()
  await db.prepare("DELETE FROM auth_password_reset_tokens WHERE datetime(expires_at) <= datetime('now') OR (used_at IS NOT NULL AND created_at <= datetime('now', '-1 day'))").run()

  const [emailKeyHash, ipKeyHash] = await Promise.all([
    hashPasswordResetValue(`email\0${email}`),
    hashPasswordResetValue(`ip\0${ip}`),
  ])
  const throttle = await db.prepare(`
    INSERT INTO auth_password_reset_requests (id, email_key_hash, ip_key_hash, created_at)
    SELECT ?, ?, ?, datetime('now')
    WHERE (SELECT COUNT(*) FROM auth_password_reset_requests
      WHERE email_key_hash = ? AND created_at > datetime('now', '-1 hour')) < ${MAX_EMAIL_REQUESTS_PER_HOUR}
      AND (SELECT COUNT(*) FROM auth_password_reset_requests
      WHERE ip_key_hash = ? AND created_at > datetime('now', '-1 hour')) < ${MAX_IP_REQUESTS_PER_HOUR}
  `).bind(crypto.randomUUID(), emailKeyHash, ipKeyHash, emailKeyHash, ipKeyHash).run()
  if (!changedRows(throttle)) return GENERIC_RESPONSE

  const account = await db.prepare(`
    SELECT u.id, u.email
    FROM users u
    JOIN password_credentials pc ON pc.user_id = u.id
    WHERE lower(u.email) = lower(?) AND u.status = 'active'
    LIMIT 1
  `).bind(email).first<{ id: string, email: string }>()
  if (!account) return GENERIC_RESPONSE

  const token = createPasswordResetToken()
  const tokenHash = await hashPasswordResetValue(token)
  const tokenId = crypto.randomUUID()
  const requestUrl = getRequestURL(event)
  const isLocalOrigin = requestUrl.protocol === 'http:'
    && (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === '[::1]')
  const appOrigin = isLocalOrigin ? requestUrl.origin : bindings.COURRIER_PUBLIC_ORIGIN
  let resetUrl: string
  try {
    const origin = new URL(appOrigin || '')
    const localHttpOrigin = isLocalOrigin && origin.protocol === 'http:'
    if ((!localHttpOrigin && origin.protocol !== 'https:') || origin.origin !== appOrigin) {
      throw new Error('Invalid public origin')
    }
    resetUrl = new URL(`/password-reset#${token}`, origin).toString()
  } catch {
    console.error('[courrier] Password reset email skipped: COURRIER_PUBLIC_ORIGIN is not a valid HTTPS origin.')
    return GENERIC_RESPONSE
  }

  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await db.prepare(`
    INSERT INTO auth_password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tokenId, account.id, tokenHash, createdAt, expiresAt).run()

  const locale = getCookie(event, 'courrier-locale') === 'en' ? 'en' : 'fr'
  try {
    await bindings.EMAIL.send({
      from: { email: 'courrier-test@verbatims.cc', name: 'Courrier' },
      to: account.email,
      ...passwordResetEmail(locale, resetUrl),
    })
  } catch (error) {
    await db.prepare('DELETE FROM auth_password_reset_tokens WHERE id = ? AND used_at IS NULL').bind(tokenId).run()
    console.error('[courrier] Password reset email could not be delivered.', {
      userId: account.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
  }

  return GENERIC_RESPONSE
})
