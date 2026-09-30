import { storeIncomingEmail, type MailStorageBindings } from './mail-store.ts'

type IncomingEmail = {
  from: string
  to: string
  raw: ReadableStream<Uint8Array>
  forward: (destination: string) => Promise<unknown>
}

type StoredEmail = Awaited<ReturnType<typeof storeIncomingEmail>>
type StoreEmail = typeof storeIncomingEmail

function hasMailStorageBindings(value: unknown): value is MailStorageBindings {
  if (typeof value !== 'object' || value === null || !('DB' in value) || !('MAIL_STORE' in value)) {
    return false
  }

  return typeof value.DB === 'object'
    && value.DB !== null
    && 'prepare' in value.DB
    && typeof value.DB.prepare === 'function'
    && typeof value.MAIL_STORE === 'object'
    && value.MAIL_STORE !== null
    && 'put' in value.MAIL_STORE
    && typeof value.MAIL_STORE.put === 'function'
}

function legacyDestination(env: MailStorageBindings) {
  return typeof env.COURRIER_LEGACY_FORWARD_TO === 'string'
    ? env.COURRIER_LEGACY_FORWARD_TO.trim()
    : ''
}

export async function handleIncomingEmail(
  message: IncomingEmail,
  env: MailStorageBindings,
  store: StoreEmail = storeIncomingEmail,
): Promise<void> {
  const destination = legacyDestination(env)

  if (!hasMailStorageBindings(env)) {
    const error = new Error('Cloudflare D1/R2 mail storage bindings are unavailable.')

    if (destination) {
      try {
        await message.forward(destination)
        console.error('[courrier] Mail storage bindings are unavailable; delivered to the legacy destination.')
        return
      } catch (forwardError) {
        console.error('[courrier] Mail storage bindings and legacy forwarding both failed.', forwardError)
      }
    }

    throw error
  }

  let result: StoredEmail
  try {
    const rawEmail = await new Response(message.raw).arrayBuffer()
    result = await store(rawEmail, { from: message.from, to: message.to }, env)
  } catch (storageError) {
    if (destination) {
      try {
        await message.forward(destination)
        console.error('[courrier] Email storage failed; delivered to the legacy destination.', storageError)
        return
      } catch (forwardError) {
        console.error('[courrier] Email storage and legacy forwarding both failed.', {
          storageError,
          forwardError,
        })
      }
    }

    throw storageError
  }

  if (result.duplicate) {
    console.info('[courrier] Duplicate email already stored; skipping legacy forwarding.', result.id)
    return
  }

  if (destination) {
    try {
      await message.forward(destination)
    } catch (forwardError) {
      // Courrier already has a durable copy, so keep that successful receipt.
      console.error('[courrier] Email is stored in Courrier, but legacy forwarding failed.', forwardError)
    }
  }
}
