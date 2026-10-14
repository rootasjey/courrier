import type { MailStorageBindings } from '../../../utils/mail-store'

const AVATAR_KEY = 'courrier/profile/avatar'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage du profil est indisponible.' })
  const avatar = await bindings.MAIL_STORE.get(AVATAR_KEY)
  if (!avatar) throw createError({ statusCode: 404, statusMessage: 'Aucune photo de profil enregistrée.' })

  setResponseHeader(event, 'Content-Type', avatar.httpMetadata?.contentType || 'application/octet-stream')
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  return avatar.body
})
