import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ADMIN_EMAIL = 'jeremie@verbatims.cc'
const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const WRANGLER = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler')

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

function runLocalD1(args) {
  const result = spawnSync(WRANGLER, ['d1', 'execute', 'DB', '--local', '--yes', '--json', ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    let detail = ''
    try {
      detail = JSON.parse(result.stdout).error?.text || ''
    } catch {
      detail = result.stderr.trim()
    }
    throw new Error(detail
      ? `La commande Wrangler a échoué : ${detail}`
      : `La commande Wrangler a échoué (code ${result.status ?? 'inconnu'}).`)
  }
  return parseWranglerJson(result.stdout)
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

async function confirmTarget() {
  const query = `SELECT u.id AS user_id,
      CASE WHEN u.status = 'active' THEN 1 ELSE 0 END AS active,
      EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id) AS is_platform_admin,
      EXISTS (SELECT 1 FROM password_credentials pc WHERE pc.user_id = u.id) AS has_password_credential
    FROM users u
    WHERE lower(u.email) = lower(${sqlString(ADMIN_EMAIL)})
    LIMIT 1`
  const [account] = runLocalD1(['--command', query])

  if (!account?.user_id || Number(account.active) !== 1 || Number(account.is_platform_admin) !== 1 || Number(account.has_password_credential) !== 1) {
    throw new Error('Le compte admin actif avec un mot de passe n’a pas été trouvé dans la D1 locale. Aucun changement effectué.')
  }
  return account.user_id
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error('Cette commande n’accepte pas d’options : elle cible uniquement la D1 locale du dépôt Courrier.')
  }

  const userId = await confirmTarget()
  console.log(`Compte local ciblé : ${ADMIN_EMAIL} (administrateur actif).`)
  console.log('La commande Wrangler utilisera explicitement --local ; la base de production ne sera pas modifiée.')

  const readline = createInterface({ input: process.stdin, output: process.stderr })
  let confirmation
  try {
    confirmation = await readline.question('Tape OUI pour remplacer son mot de passe local : ')
  } finally {
    readline.close()
  }
  if (confirmation !== 'OUI') throw new Error('Opération annulée. Aucun changement effectué.')

  let password = await readHidden('Nouveau mot de passe (16 caractères minimum, saisie masquée) : ')
  try {
    const repeatedPassword = await readHidden('Confirme le nouveau mot de passe : ')
    if (password.length < 16) throw new Error('Le mot de passe doit contenir au moins 16 caractères.')
    if (password !== repeatedPassword) throw new Error('Les deux saisies ne correspondent pas.')

    // nuxt-auth-utils uses these same Scrypt defaults; no custom hash options are configured by this app.
    const passwordHash = await new Hash(new Scrypt()).make(password)
    const now = new Date().toISOString()
    const sql = [
      `UPDATE password_credentials SET password_hash = ${sqlString(passwordHash)} WHERE user_id = ${sqlString(userId)};`,
      `UPDATE users SET session_version = session_version + 1 WHERE id = ${sqlString(userId)} AND status = 'active';`,
      `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at) VALUES (${sqlString(randomUUID())}, ${sqlString(userId)}, 'account.local_password_reset', 'user', ${sqlString(userId)}, '{"environment":"local"}', ${sqlString(now)});`,
    ].join('\n')

    const tempDirectory = await mkdtemp(join(tmpdir(), 'courrier-local-password-reset-'))
    const sqlFile = join(tempDirectory, 'reset.sql')
    try {
      await writeFile(sqlFile, sql, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      runLocalD1(['--file', sqlFile])
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  } finally {
    password = ''
  }

  console.log('Mot de passe local mis à jour. Les anciennes sessions locales ont été invalidées.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Échec de la réinitialisation locale.')
  process.exitCode = 1
})
