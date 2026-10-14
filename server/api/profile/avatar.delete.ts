import type { MailStorageBindings } from '../../../utils/mail-store'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage du profil est indisponible.' })
  await bindings.MAIL_STORE.delete('courrier/profile/avatar')
  return { deleted: true }
})
