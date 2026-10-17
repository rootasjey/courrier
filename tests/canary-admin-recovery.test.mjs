import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertCanaryAdminRecoveryCleanup,
  buildCanaryAdminRecoveryCleanupSql,
  buildCanaryAdminRecoverySetupSql,
  buildCanaryAdminRecoveryVerificationSql,
} from '../scripts/lib/canary-admin-recovery.mjs'

const testAccounts = {
  actorId: '00000000-0000-4000-8000-000000000201',
  actorEmail: 'canary.admin-recovery-actor@example.invalid',
  actorPasswordHash: 'actor-password-hash',
  actorRecoveryHash: 'a'.repeat(64),
  actorRecoveryId: 'actor-recovery-code',
  actorCredentialId: 'actor-synthetic-credential',
  targetId: '00000000-0000-4000-8000-000000000202',
  targetEmail: 'canary.admin-recovery-target@example.invalid',
  targetPasswordHash: 'target-password-hash',
  targetRecoveryHash: 'b'.repeat(64),
  targetRecoveryId: 'target-recovery-code',
  targetCredentialId: 'target-synthetic-credential',
  stepUpChallengeId: 'target-step-up-challenge',
  loginChallengeId: 'target-login-challenge',
  startedAuditId: 'recovery-test-started',
  cleanupAuditId: 'recovery-test-cleanup',
}

test('canary recovery fixture creates two isolated platform admins with synthetic factors', () => {
  const sql = buildCanaryAdminRecoverySetupSql(testAccounts)

  assert.match(sql, /canary.admin-recovery-actor@example.invalid/u)
  assert.match(sql, /canary.admin-recovery-target@example.invalid/u)
  assert.match(sql, /INSERT INTO platform_admins/u)
  assert.match(sql, /INSERT INTO auth_passkeys/u)
  assert.match(sql, /INSERT INTO auth_mfa_recovery_codes/u)
  assert.match(sql, /'admin_step_up'/u)
  assert.match(sql, /'account_login'/u)
  assert.match(sql, /'canary.synthetic_platform_admin.recovery_test_started'/u)
  assert.doesNotMatch(sql, /[0-9A-F]{4}(?:-[0-9A-F]{4}){7}/u)
})

test('canary cleanup requires both exact synthetic identities and no mailbox access', () => {
  const sql = buildCanaryAdminRecoveryCleanupSql(testAccounts)

  assert.match(sql, /lower\(email\) = lower\('canary\.admin-recovery-actor@example\.invalid'\)/u)
  assert.match(sql, /lower\(email\) = lower\('canary\.admin-recovery-target@example\.invalid'\)/u)
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM workspace_memberships/u)
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM mailbox_access_grants/u)
  assert.match(sql, /accounts_removed/u)
})

test('canary cleanup verification requires removed factors and retained metadata-only audit records', () => {
  const sql = buildCanaryAdminRecoveryVerificationSql(testAccounts)

  for (const field of [
    'users_remaining', 'admin_roles_remaining', 'passkeys_remaining', 'recovery_codes_remaining',
    'challenges_remaining', 'recovery_audit_written', 'cleanup_audit_written',
  ]) assert.match(sql, new RegExp(`AS ${field}`, 'u'))
  assert.match(sql, /secret_audit_matches/u)
  assert.match(sql, /challenge_audit_matches/u)
})

test('canary cleanup assertion fails closed when an account or factor remains', () => {
  assert.throws(() => assertCanaryAdminRecoveryCleanup([{
    users_remaining: 0,
    admin_roles_remaining: 0,
    passkeys_remaining: 0,
    recovery_codes_remaining: 0,
    challenges_remaining: 1,
    start_audit_written: 1,
    recovery_audit_written: 1,
    cleanup_audit_written: 1,
    secret_audit_matches: 0,
    challenge_audit_matches: 0,
    target_email_remaining: 0,
  }]), /nettoyage.*n’a pas pu être confirmé/u)
})

