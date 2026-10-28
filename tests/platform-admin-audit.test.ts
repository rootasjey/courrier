import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { isAdministrativeActor } from '../server/utils/platform-admin-audit.ts'

test('isAdministrativeActor recognizes platform and workspace administrators only', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE platform_admins (user_id TEXT PRIMARY KEY);
    CREATE TABLE workspace_memberships (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO workspace_memberships VALUES ('owner', 'workspace-a', 'owner', 'active');
    INSERT INTO workspace_memberships VALUES ('admin', 'workspace-a', 'admin', 'active');
    INSERT INTO workspace_memberships VALUES ('member', 'workspace-a', 'member', 'active');
    INSERT INTO workspace_memberships VALUES ('former-admin', 'workspace-a', 'admin', 'suspended');
    INSERT INTO platform_admins VALUES ('platform-admin');
  `)

  const db = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) {
          statement.values = values
          return statement
        },
        async first<T>() {
          return sqlite.prepare(sql).get(...statement.values as never[]) as T | undefined ?? null
        },
      }
      return statement
    },
  }

  try {
    assert.equal(await isAdministrativeActor(db as never, 'owner', 'workspace-a'), true)
    assert.equal(await isAdministrativeActor(db as never, 'admin', 'workspace-a'), true)
    assert.equal(await isAdministrativeActor(db as never, 'member', 'workspace-a'), false)
    assert.equal(await isAdministrativeActor(db as never, 'former-admin', 'workspace-a'), false)
    assert.equal(await isAdministrativeActor(db as never, 'platform-admin', 'workspace-a'), true)
  } finally {
    sqlite.close()
  }
})
