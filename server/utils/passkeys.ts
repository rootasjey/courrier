import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON, WebAuthnCredential } from '@simplewebauthn/types'
import type { H3Event } from 'h3'
import type { AccountDb, AccountIdentity } from './account-auth'

export const ADMIN_MFA_MAX_AGE_MS = 30 * 60 * 1000
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000
const MAX_MFA_FAILURES = 8
const MFA_LOCKOUT_SECONDS = 15 * 60

export type PasskeyRow = {
  credential_id: string
  user_id: string
  public_key: string
  counter: number
  transports_json: string
  device_type: string
  backed_up: number
  label: string
  created_at: string
  last_used_at: string | null
}

type ChallengePurpose = 'register' | 'admin_step_up'
type WebAuthnEnvironment = { COURRIER_PUBLIC_ORIGIN?: string }
type AppSession = Awaited<ReturnType<typeof getUserSession>>

export function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function bytesFromBase64Url(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function hexFromBytes(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string) {
  return hexFromBytes(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

export function normalizeRecoveryCode(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[\s-]/gu, '').toUpperCase()
  return /^[0-9A-F]{32}$/u.test(normalized) ? normalized : null
}

export async function hashRecoveryCode(value: string) {
  return sha256(normalizeRecoveryCode(value) || value)
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const value = hexFromBytes(bytes).toUpperCase()
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 24)}-${value.slice(24, 28)}-${value.slice(28, 32)}`
  })
}

export async function getWebAuthnRelyingParty(event: H3Event) {
  const requestUrl = getRequestURL(event)
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname)
  let configuredOrigin: string | undefined

  if (import.meta.dev && isLocalHost) {
    configuredOrigin = requestUrl.origin
  } else {
    const env = (event.context.cloudflare as { env?: WebAuthnEnvironment } | undefined)?.env
    configuredOrigin = env?.COURRIER_PUBLIC_ORIGIN
  }

  let origin: URL
  try { origin = new URL(configuredOrigin || '') } catch {
    throw createError({ statusCode: 503, statusMessage: 'La configuration des passkeys est indisponible.' })
  }

  const localHttp = origin.protocol === 'http:' && isLocalHost && import.meta.dev
  if ((!localHttp && origin.protocol !== 'https:') || origin.origin !== configuredOrigin) {
    throw createError({ statusCode: 503, statusMessage: 'La configuration des passkeys est indisponible.' })
  }
  if (origin.origin !== requestUrl.origin) {
    throw createError({ statusCode: 403, statusMessage: 'Utilise le domaine Courrier habituel pour vérifier cette passkey.' })
  }

  return { origin: origin.origin, rpID: origin.hostname }
}

export function isMfaFresh(session: AppSession) {
  const verifiedAt = session.secure?.mfaVerifiedAt
  if (typeof verifiedAt !== 'number' || !Number.isSafeInteger(verifiedAt)) return false
  const age = Date.now() - verifiedAt
  return age >= 0 && age < ADMIN_MFA_MAX_AGE_MS
}

export async function markMfaVerified(event: H3Event, method: 'passkey' | 'recovery_code') {
  const session = await getUserSession(event) as AppSession
  if (!session.secure) throw createError({ statusCode: 401, statusMessage: 'Session Courrier requise.' })
  await replaceUserSession(event, {
    ...session,
    secure: {
      ...session.secure,
      mfaVerifiedAt: Date.now(),
      mfaMethod: method,
    },
  })
}

export async function issueWebAuthnChallenge(
  db: AccountDb,
  user: AccountIdentity,
  purpose: ChallengePurpose,
  challenge: string,
  label: string | null = null,
) {
  await db.prepare("DELETE FROM auth_webauthn_challenges WHERE datetime(expires_at) <= datetime('now')")
    .run()
  const attemptId = base64UrlFromBytes(crypto.getRandomValues(new Uint8Array(32)))
  const now = new Date()
  await db.prepare(`
    INSERT INTO auth_webauthn_challenges
      (attempt_id, user_id, session_version, purpose, challenge, label, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    attemptId,
    user.id,
    user.sessionVersion,
    purpose,
    challenge,
    label,
    now.toISOString(),
    new Date(now.getTime() + CHALLENGE_LIFETIME_MS).toISOString(),
  ).run()
  return attemptId
}

export async function consumeWebAuthnChallenge(
  db: AccountDb,
  input: { attemptId: unknown, user: AccountIdentity, purpose: ChallengePurpose },
) {
  if (typeof input.attemptId !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(input.attemptId)) return null
  const row = await db.prepare(`
    SELECT challenge, label
    FROM auth_webauthn_challenges
    WHERE attempt_id = ? AND user_id = ? AND session_version = ? AND purpose = ?
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).bind(input.attemptId, input.user.id, input.user.sessionVersion, input.purpose)
    .first<{ challenge: string, label: string | null }>()
  if (!row) return null

  const deleted = await db.prepare(`
    DELETE FROM auth_webauthn_challenges
    WHERE attempt_id = ? AND user_id = ? AND session_version = ? AND purpose = ?
      AND datetime(expires_at) > datetime('now')
  `).bind(input.attemptId, input.user.id, input.user.sessionVersion, input.purpose).run()
  if (Number((deleted as { meta?: { changes?: number } } | undefined)?.meta?.changes || 0) !== 1) return null
  return row
}

export async function getUserPasskeys(db: AccountDb, userId: string) {
  const result = await db.prepare(`
    SELECT credential_id, user_id, public_key, counter, transports_json,
      device_type, backed_up, label, created_at, last_used_at
    FROM auth_passkeys WHERE user_id = ? ORDER BY created_at ASC
  `).bind(userId).all<PasskeyRow>()
  return result.results
}

export function toWebAuthnCredential(passkey: PasskeyRow): WebAuthnCredential {
  let transports: WebAuthnCredential['transports']
  try {
    const parsed = JSON.parse(passkey.transports_json)
    if (Array.isArray(parsed)) transports = parsed
  } catch { transports = undefined }
  return {
    id: passkey.credential_id,
    publicKey: bytesFromBase64Url(passkey.public_key),
    counter: passkey.counter,
    transports,
  }
}

export async function createRegistrationOptions(
  event: H3Event,
  user: AccountIdentity,
  passkeys: PasskeyRow[],
) {
  const relyingParty = await getWebAuthnRelyingParty(event)
  const options = await generateRegistrationOptions({
    rpName: 'Courrier',
    rpID: relyingParty.rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.displayName,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials: passkeys.map(passkey => ({
      id: passkey.credential_id,
      transports: toWebAuthnCredential(passkey).transports,
    })),
  })
  return { options, relyingParty }
}

export async function verifyRegistration(
  event: H3Event,
  response: RegistrationResponseJSON,
  challenge: string,
) {
  const relyingParty = await getWebAuthnRelyingParty(event)
  return verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: relyingParty.origin,
    expectedRPID: relyingParty.rpID,
    requireUserVerification: true,
  })
}

export async function createAuthenticationOptions(event: H3Event, passkeys: PasskeyRow[]) {
  const relyingParty = await getWebAuthnRelyingParty(event)
  const options = await generateAuthenticationOptions({
    rpID: relyingParty.rpID,
    allowCredentials: passkeys.map(passkey => ({
      id: passkey.credential_id,
      transports: toWebAuthnCredential(passkey).transports,
    })),
    userVerification: 'required',
  })
  return { options, relyingParty }
}

export async function verifyAuthentication(
  event: H3Event,
  response: AuthenticationResponseJSON,
  challenge: string,
  passkey: PasskeyRow,
) {
  const relyingParty = await getWebAuthnRelyingParty(event)
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: relyingParty.origin,
    expectedRPID: relyingParty.rpID,
    requireUserVerification: true,
    credential: toWebAuthnCredential(passkey),
  })
}

async function getMfaAttemptKey(event: H3Event, userId: string) {
  const ip = getRequestHeader(event, 'cf-connecting-ip') || (import.meta.dev ? 'local' : '')
  if (!ip) throw createError({ statusCode: 503, statusMessage: 'La vérification anti-abus est indisponible.' })
  return sha256(`mfa\0${userId}\0${ip}`)
}

export async function assertMfaAttemptsAvailable(event: H3Event, db: AccountDb, userId: string) {
  const keyHash = await getMfaAttemptKey(event, userId)
  const row = await db.prepare(`
    SELECT locked_until FROM auth_login_attempts WHERE key_hash = ? LIMIT 1
  `).bind(keyHash).first<{ locked_until: string | null }>()
  const lockedUntil = row?.locked_until ? Date.parse(`${row.locked_until}Z`) : Number.NaN
  if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
    setResponseHeader(event, 'Retry-After', Math.ceil((lockedUntil - Date.now()) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives. Réessaie plus tard.' })
  }
}

export async function recordMfaFailure(event: H3Event, db: AccountDb, userId: string) {
  const keyHash = await getMfaAttemptKey(event, userId)
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
        END) >= ${MAX_MFA_FAILURES} THEN datetime('now', '+15 minutes')
        ELSE NULL
      END,
      updated_at = datetime('now')
  `).bind(keyHash).run()
  const row = await db.prepare('SELECT failed_attempts FROM auth_login_attempts WHERE key_hash = ?')
    .bind(keyHash).first<{ failed_attempts: number }>()
  if (Number(row?.failed_attempts || 0) >= MAX_MFA_FAILURES) {
    setResponseHeader(event, 'Retry-After', MFA_LOCKOUT_SECONDS)
    throw createError({ statusCode: 429, statusMessage: 'Trop de tentatives. Réessaie plus tard.' })
  }
}

export async function clearMfaFailures(event: H3Event, db: AccountDb, userId: string) {
  const keyHash = await getMfaAttemptKey(event, userId)
  await db.prepare('DELETE FROM auth_login_attempts WHERE key_hash = ?').bind(keyHash).run()
}

export function isValidPasskeyLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/u.test(value)
}

export async function createPasskeyRecoveryRecords(db: AccountDb, userId: string, codes: string[]) {
  const createdAt = new Date().toISOString()
  const inserts = await Promise.all(codes.map(async (code) => {
    const normalized = normalizeRecoveryCode(code)
    if (!normalized) throw new TypeError('Invalid recovery code format.')
    return db.prepare(`
      INSERT INTO auth_mfa_recovery_codes (id, user_id, code_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), userId, await hashRecoveryCode(normalized), createdAt)
  }))
  return inserts
}
