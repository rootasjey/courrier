import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const WRANGLER = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler')
const CONFIG_PATH = join(PROJECT_ROOT, 'wrangler.canary.jsonc')
const ACCOUNT_EMAIL = 'canary.member@example.invalid'
const ACCOUNT_NAME = 'Membre synthétique canarie'
const WORKSPACE_NAME = 'Espace synthétique canarie'
const DOMAIN = 'canary.invalid'
const MAILBOX_ADDRESS = 'inbox@canary.invalid'
const WORKSPACE_ID = randomUUID()
const DOMAIN_ID = randomUUID()
const MAILBOX_ID = randomUUID()
const USER_ID = randomUUID()
const MEMBERSHIP_ID = randomUUID()
const AUDIT_ID = randomUUID()
const AUDIT_ACTION = 'canary.synthetic_member.bootstrap'

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
  })

  if (result.error) throw new Error('Wrangler est indisponible. Vérifie les dépendances du dépôt.')
  if (result.status !== 0) {
    throw new Error(`Wrangler a échoué sur la D1 canarie (code ${result.status ?? 'inconnu'}).`)
  }
  return json ? parseWranglerJson(result.stdout) : []
}

async function assertCanaryTarget() {
  let config
  try {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  } catch {
    throw new Error('La configuration canarie est absente ou n’est pas un JSON valide.')
  }

  const [database] = config.d1_databases || []
  const buckets = (config.r2_buckets || []).map(bucket => bucket.bucket_name).sort()
  const bindings = [
    ...(config.d1_databases || []).map(item => item.binding),
    ...(config.r2_buckets || []).map(item => item.binding),
  ].sort()

  if (config.name !== 'courrier-canary'
    || config.vars?.COURRIER_PUBLIC_ORIGIN !== 'https://courrier-canary.jerem-dev.workers.dev'
    || config.vars?.NUXT_SESSION_NAME !== 'courrier-canary-session'
    || config.workers_dev !== true
    || config.preview_urls !== false
    || config.routes?.length
    || config.env
    || config.triggers?.crons?.length
    || database?.binding !== 'DB'
    || database?.database_name !== 'courrier-canary-db'
    || database?.database_id !== '3d83a490-df46-48ed-84a5-ee6a201a50d1'
    || config.d1_databases?.length !== 1
    || JSON.stringify(buckets) !== JSON.stringify(['courrier-canary-mail-backup', 'courrier-canary-mail-store'])
    || JSON.stringify(bindings) !== JSON.stringify(['BACKUP_STORE', 'DB', 'MAIL_STORE'])
    || config.send_email?.length
    || config.email?.length) {
    throw new Error('La configuration ne correspond plus à la canarie isolée attendue. Aucun changement effectué.')
  }
}

function assertEmptyCanary(rows) {
  const state = rows[0]
  const requiredZeros = [
    'users', 'memberships', 'grants', 'messages', 'attachments',
    'outgoing_drafts', 'draft_attachments', 'account_email_exists',
    'synthetic_domain_exists', 'synthetic_mailbox_exists',
  ]
  if (!state
    || requiredZeros.some(key => Number(state[key]) !== 0)
    || Number(state.legacy_workspace_exists) !== 1
    || Number(state.legacy_mailbox_exists) !== 1) {
    throw new Error('Prévol refusé : la canarie contient déjà des données ou son socle attendu est absent. Aucun changement effectué.')
  }
}

function buildPreflightSql() {
  return `SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM workspace_memberships) AS memberships,
    (SELECT COUNT(*) FROM mailbox_access_grants) AS grants,
    (SELECT COUNT(*) FROM messages) AS messages,
    (SELECT COUNT(*) FROM attachments) AS attachments,
    (SELECT COUNT(*) FROM outgoing_drafts) AS outgoing_drafts,
    (SELECT COUNT(*) FROM outgoing_draft_attachments) AS draft_attachments,
    EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(${sqlString(ACCOUNT_EMAIL)})) AS account_email_exists,
    EXISTS (SELECT 1 FROM workspace_domains WHERE lower(domain) = lower(${sqlString(DOMAIN)})) AS synthetic_domain_exists,
    EXISTS (SELECT 1 FROM mailboxes WHERE lower(address) = lower(${sqlString(MAILBOX_ADDRESS)})) AS synthetic_mailbox_exists,
    EXISTS (SELECT 1 FROM workspaces WHERE id = 'legacy-courrier-workspace') AS legacy_workspace_exists,
    EXISTS (SELECT 1 FROM mailboxes WHERE workspace_id = 'legacy-courrier-workspace' AND lower(address) = 'courrier-test@verbatims.cc') AS legacy_mailbox_exists`
}

function buildSetupSql(passwordHash) {
  const now = "datetime('now')"
  return [
    `INSERT INTO workspaces (id, name, status, created_at, updated_at) VALUES (${sqlString(WORKSPACE_ID)}, ${sqlString(WORKSPACE_NAME)}, 'active', ${now}, ${now});`,
    `INSERT INTO workspace_domains (id, workspace_id, domain, verification_status, verification_method, verified_at, created_at) VALUES (${sqlString(DOMAIN_ID)}, ${sqlString(WORKSPACE_ID)}, ${sqlString(DOMAIN)}, 'verified', 'synthetic-canary-fixture', ${now}, ${now});`,
    `INSERT INTO mailboxes (id, workspace_id, domain_id, address, status, created_at) VALUES (${sqlString(MAILBOX_ID)}, ${sqlString(WORKSPACE_ID)}, ${sqlString(DOMAIN_ID)}, ${sqlString(MAILBOX_ADDRESS)}, 'active', ${now});`,
    `INSERT INTO users (id, email, display_name, status, session_version, created_at, updated_at) VALUES (${sqlString(USER_ID)}, ${sqlString(ACCOUNT_EMAIL)}, ${sqlString(ACCOUNT_NAME)}, 'active', 1, ${now}, ${now});`,
    `INSERT INTO password_credentials (user_id, password_hash, created_at, updated_at) VALUES (${sqlString(USER_ID)}, ${sqlString(passwordHash)}, ${now}, ${now});`,
    `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES (${sqlString(MEMBERSHIP_ID)}, ${sqlString(WORKSPACE_ID)}, ${sqlString(USER_ID)}, 'member', 'active', ${now});`,
    `INSERT INTO mailbox_access_grants (workspace_id, mailbox_id, user_id, granted_by_user_id, status, created_at) VALUES (${sqlString(WORKSPACE_ID)}, ${sqlString(MAILBOX_ID)}, ${sqlString(USER_ID)}, NULL, 'active', ${now});`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at) VALUES (${sqlString(AUDIT_ID)}, NULL, ${sqlString(AUDIT_ACTION)}, 'user', ${sqlString(USER_ID)}, ${sqlString(WORKSPACE_ID)}, '{"environment":"canary","synthetic":true,"domain":"canary.invalid","mailbox":"inbox@canary.invalid"}', ${now});`,
  ].join('\n')
}

function buildCleanupSql() {
  return [
    `DELETE FROM platform_audit_log WHERE id = ${sqlString(AUDIT_ID)};`,
    `DELETE FROM mailbox_access_grants WHERE workspace_id = ${sqlString(WORKSPACE_ID)} OR mailbox_id = ${sqlString(MAILBOX_ID)} OR user_id = ${sqlString(USER_ID)};`,
    `DELETE FROM workspace_memberships WHERE id = ${sqlString(MEMBERSHIP_ID)};`,
    `DELETE FROM password_credentials WHERE user_id = ${sqlString(USER_ID)};`,
    `DELETE FROM auth_identities WHERE user_id = ${sqlString(USER_ID)};`,
    `DELETE FROM users WHERE id = ${sqlString(USER_ID)};`,
    `DELETE FROM mailboxes WHERE id = ${sqlString(MAILBOX_ID)};`,
    `DELETE FROM workspace_domains WHERE id = ${sqlString(DOMAIN_ID)};`,
    `DELETE FROM workspaces WHERE id = ${sqlString(WORKSPACE_ID)};`,
  ].join('\n')
}

function buildVerificationSql() {
  return `SELECT
    (SELECT COUNT(*) FROM users WHERE id = ${sqlString(USER_ID)} AND lower(email) = lower(${sqlString(ACCOUNT_EMAIL)}) AND status = 'active') AS user_ok,
    (SELECT COUNT(*) FROM password_credentials WHERE user_id = ${sqlString(USER_ID)}) AS credential_ok,
    (SELECT COUNT(*) FROM workspace_memberships WHERE id = ${sqlString(MEMBERSHIP_ID)} AND workspace_id = ${sqlString(WORKSPACE_ID)} AND user_id = ${sqlString(USER_ID)} AND role = 'member' AND status = 'active') AS membership_ok,
    (SELECT COUNT(*) FROM workspace_domains WHERE id = ${sqlString(DOMAIN_ID)} AND workspace_id = ${sqlString(WORKSPACE_ID)} AND domain = ${sqlString(DOMAIN)} AND verification_method = 'synthetic-canary-fixture') AS domain_ok,
    (SELECT COUNT(*) FROM mailboxes WHERE id = ${sqlString(MAILBOX_ID)} AND workspace_id = ${sqlString(WORKSPACE_ID)} AND domain_id = ${sqlString(DOMAIN_ID)} AND address = ${sqlString(MAILBOX_ADDRESS)}) AS mailbox_ok,
    (SELECT COUNT(*) FROM mailbox_access_grants WHERE workspace_id = ${sqlString(WORKSPACE_ID)} AND mailbox_id = ${sqlString(MAILBOX_ID)} AND user_id = ${sqlString(USER_ID)} AND status = 'active') AS grant_ok,
    (SELECT COUNT(*) FROM platform_admins WHERE user_id = ${sqlString(USER_ID)}) AS platform_admin_count,
    (SELECT COUNT(*) FROM messages) AS message_count,
    (SELECT COUNT(*) FROM outgoing_drafts) AS draft_count`
}

function assertSetup(rows) {
  const state = rows[0]
  if (!state
    || Number(state.user_ok) !== 1
    || Number(state.credential_ok) !== 1
    || Number(state.membership_ok) !== 1
    || Number(state.domain_ok) !== 1
    || Number(state.mailbox_ok) !== 1
    || Number(state.grant_ok) !== 1
    || Number(state.platform_admin_count) !== 0
    || Number(state.message_count) !== 0
    || Number(state.draft_count) !== 0) {
    throw new Error('Le contrôle après création a échoué.')
  }
}

function readHidden(prompt) {
  const input = process.stdin
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Lance cette commande depuis un terminal interactif pour saisir le mot de passe sans l’afficher.')
  }

  return new Promise((resolve, reject) => {
    const previousRawMode = Boolean(input.isRaw)
    let value = ''
    let settled = false
    input.setEncoding('utf8')

    const cleanup = () => {
      input.removeListener('data', onData)
      input.setRawMode(previousRawMode)
      input.pause()
      process.stderr.write('\n')
    }

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003' || character === '\u0004') {
          if (!settled) {
            settled = true
            cleanup()
            reject(new Error('Saisie annulée.'))
          }
          return
        }
        if (character === '\r' || character === '\n') {
          if (!settled) {
            settled = true
            cleanup()
            resolve(value)
          }
          return
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('')
          continue
        }
        if (character >= ' ' && character !== '\u007f') value += character
      }
    }

    process.stderr.write(prompt)
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}

async function askConfirmation() {
  const readline = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return await readline.question('Tape CREER pour confirmer : ')
  } finally {
    readline.close()
  }
}

async function writeSql(directory, name, sql) {
  const path = join(directory, name)
  await writeFile(path, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return path
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error('Cette commande n’accepte aucune option : elle cible uniquement la D1 canarie définie dans wrangler.canary.jsonc.')
  }

  await assertCanaryTarget()
  const [preflight] = runCanaryD1(['--command', buildPreflightSql()], { json: true })
  assertEmptyCanary([preflight])

  console.log('D1 ciblée : courrier-canary-db (canarie isolée)')
  console.log(`Compte : ${ACCOUNT_EMAIL}`)
  console.log(`Espace : ${WORKSPACE_NAME} ; boîte vide : ${MAILBOX_ADDRESS}`)
  console.log('Rôle membre, aucun droit administrateur, aucun email envoyé, aucun message importé.')

  const confirmation = await askConfirmation()
  if (confirmation !== 'CREER') throw new Error('Opération annulée. Aucun changement effectué.')

  let password = await readHidden('Mot de passe (16 caractères minimum, saisie masquée) : ')
  let repeatedPassword = ''
  let passwordHash = ''
  let tempDirectory = ''
  let mutationStarted = false
  try {
    repeatedPassword = await readHidden('Confirme le mot de passe : ')
    if (password.length < 16) throw new Error('Le mot de passe doit contenir au moins 16 caractères.')
    if (password !== repeatedPassword) throw new Error('Les deux saisies ne correspondent pas.')

    passwordHash = await new Hash(new Scrypt()).make(password)
    tempDirectory = await mkdtemp(join(tmpdir(), 'courrier-canary-member-'))
    const setupFile = await writeSql(tempDirectory, 'setup.sql', buildSetupSql(passwordHash))
    const cleanupFile = await writeSql(tempDirectory, 'cleanup.sql', buildCleanupSql())

    mutationStarted = true
    runCanaryD1(['--file', setupFile])
    const [verification] = runCanaryD1(['--command', buildVerificationSql()], { json: true })
    assertSetup([verification])
  } catch (error) {
    if (mutationStarted && tempDirectory) {
      try {
        const cleanupFile = join(tempDirectory, 'cleanup.sql')
        runCanaryD1(['--file', cleanupFile])
      } catch {
        throw new Error('Échec du bootstrap et du nettoyage canarie. N’ouvre pas de session : une inscription partielle peut subsister dans la canarie.')
      }
      throw new Error('Échec du bootstrap ; ses éventuelles écritures canarie ont été nettoyées.')
    }
    throw error
  } finally {
    password = ''
    repeatedPassword = ''
    passwordHash = ''
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true })
  }

  console.log('Membre canarie créé et vérifié. Les mots de passe et fichiers SQL temporaires ont été effacés.')
  console.log(`Tu peux te connecter à ${ACCOUNT_EMAIL} sur https://courrier-canary.jerem-dev.workers.dev/login.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Échec du bootstrap du membre canarie.')
  process.exitCode = 1
})
