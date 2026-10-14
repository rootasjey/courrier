import type { MailStorageBindings } from '../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceOutgoingDraftScope } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Brouillon manquant.' })

  const draft = await bindings.DB.prepare(`SELECT status FROM outgoing_drafts
    WHERE id = ? AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}`)
    .bind(id, user.activeWorkspaceId).first<{ status: string }>()
  if (!draft) return { deleted: false }
  if (draft.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Un envoi commencé ne peut pas être supprimé.' })
  const files = bindings.MAIL_STORE
    ? await bindings.DB.prepare('SELECT object_key FROM outgoing_draft_attachments WHERE draft_id = ?').bind(id).all<{ object_key: string }>()
    : { results: [] as { object_key: string }[] }
  const deleted = await bindings.DB.prepare(`DELETE FROM outgoing_drafts
    WHERE id = ? AND status = 'draft' AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}`)
    .bind(id, user.activeWorkspaceId).run()
  if (!deleted.meta.changes) return { deleted: false }
  if (bindings.MAIL_STORE) {
    await Promise.all(files.results.map(file => bindings.MAIL_STORE!.delete(file.object_key)))
  }
  return { deleted: Boolean(deleted.meta.changes) }
})
