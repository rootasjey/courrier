import type { MailStorageBindings } from '../../../utils/mail-store'
import { assertSameOrigin, requireAccountUser } from '../../utils/account-auth'
import { accountAvatarObjectKey } from '../../utils/account-profile'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = await requireAccountUser(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage du profil est indisponible.' })
  await bindings.MAIL_STORE.delete(accountAvatarObjectKey(user.id))
  return { deleted: true }
})
