import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRecoveryEnvironmentConfig, RECOVERY_ENVIRONMENTS } from './lib/admin-mfa-recovery.mjs'

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const WRANGLER = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler')
const CONFIG_PATH = join(PROJECT_ROOT, 'wrangler.canary.jsonc')
const ORIGIN = RECOVERY_ENVIRONMENTS.canary.publicOrigin
const CANARY_MEMBER_EMAIL = 'canary.member@example.invalid'
const CANARY_MAILBOX = 'inbox@canary.invalid'
const RUN_ID = randomUUID()
const OWNER_ID = randomUUID()
const OWNER_MEMBERSHIP_ID = randomUUID()
const OWNER_GRANT_AUDIT_ID = randomUUID()
const SETUP_AUDIT_ID = randomUUID()
const CLEANUP_AUDIT_ID = randomUUID()
const ACTOR_EMAIL = `canary.revoke-owner-${RUN_ID}@example.invalid`
let accessTarget = { mailboxId: '', userId: '' }

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

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

  if (result.error || result.status !== 0) {
    throw new Error(`Wrangler a échoué sur la D1 canarie (code ${result.status ?? 'inconnu'}).`)
  }
  return json ? parseWranglerJson(result.stdout) : []
}

function buildPreflightSql() {
  return `SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM workspace_memberships) AS memberships,
    (SELECT COUNT(*) FROM mailbox_access_grants) AS grants,
    (SELECT COUNT(*) FROM messages) AS messages,
    (SELECT COUNT(*) FROM attachments) AS attachments,
    (SELECT COUNT(*) FROM outgoing_drafts) AS drafts,
    (SELECT COUNT(*) FROM outgoing_draft_attachments) AS draft_attachments,
    (SELECT COUNT(*) FROM users WHERE lower(email) = lower(${sqlString(ACTOR_EMAIL)})) AS actor_email_exists,
    (SELECT COUNT(*) FROM role_permissions WHERE role = 'owner' AND permission = 'mailbox.access.manage') AS owner_access_permission,
    (SELECT id FROM workspace_domains WHERE domain = 'canary.invalid'
      AND verification_method = 'synthetic-canary-fixture' LIMIT 1) AS domain_id,
    (SELECT workspace_id FROM workspace_domains WHERE domain = 'canary.invalid'
      AND verification_method = 'synthetic-canary-fixture' LIMIT 1) AS workspace_id,
    (SELECT id FROM mailboxes WHERE lower(address) = lower(${sqlString(CANARY_MAILBOX)})
      AND status = 'active' LIMIT 1) AS mailbox_id,
    (SELECT user_id FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id
      WHERE lower(u.email) = lower(${sqlString(CANARY_MEMBER_EMAIL)}) AND wm.role = 'member'
        AND wm.status = 'active' LIMIT 1) AS target_user_id,
    (SELECT COUNT(*) FROM mailbox_access_grants g JOIN users u ON u.id = g.user_id
      JOIN mailboxes m ON m.id = g.mailbox_id AND m.workspace_id = g.workspace_id
      WHERE lower(u.email) = lower(${sqlString(CANARY_MEMBER_EMAIL)})
        AND lower(m.address) = lower(${sqlString(CANARY_MAILBOX)}) AND g.status = 'active') AS target_grant,
    (SELECT g.granted_by_user_id FROM mailbox_access_grants g JOIN users u ON u.id = g.user_id
      JOIN mailboxes m ON m.id = g.mailbox_id AND m.workspace_id = g.workspace_id
      WHERE lower(u.email) = lower(${sqlString(CANARY_MEMBER_EMAIL)})
        AND lower(m.address) = lower(${sqlString(CANARY_MAILBOX)}) AND g.status = 'active' LIMIT 1) AS target_granted_by,
    (SELECT g.created_at FROM mailbox_access_grants g JOIN users u ON u.id = g.user_id
      JOIN mailboxes m ON m.id = g.mailbox_id AND m.workspace_id = g.workspace_id
      WHERE lower(u.email) = lower(${sqlString(CANARY_MEMBER_EMAIL)})
        AND lower(m.address) = lower(${sqlString(CANARY_MAILBOX)}) AND g.status = 'active' LIMIT 1) AS target_grant_created_at`
}

function assertBaseline(rows) {
  const state = rows[0]
  assert.ok(state, 'Canary preflight must return a row.')
  for (const [key, expected] of Object.entries({
    users: 1,
    memberships: 1,
    grants: 1,
    messages: 0,
    attachments: 0,
    drafts: 0,
    draft_attachments: 0,
    actor_email_exists: 0,
    target_grant: 1,
    owner_access_permission: 1,
  })) {
    assert.equal(Number(state[key]), expected, `Unexpected canary baseline for ${key}.`)
  }
  for (const key of ['domain_id', 'workspace_id', 'mailbox_id', 'target_user_id']) {
    assert.equal(typeof state[key], 'string', `Missing canary fixture ${key}.`)
  }
  assert.equal(typeof state.target_grant_created_at, 'string', 'Missing target grant creation timestamp.')
  assert.ok(state.target_granted_by === null || typeof state.target_granted_by === 'string')
  return state
}

function buildSetupSql({ workspaceId, mailboxId, passwordHash, recoveryCodeHash, unusedRecoveryCodeHash }) {
  const now = "datetime('now')"
  return [
    `INSERT INTO users (id, email, display_name, status, session_version, created_at, updated_at)
      VALUES (${sqlString(OWNER_ID)}, ${sqlString(ACTOR_EMAIL)}, 'Canary revoke owner', 'active', 1, ${now}, ${now});`,
    `INSERT INTO password_credentials (user_id, password_hash, created_at, updated_at)
      VALUES (${sqlString(OWNER_ID)}, ${sqlString(passwordHash)}, ${now}, ${now});`,
    `INSERT INTO auth_mfa_recovery_codes (id, user_id, code_hash, created_at)
      VALUES (${sqlString(randomUUID())}, ${sqlString(OWNER_ID)}, ${sqlString(recoveryCodeHash)}, ${now});`,
    `INSERT INTO auth_mfa_recovery_codes (id, user_id, code_hash, created_at)
      VALUES (${sqlString(randomUUID())}, ${sqlString(OWNER_ID)}, ${sqlString(unusedRecoveryCodeHash)}, ${now});`,
    `INSERT INTO platform_admins (user_id, created_at, created_by_user_id)
      VALUES (${sqlString(OWNER_ID)}, ${now}, NULL);`,
    `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at)
      VALUES (${sqlString(OWNER_MEMBERSHIP_ID)}, ${sqlString(workspaceId)}, ${sqlString(OWNER_ID)}, 'owner', 'active', ${now});`,
    `INSERT INTO mailbox_access_grants (workspace_id, mailbox_id, user_id, granted_by_user_id, status, created_at)
      VALUES (${sqlString(workspaceId)}, ${sqlString(mailboxId)}, ${sqlString(OWNER_ID)}, NULL, 'active', ${now});`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      VALUES (${sqlString(OWNER_GRANT_AUDIT_ID)}, ${sqlString(OWNER_ID)}, 'canary.mailbox_access.test_fixture',
        'user', ${sqlString(OWNER_ID)}, ${sqlString(workspaceId)},
        '{"environment":"canary","synthetic":true,"purpose":"mailbox_access_revocation_test"}', ${now});`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      VALUES (${sqlString(SETUP_AUDIT_ID)}, ${sqlString(OWNER_ID)}, 'canary.mailbox_access.test_started',
        'user', ${sqlString(OWNER_ID)}, ${sqlString(workspaceId)},
        '{"environment":"canary","synthetic":true}', ${now});`,
  ].join('\n')
}

function buildCleanupSql({ workspaceId, mailboxId, targetUserId, grantedByUserId, grantCreatedAt }) {
  const now = "datetime('now')"
  return [
    `UPDATE mailbox_access_grants SET status = 'active', revoked_at = NULL,
      granted_by_user_id = ${grantedByUserId === null ? 'NULL' : sqlString(grantedByUserId)},
      created_at = ${sqlString(grantCreatedAt)}
      WHERE workspace_id = ${sqlString(workspaceId)} AND mailbox_id = ${sqlString(mailboxId)}
        AND user_id = ${sqlString(targetUserId)};`,
    `DELETE FROM mailbox_access_grants WHERE workspace_id = ${sqlString(workspaceId)}
      AND mailbox_id = ${sqlString(mailboxId)} AND user_id = ${sqlString(OWNER_ID)};`,
    `DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${sqlString(OWNER_ID)};`,
    `DELETE FROM password_credentials WHERE user_id = ${sqlString(OWNER_ID)};`,
    `DELETE FROM platform_admins WHERE user_id = ${sqlString(OWNER_ID)};`,
    `DELETE FROM workspace_memberships WHERE id = ${sqlString(OWNER_MEMBERSHIP_ID)}
      AND workspace_id = ${sqlString(workspaceId)} AND user_id = ${sqlString(OWNER_ID)};`,
    `DELETE FROM users WHERE id = ${sqlString(OWNER_ID)} AND lower(email) = lower(${sqlString(ACTOR_EMAIL)});`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ${sqlString(CLEANUP_AUDIT_ID)}, NULL, 'canary.mailbox_access.test_cleanup', 'user',
        ${sqlString(OWNER_ID)}, ${sqlString(workspaceId)},
        '{"environment":"canary","synthetic":true,"account_removed":true}', ${now}
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = ${sqlString(OWNER_ID)});`,
  ].join('\n')
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
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {}
  const cookieValues = response.headers.getSetCookie?.() || []
  const responseCookie = cookieValues.map(value => value.split(';', 1)[0]).filter(Boolean).join('; ')
  return { status: response.status, data, cookie: responseCookie }
}

async function main() {
  if (process.argv.length > 2) throw new Error('Cette commande n’accepte aucun argument.')
  await assertRecoveryEnvironmentConfig(await readFile(CONFIG_PATH, 'utf8'), 'canary')
  const [preflight] = runCanaryD1(['--command', buildPreflightSql()], { json: true })
  const fixture = assertBaseline([preflight])
  accessTarget = { mailboxId: fixture.mailbox_id, userId: fixture.target_user_id }

  let password = randomBytes(32).toString('base64url')
  let recoveryCode = randomBytes(16).toString('hex').toUpperCase().match(/.{4}/gu).join('-')
  const unusedRecoveryCodeHash = createHash('sha256').update(randomBytes(16).toString('hex').toUpperCase()).digest('hex')
  const passwordHash = await new Hash(new Scrypt()).make(password)
  const recoveryCodeHash = createHash('sha256').update(recoveryCode.replaceAll('-', '')).digest('hex')
  const tempDirectory = await mkdtemp(join(tmpdir(), 'courrier-canary-mailbox-revoke-'))
  let setupStarted = false
  let testError
  let cleanupFailed = false

  try {
    const setupFile = await writeSql(tempDirectory, 'setup.sql', buildSetupSql({
      workspaceId: fixture.workspace_id,
      mailboxId: fixture.mailbox_id,
      passwordHash,
      recoveryCodeHash,
      unusedRecoveryCodeHash,
    }))
    setupStarted = true
    runCanaryD1(['--file', setupFile])

    const login = await request('/api/auth/login', { method: 'POST', body: { email: ACTOR_EMAIL, password } })
    assert.equal(login.status, 200, 'Synthetic canary owner login failed.')
    assert.ok(login.cookie, 'Synthetic canary owner login returned no session cookie.')
    const verify = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: login.cookie, body: { recoveryCode },
    })
    assert.equal(verify.status, 200, 'Synthetic canary MFA step-up failed.')
    const cookie = verify.cookie || login.cookie

    const grant = await request('/api/workspace/mailbox-access', {
      method: 'POST', cookie,
      body: { mailboxId: accessTarget.mailboxId, userId: accessTarget.userId },
    })
    assert.equal(grant.status, 200,
      `Canary mailbox grant returned ${grant.status}: ${grant.data?.statusMessage || grant.data?.message || 'no safe response detail'}.`)

    const workspaceRevoke = await request(`/api/workspace/mailbox-access?mailboxId=${encodeURIComponent(accessTarget.mailboxId)}&userId=${encodeURIComponent(accessTarget.userId)}`, {
      method: 'DELETE', cookie,
    })
    assert.equal(workspaceRevoke.status, 200, `Canary workspace revoke returned ${workspaceRevoke.status}.`)
    assert.equal(workspaceRevoke.data?.revoked, true)

    const adminGrant = await request('/api/workspace/mailbox-access', {
      method: 'POST', cookie,
      body: { mailboxId: accessTarget.mailboxId, userId: accessTarget.userId },
    })
    assert.equal(adminGrant.status, 200, 'Canary re-grant before admin-route test failed.')
    const adminRevoke = await request(`/api/admin/mailbox-access?mailboxId=${encodeURIComponent(accessTarget.mailboxId)}&userId=${encodeURIComponent(accessTarget.userId)}`, {
      method: 'DELETE', cookie,
    })
    assert.equal(adminRevoke.status, 200, `Canary admin revoke returned ${adminRevoke.status}.`)
    assert.equal(adminRevoke.data?.revoked, true)
  } catch (error) {
    testError = error
  } finally {
    password = ''
    recoveryCode = ''
    if (setupStarted) {
      try {
        const cleanupFile = await writeSql(tempDirectory, 'cleanup.sql', buildCleanupSql({
          workspaceId: fixture.workspace_id,
          mailboxId: fixture.mailbox_id,
          targetUserId: accessTarget.userId,
          grantedByUserId: fixture.target_granted_by,
          grantCreatedAt: fixture.target_grant_created_at,
        }))
        runCanaryD1(['--file', cleanupFile])
        const [postflight] = runCanaryD1(['--command', buildPreflightSql()], { json: true })
        assertBaseline([postflight])
        assert.equal(postflight.target_granted_by, fixture.target_granted_by, 'Target grant actor changed during cleanup.')
        assert.equal(postflight.target_grant_created_at, fixture.target_grant_created_at, 'Target grant timestamp changed during cleanup.')
      } catch {
        cleanupFailed = true
      }
    }
    await rm(tempDirectory, { recursive: true, force: true })
    if (cleanupFailed) {
      throw new Error('Échec du nettoyage canari; inspecter uniquement courrier-canary-db avant toute suite.')
    }
  }

  if (testError) throw new Error(`Test canari de révocation échoué; la fixture a été nettoyée. ${testError.message}`)
  console.log('PASS: owner MFA, grant, workspace revoke, re-grant, admin revoke; baseline canari restaurée.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Échec du test canari de révocation.')
  process.exitCode = 1
})
