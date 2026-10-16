import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertRecoveryEnvironmentConfig,
  buildRecoveryAuditSql,
  buildRecoveryMutationSql,
  buildRecoveryPreflightSql,
  parseRecoveryArguments,
  RECOVERY_ENVIRONMENTS,
  sqlString,
} from './lib/admin-mfa-recovery.mjs'

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const WRANGLER = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler')

function parseWranglerJson(output) {
  try {
    const parsed = JSON.parse(output)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    throw new Error('Wrangler n’a pas renvoyé de résultat JSON exploitable.')
  }
}

function runD1(environment, sql) {
  const config = RECOVERY_ENVIRONMENTS[environment]
  const result = spawnSync(WRANGLER, [
    'd1', 'execute', 'DB', '--remote', '--config', join(PROJECT_ROOT, config.configPath), '--yes', '--json', '--command', sql,
  ], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  })

  if (result.error) throw new Error('Wrangler est indisponible. Vérifie les dépendances du dépôt.')
  if (result.status !== 0) {
    throw new Error(`Wrangler a échoué sur la D1 ${config.databaseName} (code ${result.status ?? 'inconnu'}).`)
  }
  return parseWranglerJson(result.stdout)
}

function getRows(statements) {
  return statements.flatMap(statement => Array.isArray(statement.results) ? statement.results : [])
}

function getChangedRows(statements) {
  return statements.reduce((total, statement) => total + Number(statement.meta?.changes || 0), 0)
}

async function askExact(prompt, expected) {
  const readline = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await readline.question(prompt)
    return answer === expected
  } finally {
    readline.close()
  }
}

async function confirmOperation({ config, environment, email, incidentRef, account }) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error('Cette procédure exige un terminal interactif. Aucun changement effectué.')
  }

  console.log(`Environnement : ${environment}`)
  console.log(`D1 ciblée : ${config.databaseName} (${config.databaseId})`)
  console.log(`Administrateur ciblé : ${account.email} — ${account.user_id}`)
  console.log(`Référence : ${incidentRef}`)
  console.log(`Facteurs avant l’opération : ${account.passkey_count} passkey(s), ${account.recovery_code_count} code(s), ${account.challenge_count} tentative(s) en attente.`)
  console.log('Effet : invalider toutes les sessions, supprimer les passkeys et codes existants ; l’administrateur devra se reconnecter et réenregistrer un facteur. Aucun mot de passe ni code ne sera demandé ou affiché.')

  if (!await askExact(`Pour confirmer la base, saisis ${config.databaseName} : `, config.databaseName)) {
    throw new Error('Base non confirmée. Aucun changement effectué.')
  }
  if (!await askExact(`Pour confirmer l’identité, saisis ${email} : `, email)) {
    throw new Error('Adresse non confirmée. Aucun changement effectué.')
  }
  if (!await askExact(`Tape RESET MFA ${email} pour continuer : `, `RESET MFA ${email}`)) {
    throw new Error('Opération annulée. Aucun changement effectué.')
  }
}

async function main() {
  const { environment, email, incidentRef } = parseRecoveryArguments(process.argv.slice(2))
  const config = RECOVERY_ENVIRONMENTS[environment]
  const configText = await readFile(join(PROJECT_ROOT, config.configPath), 'utf8')
  assertRecoveryEnvironmentConfig(configText, environment)

  const preflight = getRows(runD1(environment, buildRecoveryPreflightSql(email)))[0]
  if (!preflight
    || preflight.email?.toLowerCase() !== email
    || preflight.status !== 'active'
    || Number(preflight.is_platform_admin) !== 1
    || Number(preflight.has_password_credential) !== 1) {
    throw new Error('Prévol refusé : aucun compte administrateur actif avec mot de passe ne correspond à cette adresse. Aucun changement effectué.')
  }

  await confirmOperation({ config, environment, email, incidentRef, account: preflight })

  const runId = randomUUID()
  let phase = 'journalisation du début'
  try {
    const startedAudit = runD1(environment, buildRecoveryAuditSql({ userId: preflight.user_id, incidentRef, environment, runId }))
    if (getChangedRows(startedAudit) !== 1) throw new Error('L’événement de début n’a pas été confirmé.')

    const mutation = buildRecoveryMutationSql({ userId: preflight.user_id, email })
    phase = 'invalidation des sessions'
    const sessionUpdate = runD1(environment, mutation.revokeSessions)
    if (getChangedRows(sessionUpdate) !== 1 || getRows(sessionUpdate).length !== 1) {
      throw new Error('Le compte a changé depuis le prévol ; aucune suppression de facteur n’a été tentée.')
    }

    phase = 'suppression des tentatives WebAuthn'
    runD1(environment, mutation.challenges)
    phase = 'suppression des codes de récupération'
    runD1(environment, mutation.recoveryCodes)
    phase = 'suppression des passkeys'
    runD1(environment, mutation.passkeys)

    phase = 'vérification du résultat'
    const finalState = getRows(runD1(environment, `SELECT u.session_version,
        (SELECT COUNT(*) FROM auth_passkeys p WHERE p.user_id = u.id) AS passkey_count,
        (SELECT COUNT(*) FROM auth_mfa_recovery_codes c WHERE c.user_id = u.id) AS recovery_code_count,
        (SELECT COUNT(*) FROM auth_webauthn_challenges w WHERE w.user_id = u.id) AS challenge_count
      FROM users u
      WHERE u.id = ${sqlString(preflight.user_id)} AND u.status = 'active'
        AND EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id)`))[0]
    if (!finalState
      || Number(finalState.session_version) !== Number(preflight.session_version) + 1
      || Number(finalState.passkey_count) !== 0
      || Number(finalState.recovery_code_count) !== 0
      || Number(finalState.challenge_count) !== 0) {
      throw new Error('Le contrôle après reset a échoué. Consulte la ligne d’audit “started” avant toute nouvelle action.')
    }

    phase = 'journalisation de la fin'
    const completedAudit = runD1(environment, buildRecoveryAuditSql({ userId: preflight.user_id, incidentRef, environment, runId, completed: true }))
    if (getChangedRows(completedAudit) !== 1) throw new Error('L’événement de fin n’a pas été confirmé.')
  } catch (error) {
    throw new Error(`Procédure interrompue pendant ${phase}. L’événement de début est journalisé ; contrôle l’état de la D1 avant de relancer. Référence : ${incidentRef}. Détail : ${error instanceof Error ? error.message : 'erreur inconnue'}`)
  }

  console.log(`Récupération MFA terminée pour ${email}. Les sessions précédentes sont invalides ; l’accès administrateur restera bloqué jusqu’à l’enregistrement d’un nouveau facteur. Référence : ${incidentRef}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Échec de la récupération MFA.')
  process.exitCode = 1
})
