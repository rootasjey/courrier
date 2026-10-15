import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

Object.assign(globalThis, {
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => event.params?.[key],
  readBody: async (event: { body?: unknown }) => event.body,
  createError: (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options),
})

const classifyMessageHandler = (await import('../server/api/messages/[id]/folder.patch.ts')).default

const testAccountUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test@example.test',
  displayName: 'Test account',
  sessionVersion: 1,
  activeWorkspaceId: 'workspace-test',
}

test('message-only Screener approval moves only the selected message and clears its pending state', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
    CREATE TABLE workspace_domains (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      verification_status TEXT NOT NULL
    );
    CREATE TABLE mailboxes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE mailbox_access_grants (
      workspace_id TEXT NOT NULL,
      mailbox_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO workspaces VALUES ('workspace-test', 'active');
    INSERT INTO workspace_domains VALUES ('domain-test', 'workspace-test', 'verbatims.cc', 'verified');
    INSERT INTO mailboxes VALUES ('mailbox-test', 'workspace-test', 'domain-test', 'courrier-test@verbatims.cc', 'active');
    INSERT INTO mailbox_access_grants VALUES ('workspace-test', 'mailbox-test', '00000000-0000-4000-8000-000000000001', 'active');
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      mailbox_domain TEXT NOT NULL DEFAULT 'verbatims.cc',
      envelope_to TEXT NOT NULL DEFAULT 'courrier-test@verbatims.cc',
      envelope_from TEXT NOT NULL DEFAULT 'sender@example.net',
      is_outgoing INTEGER NOT NULL DEFAULT 0,
      folder TEXT NOT NULL,
      screener_state TEXT NOT NULL,
      trashed_at TEXT
    );
    INSERT INTO messages (id, folder, screener_state) VALUES
      ('selected', 'Screener', 'pending'),
      ('same-sender-sibling', 'Screener', 'pending');
  `)

  const db = {
    prepare(sql: string) {
      let values: unknown[] = []
      return {
        bind(...nextValues: unknown[]) {
          values = nextValues
          return this
        },
        async first<T>() {
          return sqlite.prepare(sql).get(...values as never[]) as T | undefined ?? null
        },
        async run() {
          const result = sqlite.prepare(sql).run(...values as never[])
          return { success: true, results: [], meta: { changes: Number(result.changes) } }
        },
      }
    },
  }

  const result = await classifyMessageHandler({
    params: { id: 'selected' },
    body: { folder: 'Imbox' },
    context: { cloudflare: { env: { DB: db } }, accountUser: testAccountUser },
  } as never) as { folder: string }

  assert.deepEqual(result, { folder: 'Imbox' })
  assert.deepEqual(
    (sqlite.prepare('SELECT id, folder, screener_state FROM messages ORDER BY id').all() as {
      id: string
      folder: string
      screener_state: string
    }[]).map(row => ({ ...row })),
    [
      { id: 'same-sender-sibling', folder: 'Screener', screener_state: 'pending' },
      { id: 'selected', folder: 'Imbox', screener_state: 'cleared' },
    ],
  )
  sqlite.close()
})
