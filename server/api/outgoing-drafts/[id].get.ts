import type { MailStorageBindings } from '../../utils/mail-store'
import { getWorkspaceUserFromContext } from '../../utils/account-auth'

type DraftRow = {
  id: string
  to_address: string
  cc_address: string
  bcc_address: string
  subject: string
  content_json: string
  status: 'draft' | 'sending'
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Brouillon manquant.' })

  const draft = await bindings.DB.prepare(`
    SELECT id, to_address, cc_address, bcc_address, subject, content_json, status, updated_at
    FROM outgoing_drafts WHERE id = ? AND workspace_id = ?
  `).bind(id, user.activeWorkspaceId).first<DraftRow>()
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'Ce brouillon est introuvable.' })
  if (draft.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Ce message est déjà en cours d’envoi.' })

  const attachments = await bindings.DB.prepare(`
    SELECT id, filename, mime_type AS mimeType, size_bytes AS sizeBytes, disposition, content_id AS contentId
    FROM outgoing_draft_attachments WHERE draft_id = ? ORDER BY created_at
  `).bind(draft.id).all()

  let content: unknown
  try { content = JSON.parse(draft.content_json) } catch { content = { type: 'doc', content: [{ type: 'paragraph' }] } }
  return {
    id: draft.id,
    to: draft.to_address,
    cc: draft.cc_address,
    bcc: draft.bcc_address,
    subject: draft.subject,
    content,
    status: draft.status,
    updatedAt: draft.updated_at,
    attachments: attachments.results,
  }
})
