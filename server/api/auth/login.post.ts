import { createHash, randomUUID } from 'node:crypto'
import { assertSameOrigin, getAccountDb } from '../../utils/account-auth'

const MAX_FAILURES = 8
const MAX_IP_FAILURES = 30
const LOCKOUT_SECONDS = 15 * 60
const DUMMY_PASSWORD_HASH = hashPassword(`invalid-login-${randomUUID()}`)

function getAttemptKey(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

async function incrementFailures(db: ReturnType<typeof getAccountDb>, keyHash: string, limit: number) {
  await db.prepare(`
    INSERT INTO auth_login_attempts (key_hash, failed_attempts, window_started_at, locked_until, updated_at)
    VALUES (?, 1, datetime('now'), NULL, datetime('now'))
    ON CONFLICT(key_hash) DO UPDATE SET
      failed_attempts = CASE
        WHEN auth_login_attempts.window_started_at <= datetime('now', '-15 minutes') THEN 1
        ELSE auth_login_attempts.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN auth_login_attempts.window_started_at <= datetime('now', '-15 minutes') THEN datetime('now')
        ELSE auth_login_attempts.window_started_at
      END,
      locked_until = CASE
        WHEN (CASE
          WHEN auth_login_attempts.window_started_at <= datetime('now', '-15 minutes') THEN 1
          ELSE auth_login_attempts.failed_attempts + 1
        END) >= ${limit} THEN datetime('now', '+15 minutes')
        ELSE NULL
      END,
      updated_at = datetime('now')
  `).bind(keyHash).run()
  const result = await db.prepare(`
    SELECT failed_attempts FROM auth_login_attempts WHERE key_hash = ?
  `).bind(keyHash).first<{ failed_attempts: number }>()
  return Number(result?.failed_attempts || 0)
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const body = await readBody<{ email?: unknown, password?: unknown }>(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLocaleLowerCase('en-US') : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !password || password.length > 1024) {
    throw createError({ statusCode: 400, statusMessage: 'Adresse e-mail ou mot de passe invalide.' })
  }

  const db = getAccountDb(event)
  await db.prepare("DELETE FROM auth_login_attempts WHERE updated_at <= datetime('now', '-1 day')").run()
  const ip = getRequestHeader(event, 'cf-connecting-ip') || (import.meta.dev ? 'local' : '')
  if (!ip) throw createError({ statusCode: 503, statusMessage: 'La vérification anti-abus est indisponible.' })
  const keyHash = getAttemptKey(`email\0${email}\0${ip}`)
  const ipKeyHash = getAttemptKey(`ip\0${ip}`)
  const [attempt, ipAttempt] = await Promise.all([db.prepare(`
    SELECT failed_attempts, locked_until
    FROM auth_login_attempts WHERE key_hash = ?
  `).bind(keyHash).first<{ failed_attempts: number, locked_until: string | null }>(), db.prepare(`
    SELECT failed_attempts, locked_until
    FROM auth_login_attempts WHERE key_hash = ?
  `).bind(ipKeyHash).first<{ failed_attempts: number, locked_until: string | null }>()])

  const lockedUntil = attempt?.locked_until ? Date.parse(`${attempt.locked_until}Z`) : Number.NaN
  const ipLockedUntil = ipAttempt?.locked_until ? Date.parse(`${ipAttempt.locked_until}Z`) : Number.NaN
  const activeLockUntil = [lockedUntil, ipLockedUntil]
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0)
  if (Number.isFinite(activeLockUntil) && activeLockUntil > Date.now()) {
    setResponseHeader(event, 'Retry-After', String(Math.ceil((activeLockUntil - Date.now()) / 1000)))
    throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives. Réessayez plus tard.' })
  }

  const credential = await db.prepare(`
    SELECT u.id, u.email, u.display_name, u.session_version, pc.password_hash
    FROM users u
    JOIN password_credentials pc ON pc.user_id = u.id
    WHERE lower(u.email) = lower(?) AND u.status = 'active'
  `).bind(email).first<{
    id: string
    email: string
    display_name: string
    session_version: number
    password_hash: string
  }>()

  let passwordMatches = false
  try { passwordMatches = await verifyPassword(credential?.password_hash || await DUMMY_PASSWORD_HASH, password) } catch { passwordMatches = false }

  const membership = credential && passwordMatches
    ? await db.prepare(`
      SELECT w.id AS workspace_id
      FROM workspace_memberships wm
      JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
      WHERE wm.user_id = ? AND wm.status = 'active'
      ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, wm.created_at
      LIMIT 1
    `).bind(credential.id).first<{ workspace_id: string }>()
    : null
  const platformAdmin = credential && passwordMatches
    ? await db.prepare('SELECT 1 AS allowed FROM platform_admins WHERE user_id = ? LIMIT 1')
      .bind(credential.id).first<{ allowed: number }>()
    : null

  if (!credential || !passwordMatches || (!membership && !platformAdmin)) {
    const [emailIpFailures, ipFailures] = await Promise.all([
      incrementFailures(db, keyHash, MAX_FAILURES),
      incrementFailures(db, ipKeyHash, MAX_IP_FAILURES),
    ])
    if (emailIpFailures >= MAX_FAILURES || ipFailures >= MAX_IP_FAILURES) {
      setResponseHeader(event, 'Retry-After', String(LOCKOUT_SECONDS))
      throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives. Réessayez plus tard.' })
    }
    throw createError({ statusCode: 401, statusMessage: 'Adresse e-mail ou mot de passe incorrect.' })
  }

  await db.prepare(`
    DELETE FROM auth_login_attempts WHERE key_hash = ? OR updated_at <= datetime('now', '-1 day')
  `).bind(keyHash).run()
  const mfaFactors = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM auth_passkeys WHERE user_id = ?) +
      (SELECT COUNT(*) FROM auth_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL) AS count
  `).bind(credential.id, credential.id).first<{ count: number }>()
  await replaceUserSession(event, {
    user: { id: credential.id, email: credential.email, displayName: credential.display_name },
    secure: {
      sessionVersion: credential.session_version,
      mfaPending: Number(mfaFactors?.count || 0) > 0,
    },
    activeWorkspaceId: membership?.workspace_id ?? null,
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { user: { id: credential.id, email: credential.email, displayName: credential.display_name } }
})
