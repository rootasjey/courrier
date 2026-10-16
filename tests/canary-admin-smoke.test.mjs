import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { assertRecoveryEnvironmentConfig } from '../scripts/lib/admin-mfa-recovery.mjs'
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
} from '../scripts/lib/canary-admin-smoke.mjs'

const root = new URL('../', import.meta.url)
const baseline = {
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

test('admin smoke test is pinned to the isolated canary config', async () => {
  const config = await readFile(new URL('wrangler.canary.jsonc', root), 'utf8')
  assert.doesNotThrow(() => assertRecoveryEnvironmentConfig(config, 'canary'))
  assert.throws(() => assertRecoveryEnvironmentConfig(config, 'production'), /production/u)
})

test('preflight only accepts the known member baseline with no admin or mail content', () => {
  assert.doesNotThrow(() => assertCanaryAdminBaseline([baseline]))
  assert.throws(() => assertCanaryAdminBaseline([]), /Prévol refusé/u)
  assert.throws(() => assertCanaryAdminBaseline([{ ...baseline, attachment_count: 1 }]), /Prévol refusé/u)
  assert.throws(() => assertCanaryAdminBaseline([{ ...baseline, any_platform_admin_exists: 1 }]), /Prévol refusé/u)
  assert.throws(() => assertCanaryAdminBaseline([{ ...baseline, member_grant_ok: 0 }]), /Prévol refusé/u)

  const sql = buildCanaryAdminPreflightSql()
  assert.match(sql, /canary\.admin@example\.invalid/u)
  assert.match(sql, /outgoing_draft_attachments/u)
  assert.doesNotMatch(sql, /password_hash|public_key|code_hash/u)
})

test('temporary account setup gives only platform administration and keeps an audit trail', () => {
  const setup = buildCanaryAdminSetupSql({ userId: 'synthetic-user-1', auditId: 'synthetic-start-1', passwordHash: 'test hash' })
  const verification = buildCanaryAdminSetupVerificationSql({ userId: 'synthetic-user-1', auditId: 'synthetic-start-1' })
  assert.equal(CANARY_ADMIN.email, 'canary.admin@example.invalid')
  assert.match(setup, /platform_admins/u)
  assert.match(setup, /test_started/u)
  assert.doesNotMatch(setup, /workspace_memberships|mailbox_access_grants|INSERT INTO mailboxes|INSERT INTO workspaces/u)
  assert.doesNotMatch(setup, /recovery_code|password\s*['"]?:/iu)
  assert.match(verification, /passkey_count/u)
  assert.match(verification, /challenge_count/u)
})

test('cleanup deletes only the synthetic admin if it gained no workspace or mailbox access', () => {
  const cleanup = buildCanaryAdminCleanupSql({
    userId: 'synthetic-user-1', cleanupAuditId: 'synthetic-cleanup-1',
  })
  const verification = buildCanaryAdminCleanupVerificationSql({
    userId: 'synthetic-user-1', auditId: 'synthetic-start-1', cleanupAuditId: 'synthetic-cleanup-1',
  })
  assert.match(cleanup, /NOT EXISTS \(SELECT 1 FROM workspace_memberships/u)
  assert.match(cleanup, /NOT EXISTS \(SELECT 1 FROM mailbox_access_grants/u)
  assert.match(cleanup, /canary\.admin@example\.invalid/u)
  assert.match(cleanup, /test_cleanup/u)
  assert.doesNotMatch(cleanup, /DELETE FROM workspaces|DELETE FROM mailboxes|DELETE FROM messages/u)
  assert.match(verification, /synthetic-start-1/u)
  assert.match(verification, /synthetic-cleanup-1/u)

  assert.doesNotThrow(() => assertCanaryAdminCleanup([{
    admin_user_remaining: 0,
    admin_role_remaining: 0,
    challenge_remaining: 0,
    start_audit_preserved: 0,
    cleanup_audit_written: 1,
  }]))
  assert.throws(() => assertCanaryAdminCleanup([{
    admin_user_remaining: 1,
    admin_role_remaining: 0,
    challenge_remaining: 0,
    start_audit_preserved: 1,
    cleanup_audit_written: 0,
  }]), /nettoyage/u)
})

test('postflight requires no mailbox access or content during the admin smoke test', () => {
  assert.doesNotThrow(() => assertCanaryAdminSetup([{
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
  }]))
  assert.throws(() => assertCanaryAdminSetup([{
    user_ok: 1,
    credential_ok: 1,
    platform_admin_ok: 1,
    membership_count: 0,
    grant_count: 1,
    passkey_count: 0,
    recovery_code_count: 0,
    challenge_count: 0,
    audit_ok: 1,
    message_count: 0,
    draft_count: 0,
  }]), /contrôle après création/u)
})
