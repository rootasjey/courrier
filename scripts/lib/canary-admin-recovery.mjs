import { sqlString } from './admin-mfa-recovery.mjs'

export const CANARY_RECOVERY_ACTION = 'platform_admin.mfa_recovered_by_admin'

function syntheticUserPredicate(userId, email) {
  return `id = ${sqlString(userId)}
    AND lower(email) = lower(${sqlString(email)})
    AND NOT EXISTS (SELECT 1 FROM workspace_memberships WHERE user_id = ${sqlString(userId)})
    AND NOT EXISTS (SELECT 1 FROM mailbox_access_grants WHERE user_id = ${sqlString(userId)})`
}

export function buildCanaryAdminRecoverySetupSql({
  actorId,
  actorEmail,
  actorPasswordHash,
  actorRecoveryHash,
  actorRecoveryId,
  actorCredentialId,
  targetId,
  targetEmail,
  targetPasswordHash,
  targetRecoveryHash,
  targetRecoveryId,
  targetCredentialId,
  stepUpChallengeId,
  loginChallengeId,
  startedAuditId,
}) {
  const now = "datetime('now')"
  return [
    `INSERT INTO users (id, email, display_name, status, session_version, created_at, updated_at)
      VALUES (${sqlString(actorId)}, ${sqlString(actorEmail)}, 'Canary recovery actor', 'active', 1, ${now}, ${now});`,
    `INSERT INTO users (id, email, display_name, status, session_version, created_at, updated_at)
      VALUES (${sqlString(targetId)}, ${sqlString(targetEmail)}, 'Canary recovery target', 'active', 1, ${now}, ${now});`,
    `INSERT INTO password_credentials (user_id, password_hash, created_at, updated_at)
      VALUES (${sqlString(actorId)}, ${sqlString(actorPasswordHash)}, ${now}, ${now});`,
    `INSERT INTO password_credentials (user_id, password_hash, created_at, updated_at)
      VALUES (${sqlString(targetId)}, ${sqlString(targetPasswordHash)}, ${now}, ${now});`,
    `INSERT INTO platform_admins (user_id, created_at, created_by_user_id)
      VALUES (${sqlString(actorId)}, ${now}, NULL), (${sqlString(targetId)}, ${now}, NULL);`,
    `INSERT INTO auth_passkeys (credential_id, user_id, public_key, counter, transports_json, device_type, backed_up, label, created_at)
      VALUES (${sqlString(actorCredentialId)}, ${sqlString(actorId)}, 'AA==', 0, '[]', 'multiDevice', 1, 'Synthetic canary factor', ${now});`,
    `INSERT INTO auth_passkeys (credential_id, user_id, public_key, counter, transports_json, device_type, backed_up, label, created_at)
      VALUES (${sqlString(targetCredentialId)}, ${sqlString(targetId)}, 'AA==', 0, '[]', 'multiDevice', 1, 'Synthetic canary factor', ${now});`,
    `INSERT INTO auth_mfa_recovery_codes (id, user_id, code_hash, created_at)
      VALUES (${sqlString(actorRecoveryId)}, ${sqlString(actorId)}, ${sqlString(actorRecoveryHash)}, ${now});`,
    `INSERT INTO auth_mfa_recovery_codes (id, user_id, code_hash, created_at)
      VALUES (${sqlString(targetRecoveryId)}, ${sqlString(targetId)}, ${sqlString(targetRecoveryHash)}, ${now});`,
    `INSERT INTO auth_webauthn_challenges (attempt_id, user_id, session_version, purpose, challenge, created_at, expires_at)
      VALUES (${sqlString(stepUpChallengeId)}, ${sqlString(targetId)}, 1, 'admin_step_up', 'synthetic-step-up', ${now}, datetime('now', '+10 minutes'));`,
    `INSERT INTO auth_webauthn_challenges (attempt_id, user_id, session_version, purpose, challenge, created_at, expires_at)
      VALUES (${sqlString(loginChallengeId)}, ${sqlString(targetId)}, 1, 'account_login', 'synthetic-login', ${now}, datetime('now', '+10 minutes'));`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      VALUES (${sqlString(startedAuditId)}, NULL, 'canary.synthetic_platform_admin.recovery_test_started', 'user', ${sqlString(targetId)},
        '{"environment":"canary","synthetic":true,"mail_access":false}', ${now});`,
  ].join('\n')
}

export function buildCanaryAdminRecoveryCleanupSql({
  actorId,
  actorEmail,
  targetId,
  targetEmail,
  cleanupAuditId,
}) {
  const actor = syntheticUserPredicate(actorId, actorEmail)
  const target = syntheticUserPredicate(targetId, targetEmail)
  const bothSyntheticUsers = `EXISTS (SELECT 1 FROM users WHERE ${actor})
    AND EXISTS (SELECT 1 FROM users WHERE ${target})`
  const now = "datetime('now')"
  return [
    `DELETE FROM auth_webauthn_challenges WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})
      AND ${bothSyntheticUsers};`,
    `DELETE FROM auth_mfa_recovery_codes WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})
      AND ${bothSyntheticUsers};`,
    `DELETE FROM auth_passkeys WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})
      AND ${bothSyntheticUsers};`,
    `DELETE FROM platform_admins WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})
      AND ${bothSyntheticUsers};`,
    `DELETE FROM password_credentials WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})
      AND ${bothSyntheticUsers};`,
    `DELETE FROM auth_identities WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})
      AND ${bothSyntheticUsers};`,
    `DELETE FROM users WHERE (${actor}) OR (${target});`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ${sqlString(cleanupAuditId)}, NULL, 'canary.synthetic_platform_admin.recovery_test_cleanup', 'user', ${sqlString(targetId)},
        '{"environment":"canary","synthetic":true,"accounts_removed":true}', ${now}
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE id IN (${sqlString(actorId)}, ${sqlString(targetId)}));`,
  ].join('\n')
}

export function buildCanaryAdminRecoveryVerificationSql({
  actorId,
  targetId,
  targetEmail,
  startedAuditId,
  cleanupAuditId,
}) {
  return `SELECT
    (SELECT COUNT(*) FROM users WHERE id IN (${sqlString(actorId)}, ${sqlString(targetId)})) AS users_remaining,
    (SELECT COUNT(*) FROM platform_admins WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})) AS admin_roles_remaining,
    (SELECT COUNT(*) FROM auth_passkeys WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})) AS passkeys_remaining,
    (SELECT COUNT(*) FROM auth_mfa_recovery_codes WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})) AS recovery_codes_remaining,
    (SELECT COUNT(*) FROM auth_webauthn_challenges WHERE user_id IN (${sqlString(actorId)}, ${sqlString(targetId)})) AS challenges_remaining,
    (SELECT COUNT(*) FROM platform_audit_log WHERE id = ${sqlString(startedAuditId)} AND target_id = ${sqlString(targetId)}) AS start_audit_written,
    (SELECT COUNT(*) FROM platform_audit_log WHERE action = ${sqlString(CANARY_RECOVERY_ACTION)} AND target_id = ${sqlString(targetId)}) AS recovery_audit_written,
    (SELECT COUNT(*) FROM platform_audit_log WHERE id = ${sqlString(cleanupAuditId)} AND target_id = ${sqlString(targetId)}) AS cleanup_audit_written,
    (SELECT COUNT(*) FROM platform_audit_log WHERE target_id = ${sqlString(targetId)} AND details_json LIKE '%recovery code%') AS secret_audit_matches,
    (SELECT COUNT(*) FROM platform_audit_log WHERE target_id = ${sqlString(targetId)} AND details_json LIKE '%challenge%') AS challenge_audit_matches,
    (SELECT COUNT(*) FROM users WHERE lower(email) = lower(${sqlString(targetEmail)})) AS target_email_remaining`
}

export function assertCanaryAdminRecoveryCleanup(rows) {
  const state = rows[0]
  const expectedCounts = {
    users_remaining: 0,
    admin_roles_remaining: 0,
    passkeys_remaining: 0,
    recovery_codes_remaining: 0,
    challenges_remaining: 0,
    start_audit_written: 1,
    recovery_audit_written: 1,
    cleanup_audit_written: 1,
    secret_audit_matches: 0,
    challenge_audit_matches: 0,
    target_email_remaining: 0,
  }
  if (!state || Object.entries(expectedCounts).some(([key, value]) => Number(state[key]) !== value)) {
    throw new Error('Le nettoyage de la récupération MFA canarie n’a pas pu être confirmé. Inspecte la D1 canarie avant un nouvel essai.')
  }
}

