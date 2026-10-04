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

test('message-only Screener approval moves only the selected message and clears its pending state', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
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
    context: { cloudflare: { env: { DB: db } } },
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
