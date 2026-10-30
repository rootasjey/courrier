import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

const authStub = new URL('./fixtures/admin-route-auth.mjs', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '../../../../utils/account-auth'
      && context.parentURL?.endsWith('/mailboxes/%5Bid%5D/delete.post.ts')) {
      return { url: authStub, shortCircuit: true }
    }
    return nextResolve(specifier)
  },
})

Object.assign(globalThis, {
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => event.params?.[key],
  readBody: async (event: { body?: unknown }) => event.body,
  setResponseHeader: () => undefined,
  createError: (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options),
})

const deleteMailboxHandler = (await import('../server/api/admin/mailboxes/[id]/delete.post.ts')).default
const ADMIN = { id: 'admin-user-id' }

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE workspace_domains (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, domain TEXT NOT NULL, verification_status TEXT NOT NULL
    );
    CREATE TABLE mailboxes (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, address TEXT NOT NULL,
      status TEXT NOT NULL, archived_at TEXT, deletion_started_at TEXT, deletion_claimed_at TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, is_outgoing INTEGER NOT NULL DEFAULT 0,
      envelope_from TEXT NOT NULL, envelope_to TEXT NOT NULL, raw_object_key TEXT NOT NULL
    );
    CREATE TABLE attachments (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, object_key TEXT NOT NULL);
    CREATE TABLE legacy_forward_deliveries (message_id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE outgoing_drafts (
      id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL, workspace_id TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE outgoing_draft_attachments (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, object_key TEXT NOT NULL);
    CREATE TABLE sender_rule_changes (id TEXT PRIMARY KEY, mailbox_domain TEXT NOT NULL);
    CREATE TABLE sender_rule_change_messages (change_id TEXT NOT NULL, message_id TEXT NOT NULL);
    CREATE TABLE thread_merges (id TEXT PRIMARY KEY, mailbox_domain TEXT NOT NULL);
    CREATE TABLE thread_merge_members (merge_id TEXT NOT NULL, root_message_id TEXT NOT NULL);
    CREATE TABLE sender_rule_change_merges (change_id TEXT NOT NULL, merge_id TEXT NOT NULL);
    CREATE TABLE workspace_activity (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mailbox_id TEXT NOT NULL);
    CREATE TABLE inbound_email_events (id TEXT PRIMARY KEY, recipient_address TEXT NOT NULL);
    CREATE TABLE mailbox_access_grants (id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL);
    CREATE TABLE platform_audit_log (
      id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT, target_type TEXT,
      target_id TEXT, workspace_id TEXT, details_json TEXT, created_at TEXT
    );
    INSERT INTO workspaces VALUES ('workspace-1', 'active');
    INSERT INTO workspace_domains VALUES ('domain-1', 'workspace-1', 'example.test', 'verified');
    INSERT INTO mailboxes VALUES ('mailbox-1', 'workspace-1', 'domain-1', 'box@example.test', 'archived', 'now', NULL, NULL);
  `)

  type Statement = {
    query: string
    values: unknown[]
    bind: (...values: unknown[]) => Statement
    first: <T>() => Promise<T | null>
    all: <T>() => Promise<{ results: T[] }>
    run: () => Promise<{ meta: { changes: number } }>
  }
  const db = {
    prepare(query: string) {
      const statement: Statement = {
        query,
        values: [],
        bind(...values: unknown[]) { statement.values = values; return statement },
        async first<T>() { return sqlite.prepare(query).get(...statement.values as never[]) as T | undefined ?? null },
        async all<T>() { return { results: sqlite.prepare(query).all(...statement.values as never[]) as T[] } },
        async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...statement.values as never[]).changes) } } },
      }
      return statement
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => ({
          meta: { changes: Number(sqlite.prepare(statement.query).run(...statement.values as never[]).changes) },
        }))
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }

  return { sqlite, db }
}

test('Cloudflare DELETE 403 still purges an archived mailbox and audits manual cleanup', async () => {
  const { sqlite, db } = createDatabase()
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  let routeEnabled = true
  const route = {
    id: 'rule-1',
    name: 'box@example.test',
    matchers: [{ type: 'literal', field: 'to', value: 'box@example.test' }],
    actions: [{ type: 'worker', value: ['courrier'] }],
    enabled: routeEnabled,
  }

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'example.test', status: 'active' }] })
    }
    if (url.pathname.endsWith('/email/routing/rules')) {
      return Response.json({
        success: true,
        result: [{ ...route, enabled: routeEnabled }],
        result_info: { total_pages: 1 },
      })
    }
    if (url.pathname.endsWith('/email/routing/rules/rule-1') && init?.method === 'PUT') {
      routeEnabled = false
      return Response.json({ success: true, result: { ...route, enabled: routeEnabled } })
    }
    if (url.pathname.endsWith('/email/routing/rules/rule-1') && init?.method === 'DELETE') {
      return Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 })
    }
    throw new Error(`Unexpected Cloudflare request: ${init?.method ?? 'GET'} ${url.pathname}`)
  }

  try {
    const result = await deleteMailboxHandler({
      params: { id: 'mailbox-1' },
      body: { confirmationAddress: 'box@example.test' },
      context: {
        platformAdmin: ADMIN,
        cloudflare: { env: {
          DB: db,
          MAIL_STORE: { delete: async () => undefined },
          COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN: 'write-token',
        } },
      },
    } as never) as { mailboxId: string, deleted: boolean, routingCleanup: string }

    assert.deepEqual(result, { mailboxId: 'mailbox-1', deleted: true, routingCleanup: 'manual_required', messagesDeleted: 0, storedObjectsDeleted: 0 })
    assert.deepEqual(calls, [
      'GET /client/v4/zones',
      'GET /client/v4/zones/zone-1/email/routing/rules',
      'PUT /client/v4/zones/zone-1/email/routing/rules/rule-1',
      'GET /client/v4/zones',
      'GET /client/v4/zones/zone-1/email/routing/rules',
      'DELETE /client/v4/zones/zone-1/email/routing/rules/rule-1',
    ])
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM mailboxes WHERE id = ?').get('mailbox-1')?.count, 0)
    const detailsJson = sqlite.prepare("SELECT details_json FROM platform_audit_log WHERE action = 'workspace_mailbox.deleted'").get()?.details_json
    assert.equal(JSON.parse(String(detailsJson)).routingCleanup, 'manual_required')
  } finally {
    globalThis.fetch = originalFetch
    sqlite.close()
  }
})
