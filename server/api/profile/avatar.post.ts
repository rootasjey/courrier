import type { MailStorageBindings } from '../../../utils/mail-store'
import { assertSameOrigin, requireAccountUser } from '../../utils/account-auth'
import { accountAvatarObjectKey } from '../../utils/account-profile'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

function imageType(data: Uint8Array): string | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = await requireAccountUser(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'MAIL_STORE'> | undefined
  if (!bindings?.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage du profil est indisponible.' })

  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (contentLength > MAX_AVATAR_BYTES + 64 * 1024) throw createError({ statusCode: 413, statusMessage: 'La photo ne peut pas dépasser 5 Mio.' })
  const file = (await readMultipartFormData(event))?.find(part => part.name === 'file' && part.filename)
  if (!file?.data?.byteLength) throw createError({ statusCode: 400, statusMessage: 'Choisis une photo non vide.' })
  if (file.data.byteLength > MAX_AVATAR_BYTES) throw createError({ statusCode: 413, statusMessage: 'La photo ne peut pas dépasser 5 Mio.' })

  const mimeType = imageType(file.data)
  if (!mimeType) throw createError({ statusCode: 400, statusMessage: 'Utilise une image JPEG, PNG ou WebP.' })

  await bindings.MAIL_STORE.put(accountAvatarObjectKey(user.id), file.data, {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' },
    customMetadata: { purpose: 'courrier-profile-avatar', userId: user.id },
  })
  return { saved: true, mimeType, sizeBytes: file.data.byteLength }
})
