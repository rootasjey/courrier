import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

const authStub = new URL('./fixtures/admin-route-auth.mjs', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '../../../../utils/account-auth'
      && context.parentURL?.endsWith('/legacy-forward-deliveries/%5Bid%5D/replay.post.ts')) {
      return { url: authStub, shortCircuit: true }
    }
    if (specifier === '../../utils/account-auth'
      && context.parentURL?.endsWith('/server/api/admin/legacy-forward-deliveries.get.ts')) {
      return { url: authStub, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

Object.assign(globalThis, {
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (event: { params?: Record<string, string> }, key: string) => event.params?.[key],
  setResponseHeader: () => undefined,
  createError: (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options),
})

const listDeliveriesHandler = (await import('../server/api/admin/legacy-forward-deliveries.get.ts')).default
const replayDeliveryHandler = (await import('../server/api/admin/legacy-forward-deliveries/[id]/replay.post.ts')).default
const { createReplayEmailMessage } = await import('../server/utils/replay-email.ts')

const ADMIN = { id: 'admin-user-id' }
const TEST_DESTINATION = 'jeremiecorpinot@codingbox.fr'
const TEST_MESSAGE_ID = 'a'.repeat(64)
const rawEmail = 'From: test.sender@example.net\r\nSubject: Local retry fixture\r\n\r\nTest body.'

test('la reprise structurée conserve le corps et les octets des pièces jointes sans les en-têtes d’origine', async () => {
  const raw = new TextEncoder().encode([
    'Received: from example.net by mx.example.net',
    'DKIM-Signature: v=1; b=invalidated',
    'Authentication-Results: mx.example.net; dkim=pass',
    'From: Original Sender <original@example.net>',
    'Reply-To: old-reply@example.net',
    'Subject: Original subject',
    'Message-ID: <original@example.net>',
    'In-Reply-To: <parent@example.net>',
    'References: <root@example.net> <parent@example.net>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="mail-boundary"',
    '',
    '--mail-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Please see attached.',
    '--mail-boundary',
    'Content-Type: application/octet-stream; name="binary.bin"',
    'Content-Disposition: attachment; filename="binary.bin"',
    'Content-Transfer-Encoding: base64',
    '',
    'AP8Q',
    '--mail-boundary--',
    '',
  ].join('\r\n'))

  const replay = await createReplayEmailMessage(raw, 'original@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION)

  assert.deepEqual({
    from: replay.from,
    to: replay.to,
    replyTo: replay.replyTo,
    subject: replay.subject,
    text: replay.text,
    headers: replay.headers,
  }, {
    from: 'courrier-test@verbatims.cc',
    to: TEST_DESTINATION,
    replyTo: 'original@example.net',
    subject: 'Original subject',
    text: 'Please see attached.',
    headers: {
      'X-Courrier-Original-From': 'original@example.net',
      'In-Reply-To': '<parent@example.net>',
      References: '<root@example.net> <parent@example.net>',
    },
  })
  assert.deepEqual(replay.attachments.map(({ disposition, filename, type, content }) => ({
    disposition,
    filename,
    type,
    content: [...new Uint8Array(content as ArrayBuffer)],
  })), [{
    disposition: 'attachment',
    filename: 'binary.bin',
    type: 'application/octet-stream',
    content: [0, 255, 16],
  }])
})

test('la reprise structurée refuse les adresses Reply-To mal formées et ignore les valeurs d’en-tête dangereuses', async () => {
  const raw = new TextEncoder().encode('From: sender@example.net\r\nSubject: Test\r\nIn-Reply-To: bad\r\n\tvalue\r\n\r\nBody')
  await assert.rejects(createReplayEmailMessage(raw, 'invalid\r\nBcc: victim@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION), /Reply-To/)
  await assert.rejects(createReplayEmailMessage(raw, 'bad..local@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION), /Reply-To/)
  const replay = await createReplayEmailMessage(raw, 'sender@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION)
  assert.equal(replay.headers['In-Reply-To'], undefined)
})

test('la reprise garde les ressources liées au HTML comme pièces jointes inline', async () => {
  const raw = new TextEncoder().encode([
    'From: sender@example.net',
    'Subject: Inline image',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="related-boundary"',
    '',
    '--related-boundary',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Logo <img src="cid:logo@example.net"></p>',
    '--related-boundary',
    'Content-Type: image/png; name="logo.png"',
    'Content-ID: <logo@example.net>',
    'Content-Transfer-Encoding: base64',
    '',
    'AP8Q',
    '--related-boundary--',
    '',
  ].join('\r\n'))

  const replay = await createReplayEmailMessage(raw, 'sender@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION)
  assert.equal(replay.attachments[0]?.disposition, 'inline')
  assert.equal(replay.attachments[0]?.contentId, 'logo@example.net')
})

test('la reprise respecte les limites Cloudflare de taille et de pièces jointes', async () => {
  const tooLarge = new Uint8Array(5 * 1024 * 1024 + 1)
  await assert.rejects(
    createReplayEmailMessage(tooLarge, 'sender@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION),
    /5 MiB replay limit/,
  )

  const attachmentParts = Array.from({ length: 33 }, (_, index) => [
    '--attachments-boundary',
    'Content-Type: application/octet-stream',
    `Content-Disposition: attachment; filename="file-${index}.bin"`,
    'Content-Transfer-Encoding: base64',
    '',
    'AA==',
  ].join('\r\n')).join('\r\n')
  const tooManyAttachments = new TextEncoder().encode([
    'From: sender@example.net',
    'Subject: Too many attachments',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="attachments-boundary"',
    '',
    '--attachments-boundary',
    'Content-Type: text/plain',
    '',
    'See the attached files.',
    attachmentParts,
    '--attachments-boundary--',
    '',
  ].join('\r\n'))
  await assert.rejects(
    createReplayEmailMessage(tooManyAttachments, 'sender@example.net', 'courrier-test@verbatims.cc', TEST_DESTINATION),
    /32-attachment limit/,
  )
})

class TestD1 {
  readonly sqlite = new DatabaseSync(':memory:')
  private preflightReads = 0
  private releasePreflights!: () => void
  private preflightBarrier = new Promise<void>((resolve) => { this.releasePreflights = resolve })
  private barrierEnabled = false

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        raw_object_key TEXT NOT NULL,
        envelope_to TEXT NOT NULL,
        mailbox_domain TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        sender_address TEXT NOT NULL DEFAULT '',
        received_at TEXT NOT NULL
      );
      CREATE TABLE legacy_forward_deliveries (
        message_id TEXT PRIMARY KEY,
        destination TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        claimed_at TEXT,
        claim_token TEXT,
        forwarded_at TEXT,
        last_error TEXT,
        delivery_method TEXT NOT NULL DEFAULT 'email_forward',
        created_at TEXT NOT NULL
      );
      CREATE TABLE platform_audit_log (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        workspace_id TEXT,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
  }

  prepare(sql: string) {
    let values: unknown[] = []
    const owner = this
    return {
      bind(...nextValues: unknown[]) {
        values = nextValues
        return this
      },
      async first<T>() {
        const result = owner.sqlite.prepare(sql).get(...values as never[]) as T | undefined ?? null
        if (owner.barrierEnabled && sql.includes('SELECT d.message_id AS id')) {
          owner.preflightReads += 1
          if (owner.preflightReads === 2) owner.releasePreflights()
          await owner.preflightBarrier
        }
        return result
      },
      async all<T>() {
        const result = owner.sqlite.prepare(sql).all(...values as never[]) as T[]
        return { results: result }
      },
      async run() {
        const result = owner.sqlite.prepare(sql).run(...values as never[])
        return { success: true, meta: { changes: Number(result.changes) } }
      },
    }
  }

  addDelivery(options: {
    id?: string
    status?: 'processing' | 'failed' | 'forwarded'
    destination?: string
    envelopeTo?: string
    mailboxDomain?: string
    claimedAt?: string | null
    attemptCount?: number
  } = {}) {
    const id = options.id ?? TEST_MESSAGE_ID
    const status = options.status ?? 'processing'
    const claimedAt = options.claimedAt ?? (status === 'processing'
      ? new Date(Date.now() - 11 * 60_000).toISOString()
      : null)
    const now = new Date().toISOString()
    this.sqlite.prepare(`
      INSERT INTO messages (id, raw_object_key, envelope_to, mailbox_domain, subject, sender_address, received_at)
      VALUES (?, ?, ?, ?, 'Local retry fixture', 'test.sender@example.net', ?)
    `).run(id, `messages/${id}/original.eml`, options.envelopeTo ?? 'courrier-test@verbatims.cc', options.mailboxDomain ?? 'verbatims.cc', now)
    this.sqlite.prepare(`
      INSERT INTO legacy_forward_deliveries
        (message_id, destination, status, attempt_count, claimed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, options.destination ?? TEST_DESTINATION, status, options.attemptCount ?? 1, claimedAt, now)
    return id
  }

  enablePreflightBarrier() {
    this.barrierEnabled = true
  }

  row(id = TEST_MESSAGE_ID) {
    return this.sqlite.prepare('SELECT * FROM legacy_forward_deliveries WHERE message_id = ?').get(id) as Record<string, unknown>
  }

  auditActions(id = TEST_MESSAGE_ID) {
    return (this.sqlite.prepare('SELECT action FROM platform_audit_log WHERE target_id = ?').all(id) as { action: string }[]).map(row => row.action).sort()
  }

  close() {
    this.sqlite.close()
  }
}

function bindings(db: TestD1, options: {
  destination?: string
  send?: (message: TestEmailMessage) => Promise<void>
  messageExists?: boolean
  storageError?: Error
} = {}) {
  const sent: TestEmailMessage[] = []
  return {
    sent,
    env: {
      DB: db,
      COURRIER_LEGACY_FORWARD_TO: options.destination ?? TEST_DESTINATION,
      MAIL_STORE: {
        async get() {
          if (options.storageError) throw options.storageError
          if (options.messageExists === false) return null
          return {
            async arrayBuffer() {
              return new TextEncoder().encode(rawEmail).buffer
            },
          }
        },
      },
      EMAIL: {
        async send(message: TestEmailMessage) {
          sent.push(message)
          await options.send?.(message)
        },
      },
    },
  }
}

type TestEmailMessage = {
  from: string
  to: string
  replyTo: string
  subject: string
  headers: Record<string, string>
  text?: string
  html?: string
  attachments: {
    disposition: 'attachment' | 'inline'
    contentId?: string
    filename: string
    type: string
    content: string | ArrayBuffer | ArrayBufferView
  }[]
}

function eventFor(db: TestD1, env: ReturnType<typeof bindings>['env'], id = TEST_MESSAGE_ID) {
  return {
    params: { id },
    requestUrl: new URL('https://courrier.day/api/admin/legacy-forward-deliveries/test/replay'),
    context: { cloudflare: { env }, platformAdmin: ADMIN },
  }
}

test('la liste expose seulement les échecs et traitements périmés de la boîte test et journalise la lecture', async () => {
  const db = new TestD1()
  const env = bindings(db).env
  const staleId = db.addDelivery()
  db.addDelivery({ id: '00000000-0000-4000-8000-000000000002', status: 'failed' })
  db.addDelivery({ id: '00000000-0000-4000-8000-000000000003', claimedAt: new Date().toISOString() })
  db.addDelivery({ id: '00000000-0000-4000-8000-000000000004', destination: 'other@example.net' })
  db.addDelivery({ id: '00000000-0000-4000-8000-000000000005', envelopeTo: 'other@verbatims.cc' })

  try {
    const result = await listDeliveriesHandler({ context: { cloudflare: { env }, platformAdmin: ADMIN } } as never) as { deliveries: { id: string }[] }
    assert.deepEqual(result.deliveries.map(delivery => delivery.id), [staleId, '00000000-0000-4000-8000-000000000002'])
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM platform_audit_log WHERE action = 'platform_admin.resource_read'").get()?.count, 1)
  } finally {
    db.close()
  }
})

test('la reprise renvoie la copie MIME vers la destination configurée et journalise les deux étapes', async () => {
  const db = new TestD1()
  db.addDelivery()
  const { env, sent } = bindings(db)

  try {
    const result = await replayDeliveryHandler(eventFor(db, env) as never) as { accepted: boolean, attemptCount: number }
    const row = db.row()
    assert.deepEqual(result, { accepted: true, attemptCount: 2 })
    assert.deepEqual(sent, [{
      from: 'courrier-test@verbatims.cc',
      to: TEST_DESTINATION,
      replyTo: 'test.sender@example.net',
      subject: 'Local retry fixture',
      headers: { 'X-Courrier-Original-From': 'test.sender@example.net' },
      text: 'Test body.\n',
      attachments: [],
    }])
    assert.equal(row.status, 'forwarded')
    assert.equal(row.delivery_method, 'email_replay')
    assert.equal(row.attempt_count, 2)
    assert.equal(row.claim_token, null)
    assert.deepEqual(db.auditActions(), [
      'platform_admin.legacy_forward_replay_accepted',
      'platform_admin.legacy_forward_replay_requested',
    ])
  } finally {
    db.close()
  }
})

test('un transfert actif, une autre destination ou une autre boîte ne peuvent pas être rejoués', async () => {
  const db = new TestD1()
  db.addDelivery({ claimedAt: new Date().toISOString() })
  db.addDelivery({ id: 'b'.repeat(64), envelopeTo: 'other@verbatims.cc' })
  db.addDelivery({ id: 'c'.repeat(64), destination: 'other@example.net' })
  const { env, sent } = bindings(db)

  try {
    for (const id of [TEST_MESSAGE_ID, 'b'.repeat(64), 'c'.repeat(64)]) {
      await assert.rejects(replayDeliveryHandler(eventFor(db, env, id) as never), { statusCode: 409 })
    }
    await assert.rejects(replayDeliveryHandler(eventFor(db, env, '00000000-0000-4000-8000-000000000001') as never), { statusCode: 400 })
    assert.equal(sent.length, 0)
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM platform_audit_log').get()?.count, 0)
  } finally {
    db.close()
  }
})

test('un échec d’envoi conserve le statut failed et trace l’issue sans retry automatique', async () => {
  const db = new TestD1()
  db.addDelivery({ status: 'failed' })
  const { env, sent } = bindings(db, { send: async () => { throw new Error('synthetic send failure') } })

  try {
    await assert.rejects(replayDeliveryHandler(eventFor(db, env) as never), { statusCode: 502 })
    const row = db.row()
    assert.equal(sent.length, 1)
    assert.equal(row.status, 'failed')
    assert.equal(row.last_error, 'synthetic send failure')
    assert.equal(row.attempt_count, 2)
    assert.deepEqual(db.auditActions(), [
      'platform_admin.legacy_forward_replay_failed',
      'platform_admin.legacy_forward_replay_requested',
    ])
  } finally {
    db.close()
  }
})

test('deux reprises concurrentes du même transfert ne déclenchent qu’un seul envoi', async () => {
  const db = new TestD1()
  db.addDelivery()
  db.enablePreflightBarrier()
  let releaseSend!: () => void
  let sendStarted!: () => void
  const sendStartedPromise = new Promise<void>((resolve) => { sendStarted = resolve })
  const sendGate = new Promise<void>((resolve) => { releaseSend = resolve })
  const { env, sent } = bindings(db, { send: async () => { sendStarted(); await sendGate } })

  try {
    const first = replayDeliveryHandler(eventFor(db, env) as never)
    const second = replayDeliveryHandler(eventFor(db, env) as never)
    const outcomesPromise = Promise.allSettled([first, second])
    await sendStartedPromise
    releaseSend()
    const outcomes = await outcomesPromise
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1)
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && (outcome.reason as { statusCode?: number }).statusCode === 409).length, 1)
    assert.equal(sent.length, 1)
    assert.equal(db.row().attempt_count, 2)
  } finally {
    releaseSend()
    db.close()
  }
})

test('l’absence de la copie R2 est auditée et rend le transfert reprenable après correction', async () => {
  const db = new TestD1()
  db.addDelivery()
  const { env, sent } = bindings(db, { messageExists: false })

  try {
    await assert.rejects(replayDeliveryHandler(eventFor(db, env) as never), { statusCode: 410 })
    assert.equal(db.row().status, 'failed')
    assert.equal(db.row().last_error, 'La copie MIME originale est absente du stockage R2.')
    assert.equal(sent.length, 0)
    assert.deepEqual(db.auditActions(), [
      'platform_admin.legacy_forward_replay_failed',
      'platform_admin.legacy_forward_replay_requested',
    ])
  } finally {
    db.close()
  }
})

test('une erreur transitoire de lecture R2 est auditée et libère la reprise', async () => {
  const db = new TestD1()
  db.addDelivery()
  const { env, sent } = bindings(db, { storageError: new Error('R2 temporairement indisponible') })

  try {
    await assert.rejects(replayDeliveryHandler(eventFor(db, env) as never), { statusCode: 502 })
    assert.equal(db.row().status, 'failed')
    assert.match(db.row().last_error as string, /Échec de lecture R2/)
    assert.equal(db.row().claim_token, null)
    assert.equal(sent.length, 0)
    assert.deepEqual(db.auditActions(), [
      'platform_admin.legacy_forward_replay_failed',
      'platform_admin.legacy_forward_replay_requested',
    ])
  } finally {
    db.close()
  }
})
