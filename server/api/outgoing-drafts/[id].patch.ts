import type { MailStorageBindings } from '../../utils/mail-store'
import { renderOutgoingDraft, validateOutgoingDraftContent, type OutgoingDraftAttachment, type TiptapNode } from '../../utils/outgoing-draft-content'
import { getWorkspaceUserFromContext, workspaceOutgoingDraftScope } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Brouillon manquant.' })

  const accessible = await bindings.DB.prepare(`
    SELECT 1 AS allowed FROM outgoing_drafts
    WHERE id = ? AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}
  `).bind(id, user.activeWorkspaceId).first<{ allowed: number }>()
  if (!accessible) throw createError({ statusCode: 404, statusMessage: 'Ce brouillon est introuvable.' })

  const body = await readBody<{ to?: unknown, cc?: unknown, bcc?: unknown, subject?: unknown, content?: unknown }>(event)
  if (typeof body?.to !== 'string' || body.to.length > 4_000 || (body.cc !== undefined && (typeof body.cc !== 'string' || body.cc.length > 4_000)) || (body.bcc !== undefined && (typeof body.bcc !== 'string' || body.bcc.length > 4_000))) {
    throw createError({ statusCode: 400, statusMessage: 'Le champ des destinataires est invalide ou trop long.' })
  }
  if (typeof body?.subject !== 'string' || body.subject.length > 998) {
    throw createError({ statusCode: 400, statusMessage: 'L’objet est invalide ou trop long.' })
  }
  let contentJson: string
  try { contentJson = JSON.stringify(body.content) } catch { throw createError({ statusCode: 400, statusMessage: 'Le contenu du message est invalide.' }) }
  if (contentJson.length > 200_000) throw createError({ statusCode: 413, statusMessage: 'Le brouillon est trop volumineux.' })
  if (!validateOutgoingDraftContent(body.content) || body.content.type !== 'doc') {
    throw createError({ statusCode: 400, statusMessage: 'Le contenu du message est invalide.' })
  }

  const attachments = await bindings.DB.prepare(`
    SELECT id, filename, mime_type, size_bytes, object_key, content_id, disposition
    FROM outgoing_draft_attachments WHERE draft_id = ? ORDER BY created_at
  `).bind(id).all<OutgoingDraftAttachment>()
  const rendered = renderOutgoingDraft(body.content as TiptapNode, id, attachments.results)
  const updatedAt = new Date().toISOString()
  const cc = typeof body.cc === 'string' ? body.cc.trim() : ''
  const bcc = typeof body.bcc === 'string' ? body.bcc.trim() : ''
  const saved = await bindings.DB.prepare(`
    UPDATE outgoing_drafts SET to_address = ?, cc_address = ?, bcc_address = ?, subject = ?, content_json = ?, html_body = ?, text_body = ?, updated_at = ?
    WHERE id = ? AND status = 'draft' AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}
  `).bind(body.to.trim(), cc, bcc, body.subject.trim(), contentJson, rendered.html, rendered.text, updatedAt, id, user.activeWorkspaceId).run()
  if (!saved.meta.changes) throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est en cours d’envoi et ne peut plus être modifié.' })
  return { id, to: body.to.trim(), cc, bcc, subject: body.subject.trim(), content: body.content, status: 'draft', updatedAt }
})
