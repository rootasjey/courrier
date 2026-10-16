import assert from 'node:assert/strict'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRecoveryEnvironmentConfig, RECOVERY_ENVIRONMENTS } from './lib/admin-mfa-recovery.mjs'
import {
  assertCanaryAdminBaseline,
  assertCanaryAdminCleanup,
  assertCanaryAdminSetup,
  buildCanaryAdminCleanupSql,
  buildCanaryAdminCleanupVerificationSql,
  buildCanaryAdminPreflightSql,
  buildCanaryAdminSetupSql,
  buildCanaryAdminSetupVerificationSql,
  CANARY_ADMIN,
} from './lib/canary-admin-smoke.mjs'

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const WRANGLER = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler')
const CONFIG_PATH = join(PROJECT_ROOT, 'wrangler.canary.jsonc')
const ORIGIN = RECOVERY_ENVIRONMENTS.canary.publicOrigin
const USER_ID = randomUUID()
const AUDIT_ID = randomUUID()
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
    return await readline.question('Tape TESTER ET NETTOYER ADMIN CANARIE pour confirmer : ')
  } finally {
    readline.close()
  }
}

async function writeSql(directory, name, sql) {
  const path = join(directory, name)
  await writeFile(path, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return path
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
  let data = null
  const text = await response.text()
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  const cookieValues = response.headers.getSetCookie?.() || []
  const responseCookie = cookieValues.map(value => value.split(';', 1)[0]).filter(Boolean).join('; ')
  return { response, data, cookie: responseCookie }
}

async function smokeTest(password) {
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email: CANARY_ADMIN.email, password },
  })
  assert.equal(login.response.status, 200, 'synthetic admin password login should work')
  assert.ok(login.cookie, 'login should issue a session cookie')

  const session = await request('/api/account/session', { cookie: login.cookie })
  assert.equal(session.response.status, 200)
  assert.equal(session.data.user.email, CANARY_ADMIN.email)
  assert.equal(session.data.isPlatformAdmin, true)
  assert.equal(session.data.activeWorkspaceId, null)
  assert.equal(session.data.requiresAdminMfa, true)
  assert.equal(session.data.adminMfaConfigured, false)
  assert.equal(session.data.adminMfaVerified, false)

  const workspaces = await request('/api/account/workspaces', { cookie: login.cookie })
  assert.equal(workspaces.response.status, 200)
  assert.deepEqual(workspaces.data.workspaces, [])
  assert.notEqual((await request('/api/messages', { cookie: login.cookie })).response.status, 200)
  assert.equal((await request('/api/admin/overview', { cookie: login.cookie })).response.status, 403)
  assert.equal((await request('/api/admin/platform-admins', { cookie: login.cookie })).response.status, 403)

  const setup = await request('/api/account/passkeys/register/options', {
    method: 'POST', cookie: login.cookie,
    body: { label: 'Temporary canary test key', password },
  })
  assert.equal(setup.response.status, 200)
  assert.ok(setup.data.attemptId)
  assert.ok(setup.data.options.challenge)
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error('Cette commande n’accepte aucune option : elle cible uniquement la D1 et l’origine canaries définies dans le script.')
  }

  assertRecoveryEnvironmentConfig(await readFile(CONFIG_PATH, 'utf8'), 'canary')
  const [preflight] = runCanaryD1(['--command', buildCanaryAdminPreflightSql()], { json: true })
  assertCanaryAdminBaseline([preflight])
  console.log('Cible confirmée : courrier-canary-db et Worker public courrier-canary.')
  console.log(`Compte temporaire : ${CANARY_ADMIN.email}`)
  console.log('Tests : connexion sans Access, rôle global, aucun espace/boîte, refus avant MFA et options de première passkey.')
  console.log('Le mot de passe est aléatoire, reste en mémoire, ne sera jamais affiché et le compte sera supprimé après le test.')
  console.log('Seuls deux événements d’audit synthétiques sans secret resteront dans la D1 canarie.')
  if (await askConfirmation() !== 'TESTER ET NETTOYER ADMIN CANARIE') {
    throw new Error('Opération annulée. Aucun changement effectué.')
  }

  let password = randomBytes(32).toString('base64url')
  let passwordHash = ''
  let tempDirectory = ''
  let mutationStarted = false
  let smokeError
  let cleanupError
  try {
    passwordHash = await new Hash(new Scrypt()).make(password)
    tempDirectory = await mkdtemp(join(tmpdir(), 'courrier-canary-admin-smoke-'))
    const setupFile = await writeSql(tempDirectory, 'setup.sql', buildCanaryAdminSetupSql({ userId: USER_ID, auditId: AUDIT_ID, passwordHash }))
    const cleanupFile = await writeSql(tempDirectory, 'cleanup.sql', buildCanaryAdminCleanupSql({
      userId: USER_ID, cleanupAuditId: CLEANUP_AUDIT_ID,
    }))

    mutationStarted = true
    runCanaryD1(['--file', setupFile])
    const [setupState] = runCanaryD1(['--command', buildCanaryAdminSetupVerificationSql({ userId: USER_ID, auditId: AUDIT_ID })], { json: true })
    assertCanaryAdminSetup([setupState])
    await smokeTest(password)
  } catch (error) {
    smokeError = error
  } finally {
    password = ''
    passwordHash = ''
    if (mutationStarted && tempDirectory) {
      try {
        runCanaryD1(['--file', join(tempDirectory, 'cleanup.sql')])
        const [cleanupState] = runCanaryD1(['--command', buildCanaryAdminPreflightSql()], { json: true })
        assertCanaryAdminBaseline([cleanupState])
        const [cleanupVerification] = runCanaryD1(['--command', buildCanaryAdminCleanupVerificationSql({
          userId: USER_ID, auditId: AUDIT_ID, cleanupAuditId: CLEANUP_AUDIT_ID,
        })], { json: true })
        assertCanaryAdminCleanup([cleanupVerification])
      } catch (error) {
        cleanupError = error
      }
    }
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true })
  }

  if (cleanupError) {
    throw new Error('Le test a laissé un état canarie à inspecter : le nettoyage n’a pas pu être confirmé. Les credentials n’ont pas été affichés.')
  }
  if (smokeError) {
    const recovery = mutationStarted
      ? 'Le compte temporaire a été nettoyé.'
      : 'Aucune écriture canarie n’avait commencé.'
    throw new Error(`Le smoke test canarie a échoué. ${recovery} Détail : ${smokeError instanceof Error ? smokeError.message : 'erreur inconnue'}`)
  }

  console.log('Smoke test admin canarie réussi : la session globale n’accorde aucun accès mail, l’administration est refusée sans MFA, et l’amorçage passkey est disponible.')
  console.log('Le compte et son challenge ont été supprimés ; la baseline canarie membre est restaurée. Aucun mot de passe n’a été conservé.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Échec du smoke test admin canarie.')
  process.exitCode = 1
})
