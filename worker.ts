import nitroWorker from './.output/server/index.mjs'
import { storeIncomingEmail, type MailStorageBindings } from './server/utils/mail-store'

type CourrierWorkerEnv = Env & MailStorageBindings

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

function legacyDestination(env: CourrierWorkerEnv) {
  return typeof env.COURRIER_LEGACY_FORWARD_TO === 'string'
    ? env.COURRIER_LEGACY_FORWARD_TO.trim()
    : ''
}

export default {
  ...nitroWorker,

  async email(message, env): Promise<void> {
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

    try {
      const rawEmail = await new Response(message.raw).arrayBuffer()
      await storeIncomingEmail(rawEmail, {
        from: message.from,
        to: message.to,
      }, env)
    } catch (error) {
      if (destination) {
        try {
          await message.forward(destination)
          console.error('[courrier] Email storage failed; delivered to the legacy destination.', error)
          return
        } catch (forwardError) {
          console.error('[courrier] Email storage and legacy forwarding both failed.', {
            storageError: error,
            forwardError,
          })
        }
      }

      throw error
    }

    if (destination) {
      try {
        await message.forward(destination)
      } catch (error) {
        // Courrier already has a durable copy, so keep that successful receipt.
        console.error('[courrier] Email is stored in Courrier, but legacy forwarding failed.', error)
      }
    }
  },
} satisfies ExportedHandler<CourrierWorkerEnv>
