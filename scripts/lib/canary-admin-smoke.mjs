import { sqlString } from './admin-mfa-recovery.mjs'

export const CANARY_ADMIN = {
  email: 'canary.admin@example.invalid',
  displayName: 'Administrateur synthétique canarie',
  memberEmail: 'canary.member@example.invalid',
  workspaceId: 'legacy-courrier-workspace',
  memberWorkspaceName: 'Espace synthétique canarie',
  memberDomain: 'canary.invalid',
  memberMailbox: 'inbox@canary.invalid',
}

export function buildCanaryAdminPreflightSql() {
  const { email, memberEmail, workspaceId, memberWorkspaceName, memberDomain, memberMailbox } = CANARY_ADMIN
  return `SELECT
    (SELECT COUNT(*) FROM users) AS user_count,
    (SELECT COUNT(*) FROM users WHERE lower(email) = lower(${sqlString(memberEmail)}) AND status = 'active') AS member_user_ok,
    (SELECT COUNT(*) FROM workspace_memberships) AS membership_count,
    (SELECT COUNT(*) FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id JOIN workspaces w ON w.id = wm.workspace_id
      WHERE lower(u.email) = lower(${sqlString(memberEmail)}) AND wm.role = 'member' AND wm.status = 'active'
        AND w.name = ${sqlString(memberWorkspaceName)} AND w.status = 'active') AS member_membership_ok,
    (SELECT COUNT(*) FROM mailbox_access_grants) AS grant_count,
    (SELECT COUNT(*) FROM mailbox_access_grants g JOIN users u ON u.id = g.user_id JOIN mailboxes m ON m.id = g.mailbox_id
      WHERE lower(u.email) = lower(${sqlString(memberEmail)}) AND g.status = 'active'
        AND lower(m.address) = lower(${sqlString(memberMailbox)})) AS member_grant_ok,
    EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(${sqlString(email)})) AS admin_email_exists,
    EXISTS (SELECT 1 FROM platform_admins) AS any_platform_admin_exists,
    EXISTS (SELECT 1 FROM workspaces WHERE id = ${sqlString(workspaceId)}) AS legacy_workspace_exists,
    EXISTS (SELECT 1 FROM workspace_domains WHERE lower(domain) = lower(${sqlString(memberDomain)})
      AND verification_method = 'synthetic-canary-fixture') AS member_domain_exists,
    EXISTS (SELECT 1 FROM mailboxes WHERE lower(address) = lower(${sqlString(memberMailbox)})) AS member_mailbox_exists,
    (SELECT COUNT(*) FROM messages) AS message_count,
    (SELECT COUNT(*) FROM attachments) AS attachment_count,
    (SELECT COUNT(*) FROM outgoing_drafts) AS draft_count,
    (SELECT COUNT(*) FROM outgoing_draft_attachments) AS draft_attachment_count`
}

export function assertCanaryAdminBaseline(rows) {
  const state = rows[0]
  const expectedCounts = {
    user_count: 1,
    member_user_ok: 1,
    membership_count: 1,
    member_membership_ok: 1,
    grant_count: 1,
    member_grant_ok: 1,
    admin_email_exists: 0,
    any_platform_admin_exists: 0,
    legacy_workspace_exists: 1,
    member_domain_exists: 1,
    member_mailbox_exists: 1,
    message_count: 0,
    attachment_count: 0,
    draft_count: 0,
    draft_attachment_count: 0,
  }
  if (!state || Object.entries(expectedCounts).some(([key, value]) => Number(state[key]) !== value)) {
    throw new Error('Prévol refusé : l’état de référence canarie a changé. Aucun changement effectué.')
  }
}

export function buildCanaryAdminSetupSql({ userId, auditId, passwordHash }) {
  const now = "datetime('now')"
  return [
    `INSERT INTO users (id, email, display_name, status, session_version, created_at, updated_at)
      VALUES (${sqlString(userId)}, ${sqlString(CANARY_ADMIN.email)}, ${sqlString(CANARY_ADMIN.displayName)}, 'active', 1, ${now}, ${now});`,
    `INSERT INTO password_credentials (user_id, password_hash, created_at, updated_at)
      VALUES (${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`,
    `INSERT INTO platform_admins (user_id, created_at, created_by_user_id)
      VALUES (${sqlString(userId)}, ${now}, NULL);`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      VALUES (${sqlString(auditId)}, NULL, 'canary.synthetic_platform_admin.test_started', 'user', ${sqlString(userId)},
        '{"environment":"canary","synthetic":true,"workspace_membership":false,"mailbox_grants":false}', ${now});`,
  ].join('\n')
}

function safeSyntheticUserPredicate(userId) {
  return `id = ${sqlString(userId)} AND lower(email) = lower(${sqlString(CANARY_ADMIN.email)})
    AND NOT EXISTS (SELECT 1 FROM workspace_memberships WHERE user_id = ${sqlString(userId)})
    AND NOT EXISTS (SELECT 1 FROM mailbox_access_grants WHERE user_id = ${sqlString(userId)})`
}

export function buildCanaryAdminCleanupSql({ userId, cleanupAuditId }) {
  const safeUser = safeSyntheticUserPredicate(userId)
  const now = "datetime('now')"
  return [
    `DELETE FROM auth_webauthn_challenges WHERE user_id = ${sqlString(userId)}
      AND EXISTS (SELECT 1 FROM users WHERE ${safeUser});`,
    `DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${sqlString(userId)}
      AND EXISTS (SELECT 1 FROM users WHERE ${safeUser});`,
    `DELETE FROM auth_passkeys WHERE user_id = ${sqlString(userId)}
      AND EXISTS (SELECT 1 FROM users WHERE ${safeUser});`,
    `DELETE FROM platform_admins WHERE user_id = ${sqlString(userId)}
      AND EXISTS (SELECT 1 FROM users WHERE ${safeUser});`,
    `DELETE FROM password_credentials WHERE user_id = ${sqlString(userId)}
      AND EXISTS (SELECT 1 FROM users WHERE ${safeUser});`,
    `DELETE FROM auth_identities WHERE user_id = ${sqlString(userId)}
      AND EXISTS (SELECT 1 FROM users WHERE ${safeUser});`,
    `DELETE FROM users WHERE ${safeUser};`,
    `INSERT INTO platform_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ${sqlString(cleanupAuditId)}, NULL, 'canary.synthetic_platform_admin.test_cleanup', 'user', ${sqlString(userId)},
        '{"environment":"canary","synthetic":true,"account_removed":true}', ${now}
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = ${sqlString(userId)});`,
  ].join('\n')
}

export function buildCanaryAdminCleanupVerificationSql({ userId, auditId, cleanupAuditId }) {
  return `SELECT (SELECT COUNT(*) FROM users WHERE id = ${sqlString(userId)} AND lower(email) = lower(${sqlString(CANARY_ADMIN.email)})) AS admin_user_remaining,
    (SELECT COUNT(*) FROM platform_admins WHERE user_id = ${sqlString(userId)}) AS admin_role_remaining,
    (SELECT COUNT(*) FROM auth_webauthn_challenges WHERE user_id = ${sqlString(userId)}) AS challenge_remaining,
    (SELECT COUNT(*) FROM platform_audit_log WHERE id = ${sqlString(auditId)}) AS start_audit_preserved,
    (SELECT COUNT(*) FROM platform_audit_log WHERE id = ${sqlString(cleanupAuditId)}) AS cleanup_audit_written`
}

export function buildCanaryAdminSetupVerificationSql({ userId, auditId }) {
  return `SELECT
    (SELECT COUNT(*) FROM users WHERE id = ${sqlString(userId)} AND lower(email) = lower(${sqlString(CANARY_ADMIN.email)}) AND status = 'active') AS user_ok,
    (SELECT COUNT(*) FROM password_credentials WHERE user_id = ${sqlString(userId)}) AS credential_ok,
    (SELECT COUNT(*) FROM platform_admins WHERE user_id = ${sqlString(userId)}) AS platform_admin_ok,
    (SELECT COUNT(*) FROM workspace_memberships WHERE user_id = ${sqlString(userId)}) AS membership_count,
    (SELECT COUNT(*) FROM mailbox_access_grants WHERE user_id = ${sqlString(userId)}) AS grant_count,
    (SELECT COUNT(*) FROM auth_passkeys WHERE user_id = ${sqlString(userId)}) AS passkey_count,
    (SELECT COUNT(*) FROM auth_mfa_recovery_codes WHERE user_id = ${sqlString(userId)} AND used_at IS NULL) AS recovery_code_count,
    (SELECT COUNT(*) FROM auth_webauthn_challenges WHERE user_id = ${sqlString(userId)}) AS challenge_count,
    (SELECT COUNT(*) FROM platform_audit_log WHERE id = ${sqlString(auditId)} AND target_id = ${sqlString(userId)}
      AND action = 'canary.synthetic_platform_admin.test_started') AS audit_ok,
    (SELECT COUNT(*) FROM messages) AS message_count,
    (SELECT COUNT(*) FROM outgoing_drafts) AS draft_count`
}

export function assertCanaryAdminSetup(rows) {
  const state = rows[0]
  const expectedCounts = {
    user_ok: 1,
    credential_ok: 1,
    platform_admin_ok: 1,
    membership_count: 0,
    grant_count: 0,
    passkey_count: 0,
    recovery_code_count: 0,
    challenge_count: 0,
    audit_ok: 1,
    message_count: 0,
    draft_count: 0,
  }
  if (!state || Object.entries(expectedCounts).some(([key, value]) => Number(state[key]) !== value)) {
    throw new Error('Le contrôle après création du compte synthétique a échoué.')
  }
}

export function assertCanaryAdminCleanup(rows) {
  const state = rows[0]
  if (!state || Number(state.admin_user_remaining) !== 0 || Number(state.admin_role_remaining) !== 0
    || Number(state.challenge_remaining) !== 0 || ![0, 1].includes(Number(state.start_audit_preserved))
    || Number(state.cleanup_audit_written) !== 1) {
    throw new Error('Le nettoyage du compte canarie n’a pas pu être confirmé. Contrôle la D1 canarie avant toute nouvelle action.')
  }
}
