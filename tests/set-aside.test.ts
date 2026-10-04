import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { storeIncomingEmail } from '../server/utils/mail-store.ts'
import type { MailStorageBindings } from '../server/utils/mail-store.ts'
import { clearReplyLaterThread } from '../server/utils/reply-later-thread.ts'
import { resolveSetAsideRestoreFolder } from '../server/utils/set-aside-restore.ts'

Object.assign(globalThis, {
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => event.params?.[key],
  readBody: async (event: { body?: unknown }) => event.body,
  createError: (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options),
})

const setAsideHandler = (await import('../server/api/messages/[id]/set-aside.patch.ts')).default
const senderRuleHandler = (await import('../server/api/messages/[id]/sender-rule.put.ts')).default
const senderRuleUndoHandler = (await import('../server/api/sender-rule-changes/[id]/undo.post.ts')).default

type BoundStatement = {
  sql: string
  values: unknown[]
}

class TestD1 {
  private readonly sqlite = new DatabaseSync(':memory:')
  private readonly failSetAsideLookup: boolean

  constructor(failSetAsideLookup = false) {
    this.failSetAsideLookup = failSetAsideLookup
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
        folder TEXT NOT NULL,
        is_set_aside INTEGER NOT NULL DEFAULT 0,
        is_reply_later INTEGER NOT NULL DEFAULT 0,
        is_outgoing INTEGER NOT NULL DEFAULT 0,
        trashed_at TEXT
      );
      CREATE TABLE sender_rules (
        mailbox_domain TEXT NOT NULL,
        sender_address TEXT NOT NULL,
        folder TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        last_change_id TEXT,
        PRIMARY KEY (mailbox_domain, sender_address)
      );
      CREATE TABLE sender_rule_changes (
        id TEXT PRIMARY KEY,
        mailbox_domain TEXT NOT NULL,
        sender_address TEXT NOT NULL,
        previous_rule_folder TEXT,
        previous_change_id TEXT,
        next_folder TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        undone_at TEXT
      );
      CREATE TABLE sender_rule_change_messages (
        change_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        previous_folder TEXT NOT NULL,
        PRIMARY KEY (change_id, message_id)
      );
      CREATE TABLE sender_rule_change_merges (
        change_id TEXT NOT NULL,
        merge_id TEXT NOT NULL,
        previous_folder TEXT NOT NULL,
        PRIMARY KEY (change_id, merge_id)
      );
      CREATE TABLE thread_merges (
        id TEXT PRIMARY KEY,
        mailbox_domain TEXT NOT NULL,
        folder TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE thread_merge_members (
        merge_id TEXT NOT NULL REFERENCES thread_merges(id) ON DELETE CASCADE,
        root_message_id TEXT NOT NULL,
        PRIMARY KEY (merge_id, root_message_id)
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
    const statement: BoundStatement & {
      bind(...values: unknown[]): typeof statement
      first<T>(): Promise<T | null>
      all<T>(): Promise<D1Result<T>>
      run(): Promise<D1Result>
    } = {
      sql,
      values: [],
      bind(...values) {
        statement.values = values
        return statement
      },
      async first<T>() {
        if (thisD1.failSetAsideLookup && sql.includes('SELECT 1 AS linked')) {
          throw new Error('lookup Set Aside indisponible')
        }
        return thisD1.sqlite.prepare(sql).get(...statement.values as never[]) as T | undefined ?? null
      },
      async all<T>() {
        const results = thisD1.sqlite.prepare(sql).all(...statement.values as never[]) as T[]
        return { success: true, results, meta: { changes: 0 } } as D1Result<T>
      },
      async run() {
        const result = thisD1.sqlite.prepare(sql).run(...statement.values as never[])
        return { success: true, results: [], meta: { changes: Number(result.changes) } }
      },
    }
    const thisD1 = this
    return statement as unknown as D1PreparedStatement
  }

  async batch(statements: D1PreparedStatement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map((prepared) => {
        const statement = prepared as unknown as BoundStatement
        const result = this.sqlite.prepare(statement.sql).run(...statement.values as never[])
        return { success: true, meta: { changes: Number(result.changes) } }
      })
      this.sqlite.exec('COMMIT')
      return results as D1Result[]
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  seedSetAsideMessage() {
    this.sqlite.prepare(`
      INSERT INTO messages (
        id, message_id, envelope_from, envelope_to, sender_address, subject,
        received_at, raw_object_key, mailbox_domain, folder, is_set_aside
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      'parked-original',
      '<parked-original@example.net>',
      'sender@example.net',
      'courrier-test@verbatims.cc',
      'sender@example.net',
      'Conversation mise de côté',
      '2026-10-03T10:00:00.000Z',
      'messages/parked-original/original.eml',
      'verbatims.cc',
      'Imbox',
    )
    this.sqlite.prepare(`
      INSERT INTO sender_rules (mailbox_domain, sender_address, folder)
      VALUES ('verbatims.cc', 'sender@example.net', 'The Feed')
    `).run()
  }

  seedReplyLaterMessage() {
    this.sqlite.prepare(`
      INSERT INTO messages (
        id, message_id, envelope_from, envelope_to, sender_address, subject,
        received_at, raw_object_key, mailbox_domain, folder, is_reply_later
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      'reply-later-original',
      '<reply-later-original@example.net>',
      'sender@example.net',
      'courrier-test@verbatims.cc',
      'sender@example.net',
      'Conversation à reprendre',
      '2026-10-03T10:00:00.000Z',
      'messages/reply-later-original/original.eml',
      'verbatims.cc',
      'Imbox',
    )
  }

  replyLaterFlags() {
    return (this.sqlite.prepare('SELECT id, is_reply_later FROM messages ORDER BY id').all() as {
      id: string
      is_reply_later: number
    }[]).map(row => ({ ...row }))
  }

  seedLinkedSetAsideMessage(id: string, messageId: string, senderAddress: string, inReplyTo: string | null) {
    this.sqlite.prepare(`
      INSERT INTO messages (
        id, message_id, envelope_from, envelope_to, sender_name, sender_address,
        subject, received_at, in_reply_to, raw_object_key, mailbox_domain, folder, is_set_aside
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imbox', 1)
    `).run(
      id,
      messageId,
      senderAddress,
      'courrier-test@verbatims.cc',
      senderAddress,
      senderAddress,
      'Réponse',
      '2026-10-03T10:10:00.000Z',
      inReplyTo,
      `messages/${id}/original.eml`,
      'verbatims.cc',
    )
  }

  seedSenderRule(senderAddress: string, folder: string) {
    this.sqlite.prepare(`
      INSERT INTO sender_rules (mailbox_domain, sender_address, folder)
      VALUES ('verbatims.cc', ?, ?)
    `).run(senderAddress, folder)
  }

  seedIndependentMessage(id: string, senderAddress: string) {
    this.sqlite.prepare(`
      INSERT INTO messages (
        id, message_id, envelope_from, envelope_to, sender_address,
        subject, received_at, raw_object_key, mailbox_domain, folder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verbatims.cc', 'Imbox')
    `).run(
      id,
      `<${id}@example.net>`,
      senderAddress,
      'courrier-test@verbatims.cc',
      senderAddress,
      'Message indépendant',
      '2026-10-03T11:00:00.000Z',
      `messages/${id}/original.eml`,
    )
  }

  seedManualMerge(id: string, messageIds: string[]) {
    this.sqlite.prepare(`
      INSERT INTO thread_merges (id, mailbox_domain, folder, created_at)
      VALUES (?, 'verbatims.cc', 'Imbox', '2026-10-03T12:00:00.000Z')
    `).run(id)
    const insertMember = this.sqlite.prepare(`
      INSERT INTO thread_merge_members (merge_id, root_message_id) VALUES (?, ?)
    `)
    for (const messageId of messageIds) insertMember.run(id, messageId)
  }

  mergeFolder(id: string) {
    return this.sqlite.prepare('SELECT folder FROM thread_merges WHERE id = ?').get(id) as { folder: string } | undefined
  }

  message(id: string) {
    return this.sqlite.prepare('SELECT folder, is_set_aside FROM messages WHERE id = ?').get(id) as {
      folder: string
      is_set_aside: number
    } | undefined
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
}

function rawEmail(messageId: string, body: string, replyHeaders = '') {
  return [
    'From: Jules Exemple <sender@example.net>',
    'To: courrier-test@verbatims.cc',
    `Message-ID: <${messageId}>`,
    ...(replyHeaders ? [replyHeaders] : []),
    'Subject: Réponse de test',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    '',
  ].join('\r\n')
}

function bindings(db: TestD1): MailStorageBindings {
  return {
    DB: db as unknown as D1Database,
    MAIL_STORE: new MemoryR2() as unknown as R2Bucket,
  }
}

test('une réponse à un fil Set Aside reste dans ce fil malgré une règle Feed', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()

  try {
    const result = await storeIncomingEmail(
      new TextEncoder().encode(rawEmail(
        'reply-to-parked',
        'Réponse liée au fil mis de côté.',
        'In-Reply-To: <parked-original@example.net>',
      )).buffer,
      { from: 'sender@example.net', to: 'courrier-test@verbatims.cc' },
      bindings(db),
    )

    assert.deepEqual({ ...db.message(result.id) }, { folder: 'Imbox', is_set_aside: 1 })
  } finally {
    db.close()
  }
})

test('un message indépendant du même expéditeur suit sa règle Feed', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()

  try {
    const result = await storeIncomingEmail(
      new TextEncoder().encode(rawEmail('independent-message', 'Message sans lien avec le fil.')).buffer,
      { from: 'sender@example.net', to: 'courrier-test@verbatims.cc' },
      bindings(db),
    )

    assert.deepEqual({ ...db.message(result.id) }, { folder: 'The Feed', is_set_aside: 0 })
  } finally {
    db.close()
  }
})

test('si la vérification Set Aside échoue, une réponse avec références reste visible dans Inbox', async () => {
  const db = new TestD1(true)
  db.seedSetAsideMessage()

  try {
    const result = await storeIncomingEmail(
      new TextEncoder().encode(rawEmail(
        'reply-lookup-failure',
        'La réponse reste visible pendant l’indisponibilité de la vérification.',
        'In-Reply-To: <parked-original@example.net>',
      )).buffer,
      { from: 'sender@example.net', to: 'courrier-test@verbatims.cc' },
      bindings(db),
    )

    assert.deepEqual({ ...db.message(result.id) }, { folder: 'Imbox', is_set_aside: 0 })
  } finally {
    db.close()
  }
})

test('une réponse entrante rejoint Reply Later et libérer le fil retire l’état de tous ses messages', async () => {
  const db = new TestD1()
  db.seedReplyLaterMessage()

  try {
    const result = await storeIncomingEmail(
      new TextEncoder().encode(rawEmail(
        'reply-to-reply-later',
        'Réponse entrante synthétique.',
        'In-Reply-To: <reply-later-original@example.net>',
      )).buffer,
      { from: 'sender@example.net', to: 'courrier-test@verbatims.cc' },
      bindings(db),
    )

    assert.deepEqual({ ...db.message(result.id) }, { folder: 'Imbox', is_set_aside: 0 })
    assert.deepEqual(db.replyLaterFlags(), [
      { id: result.id, is_reply_later: 1 },
      { id: 'reply-later-original', is_reply_later: 1 },
    ])

    const cleared = await clearReplyLaterThread(db as unknown as D1Database, result.id)

    assert.equal(cleared, 2)
    assert.deepEqual(db.replyLaterFlags(), [
      { id: result.id, is_reply_later: 0 },
      { id: 'reply-later-original', is_reply_later: 0 },
    ])
  } finally {
    db.close()
  }
})

test('restaurer un fil applique sa règle commune à tous ses expéditeurs entrants', () => {
  assert.equal(
    resolveSetAsideRestoreFolder(
      'Imbox',
      ['a@example.net', 'b@example.net'],
      new Map([
        ['a@example.net', 'The Feed'],
        ['b@example.net', 'The Feed'],
      ]),
    ),
    'The Feed',
  )
})

test('restaurer un fil avec des règles contradictoires le remet dans sa boîte d’origine', () => {
  assert.equal(
    resolveSetAsideRestoreFolder(
      'Imbox',
      ['a@example.net', 'b@example.net'],
      new Map([
        ['a@example.net', 'The Feed'],
        ['b@example.net', 'Paper Trail'],
      ]),
    ),
    'Imbox',
  )
})

test('sans règle commune, les expéditeurs non classés gardent la boîte d’origine du fil', () => {
  assert.equal(
    resolveSetAsideRestoreFolder('Imbox', ['a@example.net'], new Map()),
    'Imbox',
  )
  assert.equal(
    resolveSetAsideRestoreFolder(
      'Imbox',
      ['a@example.net', 'b@example.net'],
      new Map([['a@example.net', 'The Feed']]),
    ),
    'Imbox',
  )
})

test('restaurer via l’API déplace tout le fil vers sa règle commune', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()
  db.seedLinkedSetAsideMessage('parked-reply', '<parked-reply@example.net>', 'sender@example.net', '<parked-original@example.net>')

  try {
    const result = await setAsideHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { isSetAside: false },
    } as never) as { isSetAside: boolean, folder: string, affectedMessages: number }

    assert.deepEqual(result, { isSetAside: false, folder: 'The Feed', affectedMessages: 2 })
    assert.deepEqual({ ...db.message('parked-original') }, { folder: 'The Feed', is_set_aside: 0 })
    assert.deepEqual({ ...db.message('parked-reply') }, { folder: 'The Feed', is_set_aside: 0 })
  } finally {
    db.close()
  }
})

test('restaurer via l’API garde tout le fil dans Inbox si les règles se contredisent', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()
  db.seedLinkedSetAsideMessage('parked-reply', '<parked-reply@example.net>', 'other@example.net', '<parked-original@example.net>')
  db.seedSenderRule('other@example.net', 'Paper Trail')

  try {
    const result = await setAsideHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { isSetAside: false },
    } as never) as { isSetAside: boolean, folder: string, affectedMessages: number }

    assert.deepEqual(result, { isSetAside: false, folder: 'Imbox', affectedMessages: 2 })
    assert.deepEqual({ ...db.message('parked-original') }, { folder: 'Imbox', is_set_aside: 0 })
    assert.deepEqual({ ...db.message('parked-reply') }, { folder: 'Imbox', is_set_aside: 0 })
  } finally {
    db.close()
  }
})

test('reclasser un expéditeur laisse son fil Set Aside dans Inbox mais déplace ses messages indépendants', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()
  db.seedIndependentMessage('independent-from-sender', 'sender@example.net')

  try {
    const result = await senderRuleHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { folder: 'The Feed' },
    } as never) as { folder: string, affectedMessages: number }

    assert.equal(result.folder, 'The Feed')
    assert.equal(result.affectedMessages, 1)
    assert.deepEqual({ ...db.message('parked-original') }, { folder: 'Imbox', is_set_aside: 1 })
    assert.deepEqual({ ...db.message('independent-from-sender') }, { folder: 'The Feed', is_set_aside: 0 })
  } finally {
    db.close()
  }
})

test('reclasser puis restaurer un fil fusionné Set Aside garde le groupe uni et ses métadonnées', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()
  db.seedLinkedSetAsideMessage('parked-second', '<parked-second@example.net>', 'sender@example.net', null)
  db.seedManualMerge('parked-manual-merge', ['<parked-original@example.net>', '<parked-second@example.net>'])

  try {
    const ruleResult = await senderRuleHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { folder: 'Paper Trail' },
    } as never) as { folder: string, affectedMessages: number }

    assert.equal(ruleResult.folder, 'Paper Trail')
    assert.equal(ruleResult.affectedMessages, 0)
    assert.deepEqual({ ...db.message('parked-original') }, { folder: 'Imbox', is_set_aside: 1 })
    assert.deepEqual({ ...db.message('parked-second') }, { folder: 'Imbox', is_set_aside: 1 })
    assert.deepEqual({ ...db.mergeFolder('parked-manual-merge') }, { folder: 'Imbox' })

    const restoreResult = await setAsideHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { isSetAside: false },
    } as never) as { isSetAside: boolean, folder: string, affectedMessages: number }

    assert.deepEqual(restoreResult, { isSetAside: false, folder: 'Paper Trail', affectedMessages: 2 })
    assert.deepEqual({ ...db.message('parked-original') }, { folder: 'Paper Trail', is_set_aside: 0 })
    assert.deepEqual({ ...db.message('parked-second') }, { folder: 'Paper Trail', is_set_aside: 0 })
    assert.deepEqual({ ...db.mergeFolder('parked-manual-merge') }, { folder: 'Paper Trail' })
  } finally {
    db.close()
  }
})

test('annuler une règle après restauration remet le fil Set Aside fusionné dans sa boîte d’origine', async () => {
  const db = new TestD1()
  db.seedSetAsideMessage()
  db.seedLinkedSetAsideMessage('parked-second', '<parked-second@example.net>', 'sender@example.net', null)
  db.seedManualMerge('parked-manual-merge', ['<parked-original@example.net>', '<parked-second@example.net>'])

  try {
    const ruleResult = await senderRuleHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { folder: 'Paper Trail' },
    } as never) as { undoId: string }

    await setAsideHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: 'parked-original' },
      body: { isSetAside: false },
    } as never)

    const undoResult = await senderRuleUndoHandler({
      context: { cloudflare: { env: { DB: db as unknown as D1Database } } },
      params: { id: ruleResult.undoId },
    } as never) as { restoredMessages: number }

    assert.equal(undoResult.restoredMessages, 2)
    assert.deepEqual({ ...db.message('parked-original') }, { folder: 'Imbox', is_set_aside: 0 })
    assert.deepEqual({ ...db.message('parked-second') }, { folder: 'Imbox', is_set_aside: 0 })
    assert.deepEqual({ ...db.mergeFolder('parked-manual-merge') }, { folder: 'Imbox' })
  } finally {
    db.close()
  }
})
