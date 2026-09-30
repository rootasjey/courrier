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

function makeBindings(): MailStorageBindings {
  return {
    DB: { prepare() { throw new Error('DB stub should not be called by these handler tests.') } } as unknown as D1Database,
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
  await handleIncomingEmail(
    makeMessage(async destination => { forwardedTo.push(destination) }),
    makeBindings(),
    async () => { throw new Error('D1 indisponible') },
  )

  assert.deepEqual(forwardedTo, ['hey-test@example.org'])
})

test('si stockage et relais échouent, le handler remonte l’erreur de stockage', async () => {
  const storageError = new Error('R2 indisponible')

  await assert.rejects(
    handleIncomingEmail(
      makeMessage(async () => { throw new Error('relais indisponible') }),
      makeBindings(),
      async () => { throw storageError },
    ),
    error => error === storageError,
  )
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
