import type { MailStorageBindings } from '../utils/mail-store'

type DraftRow = {
  id: string
  to_address: string
  cc_address: string
  bcc_address: string
  subject: string
  content_json: string
  status: 'draft' | 'sending'
  updated_at: string
  attachment_count: number
}

function textFromContent(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const node = value as { text?: unknown, content?: unknown[] }
  return [typeof node.text === 'string' ? node.text : '', ...(node.content || []).map(textFromContent)].filter(Boolean).join(' ')
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) throw createError({ statusCode: 503, statusMessage: 'Le stockage des brouillons est indisponible.' })

  const result = await bindings.DB.prepare(`
    SELECT d.id, d.to_address, d.cc_address, d.bcc_address, d.subject, d.content_json, d.status, d.updated_at,
      (SELECT COUNT(*) FROM outgoing_draft_attachments a WHERE a.draft_id = d.id) AS attachment_count
    FROM outgoing_drafts d
    WHERE d.status = 'draft'
    ORDER BY d.updated_at DESC
  `).all<DraftRow>()

  return result.results.map((draft) => {
    let content: unknown
    try { content = JSON.parse(draft.content_json) } catch { content = null }
    return {
      id: draft.id,
      to: draft.to_address,
      cc: draft.cc_address,
      bcc: draft.bcc_address,
      subject: draft.subject,
      preview: textFromContent(content).replace(/\s+/g, ' ').trim().slice(0, 180),
      updatedAt: draft.updated_at,
      attachmentCount: Number(draft.attachment_count) || 0,
    }
  })
})
