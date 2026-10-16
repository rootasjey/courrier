import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  assertRecoveryEnvironmentConfig,
  buildRecoveryAuditSql,
  buildRecoveryMutationSql,
  buildRecoveryPreflightSql,
  parseRecoveryArguments,
  RECOVERY_ENVIRONMENTS,
  sqlString,
} from '../scripts/lib/admin-mfa-recovery.mjs'

const root = new URL('../', import.meta.url)

test('recovery arguments require an explicit safe environment, email and incident reference', () => {
  assert.throws(() => parseRecoveryArguments([]), /environment/u)
  assert.throws(() => parseRecoveryArguments(['--environment', 'local', '--email', 'admin@example.test', '--incident', 'INC-123']), /environment/u)
  assert.throws(() => parseRecoveryArguments(['--environment', 'production', '--email', 'admin@example.test']), /incident/u)
  assert.throws(() => parseRecoveryArguments(['--environment', 'production', '--email', 'admin@example.test', '--incident', 'INC-123', '--yes']), /Option inconnue/u)
  assert.deepEqual(parseRecoveryArguments([
    '--environment', 'canary', '--email', ' Admin@Example.test ', '--incident', 'INC-123',
  ]), { environment: 'canary', email: 'admin@example.test', incidentRef: 'INC-123' })
})

test('only the exact production and isolated canary D1 configurations are accepted', async () => {
  const productionConfig = await readFile(new URL('wrangler.jsonc', root), 'utf8')
  const canaryConfig = await readFile(new URL('wrangler.canary.jsonc', root), 'utf8')
  assert.doesNotThrow(() => assertRecoveryEnvironmentConfig(productionConfig, 'production'))
  assert.doesNotThrow(() => assertRecoveryEnvironmentConfig(canaryConfig, 'canary'))
  assert.throws(() => assertRecoveryEnvironmentConfig(canaryConfig, 'production'), /production/u)
  assert.throws(() => assertRecoveryEnvironmentConfig(productionConfig, 'canary'), /canarie/u)
  assert.throws(() => assertRecoveryEnvironmentConfig(
    productionConfig.replace(RECOVERY_ENVIRONMENTS.production.databaseId, '00000000-0000-4000-8000-000000000000'),
    'production',
  ), /production/u)
  const duplicateCanaryDatabase = canaryConfig.replace(
    /("d1_databases"\s*:\s*\[\s*\{[\s\S]*?\})(\s*\])/u,
    '$1, {\"binding\":\"OTHER\",\"database_name\":\"other\",\"database_id\":\"another-database\"}$2',
  )
  assert.throws(() => assertRecoveryEnvironmentConfig(duplicateCanaryDatabase, 'canary'), /canarie/u)
})

test('preflight SQL reads only account status and factor counts, never credential material', () => {
  const sql = buildRecoveryPreflightSql("admin.o'hara@example.test")
  assert.match(sql, /admin\.o''hara@example\.test/u)
  assert.match(sql, /passkey_count/u)
  assert.match(sql, /recovery_code_count/u)
  assert.doesNotMatch(sql, /password_hash|code_hash|public_key|challenge\s+FROM/u)
})

test('recovery writes a metadata-only audit and invalidates sessions before deleting MFA factors', () => {
  const params = { userId: "user'123", email: "admin.o'hara@example.test", incidentRef: 'INC-123', environment: 'production', runId: 'run-123' }
  const started = buildRecoveryAuditSql(params)
  const completed = buildRecoveryAuditSql({ ...params, completed: true })
  const operations = buildRecoveryMutationSql(params)

  assert.match(started, /account\.admin_mfa_recovery_started/u)
  assert.match(completed, /account\.admin_mfa_recovery_completed/u)
  assert.match(started, /'user''123'/u)
  assert.match(started, /INC-123/u)
  assert.doesNotMatch(started, /password|recovery.?code|public.?key|challenge/u)
  assert.match(operations.revokeSessions, /session_version = session_version \+ 1/u)
  assert.match(operations.revokeSessions, /RETURNING session_version/u)
  assert.match(operations.challenges, /DELETE FROM auth_webauthn_challenges/u)
  assert.match(operations.recoveryCodes, /DELETE FROM auth_mfa_recovery_codes/u)
  assert.match(operations.passkeys, /DELETE FROM auth_passkeys/u)
  assert.match(operations.passkeys, /user''123/u)
  assert.equal(sqlString("it's"), "'it''s'")
})
