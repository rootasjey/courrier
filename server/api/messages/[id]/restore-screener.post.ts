import type { MailStorageBindings } from '../../../utils/mail-store'

type ScreenerBindings = Pick<MailStorageBindings, 'DB'>

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as ScreenerBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const message = await bindings.DB.prepare(`
    SELECT mailbox_domain, lower(trim(sender_address)) AS sender_address
    FROM messages WHERE id = ? AND folder = 'Screener'
  `).bind(messageId).first<{ mailbox_domain: string, sender_address: string }>()

  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message Screener introuvable.' })

  await bindings.DB.prepare(`
    UPDATE messages SET screener_state = 'pending'
    WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ?
      AND folder = 'Screener' AND screener_state = 'cleared'
  `).bind(message.mailbox_domain, message.sender_address).run()

  return { restored: true }
})
