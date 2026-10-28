import {
  IncomingMailboxUnconfiguredError,
  isBlockedSender,
  incomingSenderAddress,
  markLegacyForwardDelivery,
  parseIncomingEmail,
  storeIncomingEmail,
  type MailStorageBindings,
  type ParsedEmail,
} from './mail-store.ts'
import { normalizeInboundEmailAddress, recordInboundEmailEvent, type InboundEmailEventReason, type InboundEmailEventType } from './inbound-email-events.ts'

type IncomingEmail = {
  from: string
  to: string
  raw: ReadableStream<Uint8Array>
  forward: (destination: string) => Promise<unknown>
  setReject?: (reason: string) => void
  canBeForwarded?: boolean
  headers?: Headers
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

function rejectionReason(error: unknown): InboundEmailEventReason {
  if (error instanceof IncomingMailboxUnconfiguredError) {
    return 'mailbox_unconfigured'
  }
  return 'processing_failed'
}

async function recordInboundEvent(
  env: unknown,
  message: IncomingEmail,
  eventType: InboundEmailEventType,
  reasonCode: InboundEmailEventReason,
  parsedEmail?: ParsedEmail,
) {
  const senderAddress = parsedEmail
    ? incomingSenderAddress(parsedEmail, { from: message.from, to: message.to })
    : message.from
  const event = {
    eventType,
    reasonCode,
    senderAddress: normalizeInboundEmailAddress(senderAddress),
    recipientAddress: normalizeInboundEmailAddress(message.to),
  }

  try {
    if (!hasDatabaseBinding(env)) throw new Error('D1 binding unavailable.')
    await recordInboundEmailEvent(env.DB, event)
  } catch (error) {
    console.error('[courrier] Could not persist inbound email event.', {
      ...event,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
  }
}

export async function handleIncomingEmail(
  message: IncomingEmail,
  env: MailStorageBindings,
  store: StoreEmail = storeIncomingEmail,
): Promise<void> {
  const destination = legacyDestination(env)
  let rawEmail: ArrayBuffer | undefined
  let parsedEmail: ParsedEmail | undefined

  console.info('[courrier] Incoming email event received.', { canBeForwarded: message.canBeForwarded })

  // Check the exact visible From address before storing or forwarding anything.
  // Cloudflare's envelope sender can differ from the address shown in the UI.
  if (message.setReject && hasDatabaseBinding(env)) {
    rawEmail = await new Response(message.raw).arrayBuffer()
    try {
      parsedEmail = await parseIncomingEmail(rawEmail)
    } catch {
      // Let the normal storage/fallback path handle malformed MIME below.
    }

    let senderIsBlocked = false
    try {
      senderIsBlocked = Boolean(parsedEmail && await isBlockedSender(parsedEmail, { from: message.from, to: message.to }, env))
    } catch (error) {
      await recordInboundEvent(env, message, 'failed', 'processing_failed', parsedEmail)
      throw error
    }

    if (senderIsBlocked && parsedEmail) {
      await recordInboundEvent(env, message, 'rejected', 'sender_blocked', parsedEmail)
      message.setReject('This sender is blocked by the mailbox owner.')
      console.info('[courrier] Inbound email rejected.', { reasonCode: 'sender_blocked' })
      return
    }
  }

  if (!hasMailStorageBindings(env)) {
    const error = new Error('Cloudflare D1/R2 mail storage bindings are unavailable.')

    if (destination) {
      try {
        await message.forward(destination)
        await recordInboundEvent(env, message, 'degraded', 'mail_storage_unavailable', parsedEmail)
        console.error('[courrier] Mail storage bindings are unavailable; delivered to the legacy destination.')
        return
      } catch (forwardError) {
        console.error('[courrier] Mail storage bindings and legacy forwarding both failed.', forwardError)
      }
    }

    await recordInboundEvent(env, message, 'failed', 'mail_storage_unavailable', parsedEmail)

    throw error
  }

  let result: StoredEmail
  try {
    rawEmail ??= await new Response(message.raw).arrayBuffer()
    result = await store(
      rawEmail,
      { from: message.from, to: message.to },
      env,
      parsedEmail,
      destination || undefined,
    )
  } catch (storageError) {
    const reasonCode = rejectionReason(storageError)
    if (destination) {
      try {
        await message.forward(destination)
        await recordInboundEvent(env, message, 'degraded', reasonCode, parsedEmail)
        console.error('[courrier] Email storage failed; delivered to the legacy destination.', storageError)
        return
      } catch (forwardError) {
        await recordInboundEvent(env, message, 'failed', reasonCode, parsedEmail)
        console.error('[courrier] Email storage and legacy forwarding both failed.', {
          storageError,
          forwardError,
        })
        throw storageError
      }
    }

    await recordInboundEvent(env, message, 'failed', reasonCode, parsedEmail)

    throw storageError
  }

  console.info('[courrier] Incoming email stored.', {
    id: result.id,
    duplicate: result.duplicate,
    forwardingAttempt: result.forwardingAttempt,
    hasForwardingClaim: Boolean(result.forwardingClaimToken),
  })

  const forwardingClaimToken = result.forwardingClaimToken
  const shouldForward = result.forwardingAttempt
    ? result.forwardingAttempt === 'claimed'
    : !result.duplicate

  if (!shouldForward) {
    if (result.duplicate) {
      console.info('[courrier] Duplicate email already stored; forwarding is complete or already in progress.', result.id)
    } else {
      console.error('[courrier] Stored email has no forwarding claim; legacy forwarding was skipped.', result.id)
    }
    return
  }

  if (destination) {
    if (message.canBeForwarded === false) {
      if (forwardingClaimToken) {
        await markLegacyForwardDelivery(
          env.DB,
          result.id,
          forwardingClaimToken,
          'failed',
          'Cloudflare marked this email as not forwardable.',
        )
      }
      console.error('[courrier] Cloudflare marked the stored email as not forwardable.', result.id)
      return
    }

    console.info('[courrier] Starting legacy forwarding.', result.id)
    try {
      await message.forward(destination)
    } catch (forwardError) {
      if (forwardingClaimToken) {
        try {
          await markLegacyForwardDelivery(
            env.DB,
            result.id,
            forwardingClaimToken,
            'failed',
            forwardError instanceof Error ? forwardError.message : String(forwardError),
          )
        } catch (statusError) {
          console.error('[courrier] Could not record the failed legacy forwarding attempt.', { id: result.id, statusError })
        }
      }
      // Courrier already has a durable copy, so keep that successful receipt.
      console.error('[courrier] Email is stored in Courrier, but legacy forwarding failed.', forwardError)
      return
    }

    if (forwardingClaimToken) {
      try {
        const marked = await markLegacyForwardDelivery(env.DB, result.id, forwardingClaimToken, 'forwarded')
        if (!marked) {
          console.error('[courrier] Email was forwarded, but its delivery status could not be marked complete.', result.id)
          return
        }
      } catch (statusError) {
        // Cloudflare accepted the forward, so do not mark it failed and trigger
        // an immediate duplicate on the next delivery.
        console.error('[courrier] Email was forwarded, but its delivery status could not be recorded.', { id: result.id, statusError })
      }
    }
    console.info('[courrier] Legacy forwarding accepted by Cloudflare.', result.id)
  }
}
