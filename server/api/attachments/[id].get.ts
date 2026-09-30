import type { MailStorageBindings } from '../../utils/mail-store'

type AttachmentRow = {
  object_key: string
  filename: string
  mime_type: string
}

function safeDownloadFilename(filename: string) {
  const safeName = Array.from(
    (filename || 'piece-jointe').replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim(),
  ).slice(0, 180).join('') || 'piece-jointe'
  const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, '_').replace(/[";]/g, '_')
  const encodedName = encodeURIComponent(safeName).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des pièces jointes n’est pas prêt.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de pièce jointe manquant.' })
  }

  const attachment = await bindings.DB.prepare(`
    SELECT object_key, filename, mime_type
    FROM attachments
    WHERE id = ?
  `).bind(id).first<AttachmentRow>()

  if (!attachment) {
    throw createError({ statusCode: 404, statusMessage: 'Pièce jointe introuvable.' })
  }

  const object = await bindings.MAIL_STORE.get(attachment.object_key)
  if (!object) {
    throw createError({ statusCode: 404, statusMessage: 'Fichier conservé introuvable.' })
  }

  const contentType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/i.test(attachment.mime_type)
    ? attachment.mime_type
    : 'application/octet-stream'

  return new Response(object.body, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': safeDownloadFilename(attachment.filename),
      'Content-Length': String(object.size),
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
