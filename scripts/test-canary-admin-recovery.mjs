import assert from 'node:assert/strict'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRecoveryEnvironmentConfig, RECOVERY_ENVIRONMENTS, sqlString } from './lib/admin-mfa-recovery.mjs'
import { assertCanaryAdminBaseline, CANARY_ADMIN, buildCanaryAdminPreflightSql } from './lib/canary-admin-smoke.mjs'
import {
  assertCanaryAdminRecoveryCleanup,
  buildCanaryAdminRecoveryCleanupSql,
  buildCanaryAdminRecoverySetupSql,
  buildCanaryAdminRecoveryVerificationSql,
} from './lib/canary-admin-recovery.mjs'

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const WRANGLER = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler')
const CONFIG_PATH = join(PROJECT_ROOT, 'wrangler.canary.jsonc')
const ORIGIN = RECOVERY_ENVIRONMENTS.canary.publicOrigin
const RUN_ID = randomUUID()
const ACTOR_ID = randomUUID()
const TARGET_ID = randomUUID()
const ACTOR_EMAIL = `canary.admin-recovery-actor-${RUN_ID}@example.invalid`
const TARGET_EMAIL = `canary.admin-recovery-target-${RUN_ID}@example.invalid`
const ACTOR_RECOVERY_ID = randomUUID()
const TARGET_RECOVERY_ID = randomUUID()
const ACTOR_CREDENTIAL_ID = randomBytes(32).toString('base64url')
const TARGET_CREDENTIAL_ID = randomBytes(32).toString('base64url')
const STEP_UP_CHALLENGE_ID = randomUUID()
const LOGIN_CHALLENGE_ID = randomUUID()
const STARTED_AUDIT_ID = randomUUID()
const CLEANUP_AUDIT_ID = randomUUID()

function parseWranglerJson(output) {
  try {
    const parsed = JSON.parse(output)
    const statements = Array.isArray(parsed) ? parsed : [parsed]
    return statements.flatMap(statement => Array.isArray(statement.results) ? statement.results : [])
  } catch {
    throw new Error('Wrangler n’a pas renvoyé de résultat JSON exploitable.')
  }
}

function runCanaryD1(args, { json = false } = {}) {
  const result = spawnSync(WRANGLER, [
    'd1', 'execute', 'DB', '--remote', '--config', CONFIG_PATH, '--yes',
    ...(json ? ['--json'] : []),
    ...args,
  ], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
    env: { ...process.env, WRANGLER_WRITE_LOGS: '0' },
  })

  if (result.error) throw new Error('Wrangler est indisponible. Vérifie les dépendances du dépôt.')
  if (result.status !== 0) {
    throw new Error(`Wrangler a échoué sur la D1 canarie (code ${result.status ?? 'inconnu'}).`)
  }
  return json ? parseWranglerJson(result.stdout) : []
}

async function askConfirmation() {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error('Cette commande exige un terminal interactif. Aucun changement effectué.')
  }
  const readline = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return await readline.question('Tape TESTER ET NETTOYER RECUPERATION ADMIN CANARIE pour confirmer : ')
  } finally {
    readline.close()
  }
}

async function writeSql(directory, name, sql) {
  const path = join(directory, name)
  await writeFile(path, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return path
}

function makeRecoveryCode() {
  return randomBytes(16).toString('hex').toUpperCase().match(/.{4}/gu).join('-')
}

function hashRecoveryCode(code) {
  return createHash('sha256').update(code.replaceAll('-', '')).digest('hex')
}

async function makePasswordHash() {
  const password = randomBytes(32).toString('base64url')
  return { password, passwordHash: await new Hash(new Scrypt()).make(password) }
}

async function request(route, { method = 'GET', cookie = '', body } = {}) {
  const headers = { origin: ORIGIN }
  if (cookie) headers.cookie = cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(new URL(route, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: 'manual',
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  const cookieValues = response.headers.getSetCookie?.() || []
  const responseCookie = cookieValues.map(value => value.split(';', 1)[0]).filter(Boolean).join('; ')
  return { response, data, cookie: responseCookie }
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error('Cette commande n’accepte aucune option : elle cible uniquement la D1 et l’origine canaries définies dans le script.')
  }

  assertRecoveryEnvironmentConfig(await readFile(CONFIG_PATH, 'utf8'), 'canary')
  const [preflight] = runCanaryD1(['--command', buildCanaryAdminPreflightSql()], { json: true })
  assertCanaryAdminBaseline([preflight])
  console.log('Cible confirmée : courrier-canary-db et Worker public courrier-canary.')
  console.log('Deux comptes .invalid temporaires seront créés avec facteurs synthétiques, sans espace ni accès à une boîte.')
  console.log('Le test consommera un code synthétique pour le step-up, récupérera le second compte et vérifiera son ré-enrôlement.')
  console.log('Les comptes et facteurs seront supprimés. Seuls les événements d’audit synthétiques sans secret resteront en D1.')
  if (await askConfirmation() !== 'TESTER ET NETTOYER RECUPERATION ADMIN CANARIE') {
    throw new Error('Opération annulée. Aucun changement effectué.')
  }

  let actorPassword = ''
  let targetPassword = ''
  let actorRecoveryCode = ''
  let tempDirectory = ''
  let mutationStarted = false
  let smokeError
  let cleanupError
  try {
    const [actorCredential, targetCredential] = await Promise.all([makePasswordHash(), makePasswordHash()])
    actorPassword = actorCredential.password
    targetPassword = targetCredential.password
    actorRecoveryCode = makeRecoveryCode()
    const targetRecoveryCode = makeRecoveryCode()
    tempDirectory = await mkdtemp(join(tmpdir(), 'courrier-canary-admin-recovery-'))
    const setupSql = buildCanaryAdminRecoverySetupSql({
      actorId: ACTOR_ID,
      actorEmail: ACTOR_EMAIL,
      actorPasswordHash: actorCredential.passwordHash,
      actorRecoveryHash: hashRecoveryCode(actorRecoveryCode),
      actorRecoveryId: ACTOR_RECOVERY_ID,
      actorCredentialId: ACTOR_CREDENTIAL_ID,
      targetId: TARGET_ID,
      targetEmail: TARGET_EMAIL,
      targetPasswordHash: targetCredential.passwordHash,
      targetRecoveryHash: hashRecoveryCode(targetRecoveryCode),
      targetRecoveryId: TARGET_RECOVERY_ID,
      targetCredentialId: TARGET_CREDENTIAL_ID,
      stepUpChallengeId: STEP_UP_CHALLENGE_ID,
      loginChallengeId: LOGIN_CHALLENGE_ID,
      startedAuditId: STARTED_AUDIT_ID,
    })
    const cleanupSql = buildCanaryAdminRecoveryCleanupSql({
      actorId: ACTOR_ID,
      actorEmail: ACTOR_EMAIL,
      targetId: TARGET_ID,
      targetEmail: TARGET_EMAIL,
      cleanupAuditId: CLEANUP_AUDIT_ID,
    })
    const setupPath = await writeSql(tempDirectory, 'setup.sql', setupSql)
    const cleanupPath = await writeSql(tempDirectory, 'cleanup.sql', cleanupSql)

    mutationStarted = true
    runCanaryD1(['--file', setupPath])
    const [setupState] = runCanaryD1(['--command', `SELECT
      (SELECT COUNT(*) FROM users WHERE id IN (${sqlString(ACTOR_ID)}, ${sqlString(TARGET_ID)}) AND status = 'active') AS users_created,
      (SELECT COUNT(*) FROM platform_admins WHERE user_id IN (${sqlString(ACTOR_ID)}, ${sqlString(TARGET_ID)})) AS admin_roles_created,
      (SELECT COUNT(*) FROM workspace_memberships WHERE user_id IN (${sqlString(ACTOR_ID)}, ${sqlString(TARGET_ID)})) AS memberships_created,
      (SELECT COUNT(*) FROM mailbox_access_grants WHERE user_id IN (${sqlString(ACTOR_ID)}, ${sqlString(TARGET_ID)})) AS grants_created,
      (SELECT COUNT(*) FROM auth_passkeys WHERE user_id IN (${sqlString(ACTOR_ID)}, ${sqlString(TARGET_ID)})) AS passkeys_seeded,
      (SELECT COUNT(*) FROM auth_mfa_recovery_codes WHERE user_id IN (${sqlString(ACTOR_ID)}, ${sqlString(TARGET_ID)})) AS recovery_codes_seeded,
      (SELECT COUNT(*) FROM auth_webauthn_challenges WHERE user_id = ${sqlString(TARGET_ID)}) AS target_challenges_seeded`], { json: true })
    assert.deepEqual(Object.fromEntries(Object.entries(setupState || {}).map(([key, value]) => [key, Number(value)])), {
      users_created: 2,
      admin_roles_created: 2,
      memberships_created: 0,
      grants_created: 0,
      passkeys_seeded: 2,
      recovery_codes_seeded: 2,
      target_challenges_seeded: 2,
    })

    const actorLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: ACTOR_EMAIL, password: actorPassword },
    })
    assert.equal(actorLogin.response.status, 200, 'synthetic acting admin password login should work')
    assert.ok(actorLogin.cookie, 'acting admin login should issue a session cookie')
    const actorStepUp = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: actorLogin.cookie, body: { recoveryCode: actorRecoveryCode },
    })
    assert.equal(actorStepUp.response.status, 200, 'synthetic recovery code should complete the admin step-up')
    assert.equal(actorStepUp.data.method, 'recovery_code')
    const actorCookie = actorStepUp.cookie || actorLogin.cookie
    const actorSession = await request('/api/account/session', { cookie: actorCookie })
    assert.equal(actorSession.response.status, 200)
    assert.equal(actorSession.data.adminMfaVerified, true)

    const targetLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: TARGET_EMAIL, password: targetPassword },
    })
    assert.equal(targetLogin.response.status, 200, 'target admin should be able to create a pre-recovery session')
    const targetSession = await request('/api/account/session', { cookie: targetLogin.cookie })
    assert.equal(targetSession.response.status, 200)
    assert.equal(targetSession.data.isPlatformAdmin, true)
    assert.equal(targetSession.data.mfaPending, true)
    assert.equal((await request('/api/messages', { cookie: targetLogin.cookie })).response.status, 403)

    const recovery = await request(`/api/admin/platform-admins/${TARGET_ID}/mfa-recovery`, {
      method: 'POST', cookie: actorCookie, body: { confirmationEmail: TARGET_EMAIL.toUpperCase() },
    })
    assert.equal(recovery.response.status, 200, JSON.stringify(recovery.data))
    assert.equal(recovery.data.recovered, true)
    assert.equal(recovery.data.reauthenticationRequired, true)
    assert.equal((await request('/api/account/session', { cookie: targetLogin.cookie })).response.status, 401)
    assert.equal((await request('/api/admin/overview', { cookie: actorCookie })).response.status, 200)

    const [targetFactorsAfterRecovery] = runCanaryD1(['--command', `SELECT
      (SELECT session_version FROM users WHERE id = ${sqlString(TARGET_ID)}) AS session_version,
      (SELECT COUNT(*) FROM auth_passkeys WHERE user_id = ${sqlString(TARGET_ID)}) AS passkeys_remaining,
      (SELECT COUNT(*) FROM auth_mfa_recovery_codes WHERE user_id = ${sqlString(TARGET_ID)}) AS recovery_codes_remaining,
      (SELECT COUNT(*) FROM auth_webauthn_challenges WHERE user_id = ${sqlString(TARGET_ID)}) AS challenges_remaining`], { json: true })
    assert.deepEqual(Object.fromEntries(Object.entries(targetFactorsAfterRecovery || {}).map(([key, value]) => [key, Number(value)])), {
      session_version: 2,
      passkeys_remaining: 0,
      recovery_codes_remaining: 0,
      challenges_remaining: 0,
    })

    const afterRecoveryLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: TARGET_EMAIL, password: targetPassword },
    })
    assert.equal(afterRecoveryLogin.response.status, 200)
    const afterRecoverySession = await request('/api/account/session', { cookie: afterRecoveryLogin.cookie })
    assert.equal(afterRecoverySession.response.status, 200)
    assert.equal(afterRecoverySession.data.isPlatformAdmin, true)
    assert.equal(afterRecoverySession.data.adminMfaConfigured, false)
    assert.equal(afterRecoverySession.data.requiresAdminMfa, true)
    assert.equal(afterRecoverySession.data.adminMfaVerified, false)
    assert.equal((await request('/api/admin/overview', { cookie: afterRecoveryLogin.cookie })).response.status, 403)
    assert.equal((await request('/api/messages', { cookie: afterRecoveryLogin.cookie })).response.status, 403)

    const factors = await request('/api/account/passkeys', { cookie: afterRecoveryLogin.cookie })
    assert.equal(factors.response.status, 200)
    assert.deepEqual(factors.data.passkeys, [])
    assert.equal(factors.data.recoveryCodesRemaining, 0)
    const enrollment = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: afterRecoveryLogin.cookie,
      body: { label: 'Synthetic canary recovery key', password: targetPassword },
    })
    assert.equal(enrollment.response.status, 200, JSON.stringify(enrollment.data))
    assert.ok(enrollment.data.attemptId)

    const [recoveryAudit] = runCanaryD1(['--command', `SELECT COUNT(*) AS count FROM platform_audit_log
      WHERE action = ${sqlString('platform_admin.mfa_recovered_by_admin')} AND target_id = ${sqlString(TARGET_ID)}`], { json: true })
    assert.equal(Number(recoveryAudit?.count), 1, 'recovery action should be recorded exactly once')
  } catch (error) {
    smokeError = error
  } finally {
    actorPassword = ''
    targetPassword = ''
    actorRecoveryCode = ''
    if (mutationStarted && tempDirectory) {
      try {
        runCanaryD1(['--file', join(tempDirectory, 'cleanup.sql')])
        const [cleanupState] = runCanaryD1(['--command', buildCanaryAdminRecoveryVerificationSql({
          actorId: ACTOR_ID,
          targetId: TARGET_ID,
          targetEmail: TARGET_EMAIL,
          startedAuditId: STARTED_AUDIT_ID,
          cleanupAuditId: CLEANUP_AUDIT_ID,
        })], { json: true })
        assertCanaryAdminRecoveryCleanup([cleanupState])
        const [baseline] = runCanaryD1(['--command', buildCanaryAdminPreflightSql()], { json: true })
        assertCanaryAdminBaseline([baseline])
      } catch (error) {
        cleanupError = error
      }
    }
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true })
  }

  if (cleanupError) {
    throw new Error('Le test canarie a laissé un état à inspecter. Les comptes synthétiques n’ont pas pu être nettoyés ou vérifiés.')
  }
  if (smokeError) {
    const recovery = mutationStarted
      ? 'Les deux comptes temporaires ont été nettoyés et la baseline canarie a été vérifiée.'
      : 'Aucune écriture canarie n’avait commencé.'
    throw new Error(`Le test de récupération canarie a échoué. ${recovery} Détail : ${smokeError instanceof Error ? smokeError.message : 'erreur inconnue'}`)
  }

  console.log('Récupération par un second administrateur canarie validée : step-up requis, sessions et facteurs ciblés révoqués, ré-enrôlement possible et administration refusée jusque-là.')
  console.log('Les deux comptes et leurs facteurs ont été supprimés ; la baseline canarie membre est restaurée. Aucun secret n’a été conservé.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Échec du test de récupération admin canarie.')
  process.exitCode = 1
})

