import type { MailStorageBindings } from '../../../utils/mail-store'

const MAX_DRAFT_ATTACHMENT_BYTES = 3_400_000
const MAX_DRAFT_ATTACHMENTS = 32
const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function safeFilename(value: string) {
  return value.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim().slice(0, 180) || 'piece-jointe'
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage des pièces jointes est indisponible.' })
  const draftId = getRouterParam(event, 'id')
  if (!draftId) throw createError({ statusCode: 400, statusMessage: 'Brouillon manquant.' })

  const draft = await bindings.DB.prepare('SELECT status FROM outgoing_drafts WHERE id = ?').bind(draftId).first<{ status: string }>()
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'Brouillon introuvable.' })
  if (draft.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est en cours d’envoi.' })

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  const disposition = parts?.find(part => part.name === 'disposition')?.data.toString() === 'inline' ? 'inline' : 'attachment'
  if (!file?.data?.byteLength) throw createError({ statusCode: 400, statusMessage: 'Choisis un fichier non vide.' })
  if (file.data.byteLength > MAX_DRAFT_ATTACHMENT_BYTES) throw createError({ statusCode: 413, statusMessage: 'Un fichier ne peut pas dépasser 3,4 Mo.' })

  const declaredMimeType = (file.type || 'application/octet-stream').toLocaleLowerCase('en-US').split(';')[0]!
  const mimeType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(declaredMimeType) ? declaredMimeType : 'application/octet-stream'
  const filename = safeFilename(file.filename || '')
  if (/\.(?:exe|bat|cmd|com|scr|vbs|js|msi|ps1|sh)$/i.test(filename)) {
    throw createError({ statusCode: 400, statusMessage: 'Ce type de fichier exécutable ne peut pas être joint.' })
  }
  if (disposition === 'inline' && !INLINE_IMAGE_TYPES.has(mimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Les images intégrées doivent être au format JPEG, PNG, GIF ou WebP.' })
  }

  const existing = await bindings.DB.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS total
    FROM outgoing_draft_attachments WHERE draft_id = ?
  `).bind(draftId).first<{ count: number, total: number }>()
  if ((existing?.count || 0) >= MAX_DRAFT_ATTACHMENTS) throw createError({ statusCode: 413, statusMessage: 'Un message ne peut pas contenir plus de 32 fichiers.' })
  if ((existing?.total || 0) + file.data.byteLength > MAX_DRAFT_ATTACHMENT_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Les pièces jointes dépassent la taille totale autorisée pour un envoi.' })
  }

  const id = crypto.randomUUID()
  const objectKey = `outgoing-drafts/${draftId}/attachments/${id}`
  const contentId = `courrier-${id}`
  await bindings.MAIL_STORE.put(objectKey, file.data, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { draftId, filename, contentId },
  })
  try {
    const inserted = await bindings.DB.prepare(`
      INSERT INTO outgoing_draft_attachments (id, draft_id, filename, mime_type, size_bytes, object_key, content_id, disposition, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM outgoing_drafts WHERE id = ? AND status = 'draft')
    `).bind(id, draftId, filename, mimeType, file.data.byteLength, objectKey, contentId, disposition, new Date().toISOString(), draftId).run()
    if (!inserted.meta.changes) throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est en cours d’envoi.' })
  } catch (error) {
    await bindings.MAIL_STORE.delete(objectKey)
    throw error
  }

  return { id, filename, mimeType, sizeBytes: file.data.byteLength, contentId, disposition }
})
