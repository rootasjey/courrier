import type { MailStorageBindings } from '../../../utils/mail-store'
import { assertSameOrigin, getAccountDb, requireAccountUser } from '../../utils/account-auth'
import { accountAvatarObjectKey } from '../../utils/account-profile'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = await requireAccountUser(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage du profil est indisponible.' })
  await bindings.MAIL_STORE.delete(accountAvatarObjectKey(user.id))
  const result = await getAccountDb(event).prepare(`
    UPDATE users
    SET avatar_mode = CASE WHEN avatar_config IS NOT NULL THEN 'tronche' ELSE 'default' END,
        updated_at = ?
    WHERE id = ? AND status = 'active'
    RETURNING avatar_mode
  `).bind(new Date().toISOString(), user.id).first<{ avatar_mode: 'default' | 'tronche' }>()
  return { deleted: true, avatarMode: result?.avatar_mode ?? 'default' }
})
