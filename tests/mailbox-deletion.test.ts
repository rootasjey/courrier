import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { collectMailboxPurgeData, permanentlyDeleteMailboxData } from '../server/utils/mailbox-deletion.ts'

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY);
    CREATE TABLE mailboxes (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, address TEXT NOT NULL,
      archived_at TEXT, deletion_started_at TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, is_outgoing INTEGER NOT NULL DEFAULT 0,
      envelope_from TEXT NOT NULL, envelope_to TEXT NOT NULL, raw_object_key TEXT NOT NULL
    );
    CREATE TABLE attachments (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      object_key TEXT NOT NULL
    );
    CREATE TABLE legacy_forward_deliveries (
      message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE, status TEXT NOT NULL
    );
    CREATE TABLE outgoing_drafts (
      id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL, workspace_id TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE outgoing_draft_attachments (
      id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES outgoing_drafts(id) ON DELETE CASCADE,
      object_key TEXT NOT NULL
    );
    CREATE TABLE sender_rule_changes (id TEXT PRIMARY KEY, mailbox_domain TEXT NOT NULL);
    CREATE TABLE sender_rule_change_messages (change_id TEXT NOT NULL, message_id TEXT NOT NULL);
    CREATE TABLE thread_merges (id TEXT PRIMARY KEY, mailbox_domain TEXT NOT NULL);
    CREATE TABLE thread_merge_members (merge_id TEXT NOT NULL, root_message_id TEXT NOT NULL);
    CREATE TABLE sender_rule_change_merges (change_id TEXT NOT NULL, merge_id TEXT NOT NULL);
    CREATE TABLE workspace_activity (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mailbox_id TEXT NOT NULL);
    CREATE TABLE inbound_email_events (id TEXT PRIMARY KEY, recipient_address TEXT NOT NULL);
    CREATE TABLE mailbox_access_grants (id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE);
    CREATE TABLE platform_audit_log (
      id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT, target_type TEXT,
      target_id TEXT, workspace_id TEXT, details_json TEXT, created_at TEXT
    );
  `)

  type SqlStatement = {
    query: string
    values: unknown[]
    bind: (...values: unknown[]) => SqlStatement
    first: <T>() => Promise<T | null>
    all: <T>() => Promise<{ results: T[] }>
    run: () => Promise<unknown>
  }
  const db = {
    prepare(query: string) {
      const statement: SqlStatement = {
        query,
        values: [] as unknown[],
        bind(...values: unknown[]) { statement.values = values; return statement },
        async first<T>() { return sqlite.prepare(query).get(...statement.values as never[]) as T | undefined ?? null },
        async all<T>() { return { results: sqlite.prepare(query).all(...statement.values as never[]) as T[] } },
        async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...statement.values as never[]).changes) } } },
      }
      return statement
    },
    async batch(statements: SqlStatement[]) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map((statement) => ({
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

test('mailbox purge collects only its exact message, attachment, and draft object keys', async () => {
  const { sqlite, db } = createDatabase()
  sqlite.exec(`
    INSERT INTO messages VALUES ('in-1',0,'sender@example.test','box@example.test','messages/in-1.eml');
    INSERT INTO messages VALUES ('out-1',1,'box@example.test','recipient@example.test','messages/out-1.eml');
    INSERT INTO messages VALUES ('other-1',0,'sender@example.test','other@example.test','messages/other-1.eml');
    INSERT INTO attachments VALUES ('att-1','in-1','messages/in-1/attachment');
    INSERT INTO attachments VALUES ('att-2','other-1','messages/other-1/attachment');
    INSERT INTO outgoing_drafts VALUES ('draft-1','mailbox-1','workspace-1','draft');
    INSERT INTO outgoing_drafts VALUES ('draft-2','mailbox-2','workspace-1','draft');
    INSERT INTO outgoing_draft_attachments VALUES ('draft-att-1','draft-1','outgoing-drafts/draft-1/attachment');
    INSERT INTO outgoing_draft_attachments VALUES ('draft-att-2','draft-2','outgoing-drafts/draft-2/attachment');
  `)

  try {
    const data = await collectMailboxPurgeData(db as never, {
      id: 'mailbox-1', workspaceId: 'workspace-1', domain: 'example.test', address: 'box@example.test',
    })
    assert.deepEqual(data.objectKeys.sort(), [
      'messages/in-1.eml', 'messages/in-1/attachment', 'messages/out-1.eml',
      'outgoing-drafts/draft-1/attachment',
    ])
    assert.deepEqual(data.messages.map(message => message.id).sort(), ['in-1', 'out-1'])
    assert.deepEqual(data.threadMergeIds, [])
    assert.equal(data.pendingForward, false)
    assert.equal(data.pendingDraft, false)
  } finally {
    sqlite.close()
  }
})

test('permanent mailbox purge removes mailbox-owned content but preserves neighboring and shared domain data', async () => {
  const { sqlite, db } = createDatabase()
  sqlite.exec(`
    INSERT INTO users VALUES ('admin-1');
    INSERT INTO workspaces VALUES ('workspace-1');
    INSERT INTO mailboxes VALUES ('mailbox-1','workspace-1','box@example.test','now','now');
    INSERT INTO mailboxes VALUES ('mailbox-2','workspace-1','other@example.test','now','now');
    INSERT INTO messages VALUES ('in-1',0,'sender@example.test','box@example.test','messages/in-1.eml');
    INSERT INTO messages VALUES ('out-1',1,'box@example.test','recipient@example.test','messages/out-1.eml');
    INSERT INTO messages VALUES ('other-1',0,'sender@example.test','other@example.test','messages/other-1.eml');
    INSERT INTO attachments VALUES ('att-1','in-1','messages/in-1/attachment');
    INSERT INTO legacy_forward_deliveries VALUES ('in-1','forwarded');
    INSERT INTO outgoing_drafts VALUES ('draft-1','mailbox-1','workspace-1','draft');
    INSERT INTO outgoing_drafts VALUES ('draft-2','mailbox-2','workspace-1','draft');
    INSERT INTO outgoing_draft_attachments VALUES ('draft-att-1','draft-1','outgoing-drafts/draft-1/attachment');
    INSERT INTO mailbox_access_grants VALUES ('grant-1','mailbox-1');
    INSERT INTO mailbox_access_grants VALUES ('grant-2','mailbox-2');
    INSERT INTO sender_rule_changes VALUES ('change-1','example.test');
    INSERT INTO sender_rule_change_messages VALUES ('change-1','in-1');
    INSERT INTO thread_merges VALUES ('merge-1','example.test');
    INSERT INTO thread_merges VALUES ('unrelated-invalid-merge','example.test');
    INSERT INTO thread_merge_members VALUES ('merge-1','in-1');
    INSERT INTO thread_merge_members VALUES ('merge-1','other-1');
    INSERT INTO sender_rule_change_merges VALUES ('change-1','merge-1');
    INSERT INTO sender_rule_change_merges VALUES ('change-1','unrelated-invalid-merge');
    INSERT INTO workspace_activity VALUES ('activity-1','workspace-1','mailbox-1');
    INSERT INTO workspace_activity VALUES ('activity-2','workspace-1','mailbox-2');
    INSERT INTO inbound_email_events VALUES ('event-1','box@example.test');
  `)
  const deletedKeys: string[] = []

  try {
    const data = await collectMailboxPurgeData(db as never, {
      id: 'mailbox-1', workspaceId: 'workspace-1', domain: 'example.test', address: 'box@example.test',
    })
    const deleted = await permanentlyDeleteMailboxData({
      db: db as never,
      mailStore: { delete: async (keys: string | string[]) => { deletedKeys.push(...(Array.isArray(keys) ? keys : [keys])) } } as never,
      target: { id: 'mailbox-1', workspaceId: 'workspace-1', domain: 'example.test', address: 'box@example.test' },
      actorId: 'admin-1',
      data,
      deletedAt: '2026-10-29T00:00:00.000Z',
      archivedGuardSql: `EXISTS (SELECT 1 FROM mailboxes WHERE id = ? AND workspace_id = ? AND archived_at IS NOT NULL AND deletion_started_at IS NOT NULL)`,
      routingCleanup: 'removed',
    })
    assert.equal(deleted, true)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM mailboxes WHERE id = ?').get('mailbox-1')?.count, 0)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM messages WHERE id IN (?, ?)').get('in-1', 'out-1')?.count, 0)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM messages WHERE id = ?').get('other-1')?.count, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM outgoing_drafts WHERE id = ?').get('draft-1')?.count, 0)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM outgoing_drafts WHERE id = ?').get('draft-2')?.count, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM mailbox_access_grants WHERE mailbox_id = ?').get('mailbox-1')?.count, 0)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM mailbox_access_grants WHERE mailbox_id = ?').get('mailbox-2')?.count, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sender_rule_changes').get()?.count, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM thread_merges WHERE id = ?').get('unrelated-invalid-merge')?.count, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sender_rule_change_merges WHERE merge_id = ?').get('unrelated-invalid-merge')?.count, 1)
    assert.deepEqual(deletedKeys.sort(), [
      'messages/in-1.eml', 'messages/in-1/attachment', 'messages/out-1.eml',
      'outgoing-drafts/draft-1/attachment',
    ])
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM platform_audit_log WHERE action = 'workspace_mailbox.deleted'").get()?.count, 1)
    const auditDetails = JSON.parse(String(sqlite.prepare("SELECT details_json FROM platform_audit_log WHERE action = 'workspace_mailbox.deleted'").get()?.details_json))
    assert.equal(auditDetails.routingCleanup, 'removed')
  } finally {
    sqlite.close()
  }
})
