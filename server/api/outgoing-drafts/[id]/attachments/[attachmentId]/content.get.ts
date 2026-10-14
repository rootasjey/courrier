import type { MailStorageBindings } from '../../../../../utils/mail-store'
import { getWorkspaceUserFromContext } from '../../../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage des pièces jointes est indisponible.' })
  const draftId = getRouterParam(event, 'id')
  const attachmentId = getRouterParam(event, 'attachmentId')
  if (!draftId || !attachmentId) throw createError({ statusCode: 400, statusMessage: 'Pièce jointe manquante.' })

  const attachment = await bindings.DB.prepare(`
    SELECT object_key, mime_type
    FROM outgoing_draft_attachments
    WHERE id = ? AND draft_id = ? AND disposition = 'inline'
      AND EXISTS (SELECT 1 FROM outgoing_drafts WHERE id = ? AND workspace_id = ?)
  `).bind(attachmentId, draftId, draftId, user.activeWorkspaceId).first<{ object_key: string, mime_type: string }>()
  if (!attachment) throw createError({ statusCode: 404, statusMessage: 'Image intégrée introuvable.' })

  const object = await bindings.MAIL_STORE.get(attachment.object_key)
  if (!object) throw createError({ statusCode: 404, statusMessage: 'Image intégrée introuvable.' })
  setResponseHeaders(event, { 'Content-Type': attachment.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  return object.body
})
