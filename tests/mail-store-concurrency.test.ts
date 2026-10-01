import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { handleIncomingEmail } from '../server/utils/email-handler.ts'
import type { MailStorageBindings } from '../server/utils/mail-store.ts'

type BoundStatement = {
  sql: string
  values: unknown[]
  first<T>(): Promise<T | null>
}

class ConcurrentD1 {
  private readonly sqlite = new DatabaseSync(':memory:')
  private initialSelects = 0
  private releaseInitialSelects!: () => void
  private readonly initialSelectBarrier = new Promise<void>((resolve) => {
    this.releaseInitialSelects = resolve
  })

  constructor() {
    this.sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL UNIQUE,
        envelope_from TEXT NOT NULL,
        envelope_to TEXT NOT NULL,
        sender_name TEXT NOT NULL DEFAULT '',
        sender_address TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '(sans objet)',
        sent_at TEXT,
        received_at TEXT NOT NULL,
        in_reply_to TEXT,
        references_header TEXT,
        text_body TEXT NOT NULL DEFAULT '',
        raw_object_key TEXT NOT NULL,
        mailbox_domain TEXT NOT NULL,
        folder TEXT NOT NULL
      );
      CREATE TABLE sender_rules (
        mailbox_domain TEXT NOT NULL,
        sender_address TEXT NOT NULL,
        folder TEXT NOT NULL,
        PRIMARY KEY (mailbox_domain, sender_address)
      );
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        content_id TEXT,
        disposition TEXT
      );
    `)
  }

  prepare(sql: string) {
    const statement = {
      sql,
      values: [] as unknown[],
      bind(...values: unknown[]) {
        statement.values = values
        return statement
      },
      async first<T>() {
        if (sql.includes('SELECT id FROM messages WHERE message_id = ?')) {
          thisD1.initialSelects += 1
          if (thisD1.initialSelects <= 2) {
            if (thisD1.initialSelects === 2) thisD1.releaseInitialSelects()
            await thisD1.initialSelectBarrier
          }
        }
        return thisD1.sqlite.prepare(sql).get(...statement.values as never[]) as T | undefined ?? null
      },
    }
    const thisD1 = this
    return statement as unknown as D1PreparedStatement
  }

  async batch(statements: D1PreparedStatement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((statement) => {
        const bound = statement as unknown as BoundStatement
        const result = this.sqlite.prepare(bound.sql).run(...bound.values as never[])
        return { success: true, meta: { changes: Number(result.changes) } }
      })
      this.sqlite.exec('COMMIT')
      return results as D1Result[]
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  counts() {
    return {
      messages: Number(this.sqlite.prepare('SELECT COUNT(*) AS count FROM messages').get()?.count),
      attachments: Number(this.sqlite.prepare('SELECT COUNT(*) AS count FROM attachments').get()?.count),
    }
  }

  close() {
    this.sqlite.close()
  }
}

class MemoryR2 {
  readonly objects = new Map<string, Uint8Array>()

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string) {
    const bytes = typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    this.objects.set(key, bytes)
  }

  async delete(key: string) {
    this.objects.delete(key)
  }
}

function rawEmail(body: string) {
  return [
    'From: Jules Exemple <jules@example.net>',
    'To: courrier-test@verbatims.cc',
    'Message-ID: <same-message@example.net>',
    'Subject: Test de doublon concurrent',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="courrier-boundary"',
    '',
    '--courrier-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    '--courrier-boundary',
    'Content-Type: text/plain; name="note.txt"',
    'Content-Disposition: attachment; filename="note.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    'YXR0YWNobWVudCBjb250ZW50',
    '--courrier-boundary--',
    '',
  ].join('\r\n')
}

function makeMessage(source: string, forward: (destination: string) => Promise<unknown>) {
  return {
    from: 'jules@example.net',
    to: 'courrier-test@verbatims.cc',
    raw: new Response(source).body!,
    forward,
  }
}

function makeBindings(db: ConcurrentD1, r2: MemoryR2): MailStorageBindings {
  return {
    DB: db as unknown as D1Database,
    MAIL_STORE: r2 as unknown as R2Bucket,
    COURRIER_LEGACY_FORWARD_TO: 'hey-test@example.org',
  }
}

test('deux livraisons simultanées identiques ne stockent et ne relaient qu’une fois', async () => {
  const db = new ConcurrentD1()
  const r2 = new MemoryR2()
  const forwardedTo: string[] = []
  const bindings = makeBindings(db, r2)
  const source = rawEmail('Même contenu reçu en double.')

  try {
    await Promise.all([
      handleIncomingEmail(makeMessage(source, async destination => { forwardedTo.push(destination) }), bindings),
      handleIncomingEmail(makeMessage(source, async destination => { forwardedTo.push(destination) }), bindings),
    ])

    assert.deepEqual(db.counts(), { messages: 1, attachments: 1 })
    assert.equal(r2.objects.size, 2)
    assert.deepEqual(forwardedTo, ['hey-test@example.org'])
  } finally {
    db.close()
  }
})

test('deux livraisons simultanées avec le même Message-ID nettoient les objets du perdant', async () => {
  const db = new ConcurrentD1()
  const r2 = new MemoryR2()
  const forwardedTo: string[] = []
  const bindings = makeBindings(db, r2)

  try {
    await Promise.all([
      handleIncomingEmail(makeMessage(rawEmail('Version A.'), async destination => { forwardedTo.push(destination) }), bindings),
      handleIncomingEmail(makeMessage(rawEmail('Version B.'), async destination => { forwardedTo.push(destination) }), bindings),
    ])

    assert.deepEqual(db.counts(), { messages: 1, attachments: 1 })
    assert.equal(r2.objects.size, 2)
    assert.deepEqual(forwardedTo, ['hey-test@example.org'])
  } finally {
    db.close()
  }
})
