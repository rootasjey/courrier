import {
  isBlockedSender,
  parseIncomingEmail,
  storeIncomingEmail,
  type MailStorageBindings,
  type ParsedEmail,
} from './mail-store.ts'

type IncomingEmail = {
  from: string
  to: string
  raw: ReadableStream<Uint8Array>
  forward: (destination: string) => Promise<unknown>
  setReject?: (reason: string) => void
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

function hasDatabaseBinding(value: unknown): value is Pick<MailStorageBindings, 'DB'> {
  return typeof value === 'object'
    && value !== null
    && 'DB' in value
    && typeof value.DB === 'object'
    && value.DB !== null
    && 'prepare' in value.DB
    && typeof value.DB.prepare === 'function'
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
  let rawEmail: ArrayBuffer | undefined
  let parsedEmail: ParsedEmail | undefined

  // Check the exact visible From address before storing or forwarding anything.
  // Cloudflare's envelope sender can differ from the address shown in the UI.
  if (message.setReject && hasDatabaseBinding(env)) {
    rawEmail = await new Response(message.raw).arrayBuffer()
    try {
      parsedEmail = await parseIncomingEmail(rawEmail)
    } catch {
      // Let the normal storage/fallback path handle malformed MIME below.
    }

    if (parsedEmail && await isBlockedSender(parsedEmail, { from: message.from, to: message.to }, env)) {
      message.setReject('This sender is blocked by the mailbox owner.')
      console.info('[courrier] Rejected a message from a blocked sender.')
      return
    }
  }

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
    rawEmail ??= await new Response(message.raw).arrayBuffer()
    result = await store(rawEmail, { from: message.from, to: message.to }, env, parsedEmail)
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
