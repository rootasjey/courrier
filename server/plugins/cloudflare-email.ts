import { storeIncomingEmail, type MailStorageBindings } from '../utils/mail-store'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:email', async ({ message, env }) => {
    try {
      const rawEmail = await new Response(message.raw).arrayBuffer()
      await storeIncomingEmail(rawEmail, {
        from: message.from,
        to: message.to,
      }, env as MailStorageBindings)
    } catch (error) {
      console.error('[courrier] Could not store an incoming email', error)
      throw error
    }
  })
})
