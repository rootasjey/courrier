import type { MailStorageBindings } from '../utils/mail-store'
import { getWorkspaceUserFromContext, requireMailboxAddressAccess } from '../utils/account-auth'
import { renderOutgoingDraft, validateOutgoingDraftContent, type TiptapNode } from '../utils/outgoing-draft-content'

const fromAddress = 'courrier-test@verbatims.cc'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })

  const mailboxId = await requireMailboxAddressAccess(bindings.DB, user.id, user.activeWorkspaceId, fromAddress)

  const body = await readBody<{ to?: unknown, cc?: unknown, bcc?: unknown, subject?: unknown, content?: unknown }>(event)
  const to = body?.to === undefined ? '' : body.to
  const cc = body?.cc === undefined ? '' : body.cc
  const bcc = body?.bcc === undefined ? '' : body.bcc
  const subject = body?.subject === undefined ? '' : body.subject
  const content = body?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }
  if (typeof to !== 'string' || to.length > 4_000
    || typeof cc !== 'string' || cc.length > 4_000
    || typeof bcc !== 'string' || bcc.length > 4_000) {
    throw createError({ statusCode: 400, statusMessage: 'Le champ des destinataires est invalide ou trop long.' })
  }
  if (typeof subject !== 'string' || subject.length > 998) {
    throw createError({ statusCode: 400, statusMessage: 'L’objet est invalide ou trop long.' })
  }
  let contentJson: string
  try { contentJson = JSON.stringify(content) } catch { throw createError({ statusCode: 400, statusMessage: 'Le contenu du message est invalide.' }) }
  if (contentJson.length > 200_000) throw createError({ statusCode: 413, statusMessage: 'Le brouillon est trop volumineux.' })
  if (!validateOutgoingDraftContent(content) || content.type !== 'doc') {
    throw createError({ statusCode: 400, statusMessage: 'Le contenu du message est invalide.' })
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const rendered = renderOutgoingDraft(content as TiptapNode, id, [])
  await bindings.DB.prepare(`
    INSERT INTO outgoing_drafts (id, workspace_id, mailbox_id, to_address, cc_address, bcc_address, subject, content_json, html_body, text_body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.activeWorkspaceId, mailboxId, to.trim(), cc.trim(), bcc.trim(), subject.trim(), contentJson, rendered.html, rendered.text, now, now).run()
  return { id, to: to.trim(), cc: cc.trim(), bcc: bcc.trim(), subject: subject.trim(), content, status: 'draft', updatedAt: now, attachments: [] }
})
