import { storeIncomingEmail, type MailStorageBindings } from '../../utils/mail-store'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Les bindings D1 et R2 ne sont pas disponibles.' })
  }

  const rawBody = await readRawBody(event, false)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Le message RFC 822 est vide.' })
  }

  const rawEmail = await new Response(rawBody).arrayBuffer()
  const result = await storeIncomingEmail(rawEmail, {
    from: 'demo@courrier.example',
    to: 'test@verbatims.cc',
  }, bindings)

  return { ...result, recipient: 'test@verbatims.cc' }
})
