import type { MailStorageBindings } from '../../utils/mail-store'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const result = await bindings.DB.prepare(`
    UPDATE messages
    SET screener_state = 'cleared'
    WHERE folder = 'Screener' AND screener_state = 'pending' AND trashed_at IS NULL
  `).run()

  return { clearedMessages: result.meta.changes }
})
