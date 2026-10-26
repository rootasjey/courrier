import { randomUUID } from 'node:crypto'

export const RECOVERY_ENVIRONMENTS = {
  canary: {
    configPath: 'wrangler.canary.jsonc',
    workerName: 'courrier-canary',
    databaseName: 'courrier-canary-db',
    databaseId: '3d83a490-df46-48ed-84a5-ee6a201a50d1',
    publicOrigin: 'https://courrier-canary.jerem-dev.workers.dev',
    sessionName: 'courrier-canary-session',
  },
  production: {
    configPath: 'wrangler.jsonc',
    workerName: 'courrier',
    databaseName: 'courrier-db',
    databaseId: '3dc4507e-78f0-4e8a-b2f4-51ddc75b6aa8',
    publicOrigin: 'https://courrier.day',
  },
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function parseRecoveryArguments(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!['--environment', '--email', '--incident'].includes(flag)) {
      throw new Error(`Option inconnue : ${flag}`)
    }
    if (parsed[flag]) throw new Error(`Option répétée : ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Valeur manquante pour ${flag}.`)
    parsed[flag] = value
    index += 1
  }

  const environment = parsed['--environment']
  const email = parsed['--email']?.trim().toLowerCase()
  const incidentRef = parsed['--incident']?.trim()
  if (!RECOVERY_ENVIRONMENTS[environment]) {
    throw new Error('Choisis explicitement --environment canary ou --environment production.')
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error('Fournis une adresse e-mail complète avec --email.')
  }
  if (!incidentRef || !/^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/u.test(incidentRef)) {
    throw new Error('Fournis une référence de ticket ou d’incident avec --incident (3 à 64 caractères).')
  }
  return { environment, email, incidentRef }
}

function stripJsonComments(source) {
  let output = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (inString) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      output += character
    } else if (character === '/' && next === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1
      output += source[index] || ''
    } else if (character === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n' || source[index] === '\r') output += source[index]
        index += 1
      }
      index += 1
    } else {
      output += character
    }
  }
  return output
}

function stripTrailingCommas(source) {
  let output = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      output += character
      continue
    }
    if (character === ',') {
      let next = index + 1
      while (/\s/u.test(source[next] || '') && next < source.length) next += 1
      if (source[next] === '}' || source[next] === ']') continue
    }
    output += character
  }
  return output
}

function parseJsonc(source) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(source)))
}

export function assertRecoveryEnvironmentConfig(source, environment) {
  const expected = RECOVERY_ENVIRONMENTS[environment]
  if (!expected) throw new Error('Environnement de récupération inconnu.')
  let config
  try {
    config = parseJsonc(source)
  } catch {
    throw new Error('La configuration Wrangler est illisible. Aucun changement effectué.')
  }

  const [database] = config.d1_databases || []
  const safe = config.name === expected.workerName
    && config.d1_databases?.length === 1
    && database?.binding === 'DB'
    && database?.database_name === expected.databaseName
    && database?.database_id === expected.databaseId
    && config.vars?.COURRIER_PUBLIC_ORIGIN === expected.publicOrigin

  if (environment === 'canary') {
    if (!safe
      || config.vars?.NUXT_SESSION_NAME !== expected.sessionName
      || config.workers_dev !== true
      || config.preview_urls !== false
      || config.env
      || (config.triggers?.crons?.length || 0) > 0
      || (config.send_email?.length || 0) > 0
      || (config.email?.length || 0) > 0
      || config.routes?.length) {
      throw new Error('La configuration ne correspond plus à la D1 canarie isolée attendue. Aucun changement effectué.')
    }
    return
  }

  if (!safe || config.env) {
    throw new Error('La configuration ne correspond plus à la D1 de production attendue. Aucun changement effectué.')
  }
}

export function buildRecoveryPreflightSql(email) {
  return `SELECT u.id AS user_id, u.email, u.status, u.session_version,
      EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id) AS is_platform_admin,
      EXISTS (SELECT 1 FROM password_credentials pc WHERE pc.user_id = u.id) AS has_password_credential,
      (SELECT COUNT(*) FROM auth_passkeys p WHERE p.user_id = u.id) AS passkey_count,
      (SELECT COUNT(*) FROM auth_mfa_recovery_codes c WHERE c.user_id = u.id) AS recovery_code_count,
      (SELECT COUNT(*) FROM auth_webauthn_challenges w WHERE w.user_id = u.id) AS challenge_count
    FROM users u
    WHERE lower(u.email) = lower(${sqlString(email)})
    LIMIT 1`
}

export function buildRecoveryAuditSql({ userId, incidentRef, environment, runId = randomUUID(), completed = false, now = new Date().toISOString() }) {
  const action = completed ? 'account.admin_mfa_recovery_completed' : 'account.admin_mfa_recovery_started'
  const details = JSON.stringify({ incidentRef, environment, runId, method: 'operator_cli' })
  return `INSERT INTO platform_audit_log
      (id, actor_user_id, action, target_type, target_id, details_json, created_at)
    VALUES (${sqlString(runId + (completed ? ':completed' : ':started'))}, NULL, ${sqlString(action)}, 'user', ${sqlString(userId)}, ${sqlString(details)}, ${sqlString(now)})`
}

export function buildRecoveryMutationSql({ userId, email }) {
  const target = sqlString(userId)
  const normalizedEmail = sqlString(email)
  return {
    revokeSessions: `UPDATE users SET session_version = session_version + 1, updated_at = datetime('now')
      WHERE id = ${target} AND lower(email) = lower(${normalizedEmail}) AND status = 'active'
        AND EXISTS (SELECT 1 FROM platform_admins WHERE user_id = ${target})
      RETURNING session_version`,
    challenges: `DELETE FROM auth_webauthn_challenges WHERE user_id = ${target}`,
    recoveryCodes: `DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${target}`,
    passkeys: `DELETE FROM auth_passkeys WHERE user_id = ${target}`,
  }
}
