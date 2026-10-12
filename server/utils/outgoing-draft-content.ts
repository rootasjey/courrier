export type TiptapNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type?: string, attrs?: Record<string, unknown> }>
  content?: TiptapNode[]
}

export type OutgoingDraftAttachment = {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  object_key: string
  content_id: string
  disposition: 'attachment' | 'inline'
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

function safeHref(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : ''
}

function nodeText(node: TiptapNode): string {
  const children = (node.content || []).map(nodeText).join('')
  switch (node.type) {
    case 'text': return node.text || ''
    case 'hardBreak': return '\n'
    case 'paragraph': case 'heading': case 'blockquote': case 'codeBlock': case 'listItem':
      return `${children}\n`
    case 'bulletList': case 'orderedList': return children
    case 'image': return typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
    default: return children
  }
}

function serializeInlineMarks(value: string, marks: TiptapNode['marks']) {
  return (marks || []).reduce((html, mark) => {
    switch (mark.type) {
      case 'bold': return `<strong>${html}</strong>`
      case 'italic': return `<em>${html}</em>`
      case 'strike': return `<s>${html}</s>`
      case 'code': return `<code>${html}</code>`
      case 'link': {
        const href = safeHref(mark.attrs?.href)
        return href ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${html}</a>` : html
      }
      default: return html
    }
  }, escapeHtml(value))
}

function renderNode(node: TiptapNode, draftId: string, attachments: Map<string, OutgoingDraftAttachment>): string {
  const children = (node.content || []).map(child => renderNode(child, draftId, attachments)).join('')
  switch (node.type) {
    case 'text': return serializeInlineMarks(node.text || '', node.marks)
    case 'paragraph': return `<p>${children || '<br>'}</p>`
    case 'heading': {
      const level = Math.max(1, Math.min(3, Number(node.attrs?.level) || 1))
      return `<h${level}>${children}</h${level}>`
    }
    case 'bulletList': return `<ul>${children}</ul>`
    case 'orderedList': return `<ol>${children}</ol>`
    case 'listItem': return `<li>${children}</li>`
    case 'blockquote': return `<blockquote>${children}</blockquote>`
    case 'codeBlock': return `<pre><code>${children}</code></pre>`
    case 'hardBreak': return '<br>'
    case 'horizontalRule': return '<hr>'
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      const match = src.match(new RegExp(`^/api/outgoing-drafts/${draftId}/attachments/([a-f0-9-]+)/content$`))
      const attachment = match ? attachments.get(match[1]!) : undefined
      if (!attachment || attachment.disposition !== 'inline') return ''
      const alt = escapeHtml(typeof node.attrs?.alt === 'string' ? node.attrs.alt : attachment.filename)
      return `<img src="cid:${escapeHtml(attachment.content_id)}" alt="${alt}">`
    }
    case 'doc': return children
    default: return children
  }
}

export function renderOutgoingDraft(content: TiptapNode, draftId: string, rows: OutgoingDraftAttachment[]) {
  const attachments = new Map(rows.map(row => [row.id, row]))
  const html = renderNode(content, draftId, attachments)
    .replace(/\n/g, '')
    .trim()
  const text = (content.content || []).map(nodeText).join('\n').trim()
  return { html: html || '<p></p>', text }
}

function validateNode(value: unknown, depth: number, count: { value: number }): value is TiptapNode {
  count.value += 1
  if (depth > 40 || count.value > 5_000) return false
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const node = value as TiptapNode
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length > 100_000) return false
    const allowedMarks = new Set(['bold', 'italic', 'strike', 'code', 'link'])
    return node.marks === undefined || Array.isArray(node.marks) && node.marks.length <= 5 && node.marks.every(mark => Boolean(mark && mark.type && allowedMarks.has(mark.type)))
  }
  const allowed = new Set(['doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule', 'image'])
  if (!node.type || !allowed.has(node.type)) return false
  if (node.content !== undefined && (!Array.isArray(node.content) || node.content.length > 5_000 || !node.content.every(child => validateNode(child, depth + 1, count)))) return false
  if (node.marks !== undefined) {
    const allowedMarks = new Set(['bold', 'italic', 'strike', 'code', 'link'])
    if (!Array.isArray(node.marks) || node.marks.length > 5 || !node.marks.every(mark => Boolean(mark && mark.type && allowedMarks.has(mark.type)))) return false
  }
  return true
}

export function validateOutgoingDraftContent(value: unknown): value is TiptapNode {
  return validateNode(value, 0, { value: 0 })
}

export function normalizeDraftRecipients(value: unknown) {
  if (typeof value !== 'string' || value.length > 4_000) return null
  const recipients = value.split(/[;,\n]+/).map(address => address.trim().replace(/^<|>$/g, '')).filter(Boolean)
  if (!recipients.length || recipients.length > 50) return null
  if (recipients.some(address => address.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))) return null
  return [...new Set(recipients.map(address => address.toLocaleLowerCase('en-US')))]
}
