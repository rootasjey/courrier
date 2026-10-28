import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleIncomingEmail } from '../server/utils/email-handler.ts'
import type { MailStorageBindings } from '../server/utils/mail-store.ts'

const rawMessage = [
  'From: sender@example.net',
  'To: courrier-test@verbatims.cc',
  'Message-ID: <same-message@example.net>',
  'Subject: Test de rejeu',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Message MIME de test.',
  '',
].join('\r\n')

function makeBindings(events: unknown[][] = [], blocked = false): MailStorageBindings {
  return {
    DB: {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                return query.includes('FROM blocked_senders') && blocked ? { blocked: 1 } : null
              },
              async run() {
                if (query.includes('INSERT INTO inbound_email_events')) events.push(values)
                return { success: true, meta: { changes: 1 } }
              },
            }
          },
        }
      },
    } as unknown as D1Database,
    MAIL_STORE: { put() { throw new Error('R2 stub should not be called by these handler tests.') } } as unknown as R2Bucket,
    COURRIER_LEGACY_FORWARD_TO: 'hey-test@example.org',
  }
}

function makeMessage(forward: (destination: string) => Promise<unknown>) {
  return {
    from: 'sender@example.net',
    to: 'courrier-test@verbatims.cc',
    raw: new Response(rawMessage).body!,
    forward,
  }
}

test('un blocage volontaire est journalisé sans stocker le contenu du message', async () => {
  const events: unknown[][] = []
  let rejectReason = ''
  const message = {
    ...makeMessage(async () => undefined),
    headers: new Headers({ 'message-id': '<same-message@example.net>' }),
    setReject(reason: string) { rejectReason = reason },
  }

  await handleIncomingEmail(message, makeBindings(events, true))

  assert.equal(rejectReason, 'This sender is blocked by the mailbox owner.')
  assert.equal(events.length, 1)
  assert.equal(events[0]?.[1], 'rejected')
  assert.equal(events[0]?.[2], 'sender_blocked')
  assert.equal(events[0]?.[3], 'sender@example.net')
  assert.equal(events[0]?.[4], 'courrier-test@verbatims.cc')
  assert.equal(events[0]?.length, 6)
})

test('rejouer le même MIME stocké ne relaie pas une seconde fois', async () => {
  const storedMessageIds = new Set<string>()
  const forwardedTo: string[] = []
  let storeCalls = 0
  const store = async (raw: ArrayBuffer) => {
    storeCalls += 1
    const mime = new TextDecoder().decode(raw)
    const messageId = mime.match(/^Message-ID: (.+)$/m)?.[1] ?? 'missing-id'
    const duplicate = storedMessageIds.has(messageId)
    storedMessageIds.add(messageId)
    return { id: messageId, duplicate }
  }

  for (let replay = 0; replay < 2; replay += 1) {
    await handleIncomingEmail(makeMessage(async destination => {
      forwardedTo.push(destination)
    }), makeBindings(), store)
  }

  assert.equal(storeCalls, 2)
  assert.deepEqual(forwardedTo, ['hey-test@example.org'])
})

test('si le stockage échoue mais le relais réussit, la réception aboutit', async () => {
  const forwardedTo: string[] = []
  const events: unknown[][] = []
  await handleIncomingEmail(
    makeMessage(async destination => { forwardedTo.push(destination) }),
    makeBindings(events),
    async () => { throw new Error('D1 indisponible') },
  )

  assert.deepEqual(forwardedTo, ['hey-test@example.org'])
  assert.equal(events.length, 1)
  assert.equal(events[0]?.[1], 'degraded')
  assert.equal(events[0]?.[2], 'processing_failed')
})

test('si stockage et relais échouent, le handler remonte l’erreur de stockage', async () => {
  const storageError = new Error('R2 indisponible')
  const events: unknown[][] = []

  await assert.rejects(
    handleIncomingEmail(
      makeMessage(async () => { throw new Error('relais indisponible') }),
      makeBindings(events),
      async () => { throw storageError },
    ),
    error => error === storageError,
  )
  assert.equal(events.length, 1)
  assert.equal(events[0]?.[1], 'failed')
  assert.equal(events[0]?.[2], 'processing_failed')
})

test('si stockage réussit mais que le relais échoue, la réception reste acquise', async () => {
  let stored = false

  await handleIncomingEmail(
    makeMessage(async () => { throw new Error('relais indisponible') }),
    makeBindings(),
    async () => {
      stored = true
      return { id: 'stored-message', duplicate: false }
    },
  )

  assert.equal(stored, true)
})
