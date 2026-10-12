import type { MailStorageBindings } from '../../utils/mail-store'

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Brouillon manquant.' })

  const draft = await bindings.DB.prepare('SELECT status FROM outgoing_drafts WHERE id = ?').bind(id).first<{ status: string }>()
  if (!draft) return { deleted: false }
  if (draft.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Un envoi commencé ne peut pas être supprimé.' })
  if (bindings.MAIL_STORE) {
    const files = await bindings.DB.prepare('SELECT object_key FROM outgoing_draft_attachments WHERE draft_id = ?').bind(id).all<{ object_key: string }>()
    await Promise.all(files.results.map(file => bindings.MAIL_STORE!.delete(file.object_key)))
  }
  await bindings.DB.prepare("DELETE FROM outgoing_drafts WHERE id = ? AND status = 'draft'").bind(id).run()
  return { deleted: true }
})
