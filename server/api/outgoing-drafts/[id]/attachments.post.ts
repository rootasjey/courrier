import type { MailStorageBindings } from '../../../utils/mail-store'
import { estimateOutgoingEmailBytes, formatEmailSize, OUTBOUND_MESSAGE_BUDGET_BYTES, type OutgoingEmailSizeAttachment } from '../../../../shared/utils/outgoing-email-size'

const MAX_DRAFT_ATTACHMENT_BYTES = 5 * 1024 * 1024
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

  const draft = await bindings.DB.prepare('SELECT status, to_address, cc_address, bcc_address, subject, html_body, text_body FROM outgoing_drafts WHERE id = ?').bind(draftId).first<{
    status: string
    to_address: string
    cc_address: string
    bcc_address: string
    subject: string
    html_body: string
    text_body: string
  }>()
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'Brouillon introuvable.' })
  if (draft.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est en cours d’envoi.' })

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  const disposition = parts?.find(part => part.name === 'disposition')?.data.toString() === 'inline' ? 'inline' : 'attachment'
  if (!file?.data?.byteLength) throw createError({ statusCode: 400, statusMessage: 'Choisis un fichier non vide.' })
  if (file.data.byteLength > MAX_DRAFT_ATTACHMENT_BYTES) throw createError({ statusCode: 413, statusMessage: 'Un fichier ne peut pas dépasser 5 Mio.' })

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
    SELECT COUNT(*) AS count
    FROM outgoing_draft_attachments WHERE draft_id = ?
  `).bind(draftId).first<{ count: number }>()
  if ((existing?.count || 0) >= MAX_DRAFT_ATTACHMENTS) throw createError({ statusCode: 413, statusMessage: 'Un message ne peut pas contenir plus de 32 fichiers.' })
  const existingAttachments = await bindings.DB.prepare(`
    SELECT filename, mime_type, size_bytes, content_id, disposition
    FROM outgoing_draft_attachments WHERE draft_id = ? ORDER BY created_at
  `).bind(draftId).all<OutgoingEmailSizeAttachment>()
  const nextAttachments: OutgoingEmailSizeAttachment[] = [
    ...existingAttachments.results,
    { filename, mime_type: mimeType, size_bytes: file.data.byteLength, content_id: 'courrier-pending', disposition },
  ]
  const estimatedBytes = estimateOutgoingEmailBytes({
    to: draft.to_address,
    cc: draft.cc_address,
    bcc: draft.bcc_address,
    subject: draft.subject,
    text: draft.text_body,
    html: draft.html_body,
    attachments: nextAttachments,
  })
  if (estimatedBytes > OUTBOUND_MESSAGE_BUDGET_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `Ce fichier ferait dépasser le budget estimé de ${formatEmailSize(OUTBOUND_MESSAGE_BUDGET_BYTES)} pour le message complet.` })
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
