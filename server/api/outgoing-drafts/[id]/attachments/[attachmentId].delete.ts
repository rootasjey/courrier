import type { MailStorageBindings } from '../../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceOutgoingDraftScope } from '../../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) throw createError({ statusCode: 503, statusMessage: 'Le stockage des pièces jointes est indisponible.' })
  const draftId = getRouterParam(event, 'id')
  const attachmentId = getRouterParam(event, 'attachmentId')
  if (!draftId || !attachmentId) throw createError({ statusCode: 400, statusMessage: 'Pièce jointe manquante.' })

  const attachment = await bindings.DB.prepare(`
    SELECT a.object_key, d.status FROM outgoing_draft_attachments a
    JOIN outgoing_drafts d ON d.id = a.draft_id
    WHERE a.id = ? AND a.draft_id = ? AND ${workspaceOutgoingDraftScope('d', user.id)}
  `).bind(attachmentId, draftId, user.activeWorkspaceId).first<{ object_key: string, status: string }>()
  if (!attachment) return { deleted: false }
  if (attachment.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est en cours d’envoi.' })
  const deleted = await bindings.DB.prepare(`
    DELETE FROM outgoing_draft_attachments WHERE id = ? AND draft_id = ?
      AND EXISTS (
        SELECT 1 FROM outgoing_drafts AS accessible_draft
        WHERE accessible_draft.id = ? AND accessible_draft.status = 'draft'
          AND ${workspaceOutgoingDraftScope('accessible_draft', user.id)}
      )
  `).bind(attachmentId, draftId, draftId, user.activeWorkspaceId).run()
  if (deleted.meta.changes) await bindings.MAIL_STORE.delete(attachment.object_key)
  return { deleted: Boolean(deleted.meta.changes) }
})
