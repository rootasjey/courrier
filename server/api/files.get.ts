import type { MailStorageBindings } from '../utils/mail-store'
import { getThreadGrouping, type ManualThreadMergeMember } from '../utils/threading'
import { getWorkspaceUserFromContext, workspaceDomainScope, workspaceMessageScope } from '../utils/account-auth'

type FileRow = {
  id: string
  message_id: string
  filename: string
  mime_type: string
  size_bytes: number
  sender_name: string
  sender_address: string
  subject: string
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  mailbox_domain: string
  sent_at: string | null
  received_at: string
}

type ThreadRow = {
  id: string
  message_id: string
  mailbox_domain: string
  folder: string
  in_reply_to: string | null
  references_header: string | null
  sent_at: string | null
  received_at: string
}

function toFtsQuery(query: string) {
  const terms = query.match(/[\p{L}\p{N}]+(?:[.@_+-][\p{L}\p{N}]+)*/gu) ?? []
  return terms.map(term => `"${term.replaceAll('"', '""')}"*`).join(' AND ')
}

const fileTypeSql: Record<string, string> = {
  image: "lower(attachments.mime_type) LIKE 'image/%'",
  pdf: "(lower(attachments.mime_type) = 'application/pdf' OR lower(attachments.filename) LIKE '%.pdf')",
  document: "(lower(attachments.mime_type) IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/plain', 'application/vnd.oasis.opendocument.text') OR lower(attachments.filename) LIKE '%.doc' OR lower(attachments.filename) LIKE '%.docx' OR lower(attachments.filename) LIKE '%.odt' OR lower(attachments.filename) LIKE '%.rtf' OR lower(attachments.filename) LIKE '%.txt')",
  spreadsheet: "(lower(attachments.mime_type) IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.oasis.opendocument.spreadsheet') OR lower(attachments.filename) LIKE '%.xls' OR lower(attachments.filename) LIKE '%.xlsx' OR lower(attachments.filename) LIKE '%.csv' OR lower(attachments.filename) LIKE '%.ods')",
  presentation: "(lower(attachments.mime_type) IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation') OR lower(attachments.filename) LIKE '%.ppt' OR lower(attachments.filename) LIKE '%.pptx' OR lower(attachments.filename) LIKE '%.odp')",
  archive: "(lower(attachments.mime_type) IN ('application/zip', 'application/x-7z-compressed', 'application/x-rar-compressed', 'application/gzip') OR lower(attachments.filename) LIKE '%.zip' OR lower(attachments.filename) LIKE '%.7z' OR lower(attachments.filename) LIKE '%.rar' OR lower(attachments.filename) LIKE '%.gz')",
  other: "NOT (lower(attachments.mime_type) LIKE 'image/%' OR lower(attachments.mime_type) IN ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/plain', 'application/vnd.oasis.opendocument.text', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation', 'application/zip', 'application/x-7z-compressed', 'application/x-rar-compressed', 'application/gzip') AND lower(attachments.filename) NOT LIKE '%.pdf' AND lower(attachments.filename) NOT LIKE '%.doc' AND lower(attachments.filename) NOT LIKE '%.docx' AND lower(attachments.filename) NOT LIKE '%.odt' AND lower(attachments.filename) NOT LIKE '%.rtf' AND lower(attachments.filename) NOT LIKE '%.txt' AND lower(attachments.filename) NOT LIKE '%.xls' AND lower(attachments.filename) NOT LIKE '%.xlsx' AND lower(attachments.filename) NOT LIKE '%.csv' AND lower(attachments.filename) NOT LIKE '%.ods' AND lower(attachments.filename) NOT LIKE '%.ppt' AND lower(attachments.filename) NOT LIKE '%.pptx' AND lower(attachments.filename) NOT LIKE '%.odp' AND lower(attachments.filename) NOT LIKE '%.zip' AND lower(attachments.filename) NOT LIKE '%.7z' AND lower(attachments.filename) NOT LIKE '%.rar' AND lower(attachments.filename) NOT LIKE '%.gz')",
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const params = getQuery(event)
  const query = String(params.q ?? '').trim().slice(0, 200)
  const matchQuery = toFtsQuery(query)
  if (query && !matchQuery) return { results: [], total: 0, hasMore: false, nextOffset: null, senders: [] }
  const sender = typeof params.sender === 'string' ? params.sender.trim().slice(0, 320) : ''
  const type = typeof params.type === 'string' && fileTypeSql[params.type] ? params.type : ''
  const requestedOffset = Number(params.offset ?? 0)
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0
  const pageSize = 36
  const filters = [
    "messages.folder IN ('Imbox', 'The Feed', 'Paper Trail')",
    'messages.trashed_at IS NULL',
    "COALESCE(attachments.disposition, 'attachment') = 'attachment'",
    'attachments.content_id IS NULL',
  ]
  const filterBindings: unknown[] = []
  if (matchQuery) {
    filters.push(`(
      attachments.rowid IN (SELECT rowid FROM attachments_search WHERE attachments_search MATCH ?)
      OR attachments.rowid IN (SELECT rowid FROM attachment_content_search WHERE attachment_content_search MATCH ?)
      OR messages.rowid IN (SELECT rowid FROM messages_search WHERE messages_search MATCH ?)
    )`)
    filterBindings.push(matchQuery, matchQuery, matchQuery)
  }
  if (sender) {
    filters.push('lower(messages.sender_address) = lower(?)')
    filterBindings.push(sender)
  }
  if (type) filters.push(fileTypeSql[type]!)
  filters.push(workspaceMessageScope('messages', user.id))
  filterBindings.push(user.activeWorkspaceId)
  const where = filters.join('\n AND ')

  const [countRow, page, senderRows, threadResult, mergeResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM attachments
      JOIN messages ON messages.id = attachments.message_id
      JOIN attachments_search ON attachments_search.rowid = attachments.rowid
      JOIN messages_search ON messages_search.rowid = messages.rowid
      WHERE ${where}
    `).bind(...filterBindings).first<{ total: number }>(),
    bindings.DB.prepare(`
      SELECT attachments.id, attachments.message_id, attachments.filename,
        attachments.mime_type, attachments.size_bytes,
        messages.sender_name, messages.sender_address, messages.subject,
        messages.folder, messages.mailbox_domain, messages.sent_at, messages.received_at
      FROM attachments
      JOIN messages ON messages.id = attachments.message_id
      JOIN attachments_search ON attachments_search.rowid = attachments.rowid
      JOIN messages_search ON messages_search.rowid = messages.rowid
      WHERE ${where}
      ORDER BY COALESCE(messages.sent_at, messages.received_at) DESC, attachments.filename COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `).bind(...filterBindings, pageSize + 1, offset).all<FileRow>(),
    bindings.DB.prepare(`
      SELECT DISTINCT messages.sender_address, messages.sender_name
      FROM attachments
      JOIN messages ON messages.id = attachments.message_id
      WHERE messages.folder IN ('Imbox', 'The Feed', 'Paper Trail')
        AND messages.trashed_at IS NULL
        AND COALESCE(attachments.disposition, 'attachment') = 'attachment'
        AND attachments.content_id IS NULL
        AND ${workspaceMessageScope('messages', user.id)}
      ORDER BY COALESCE(NULLIF(messages.sender_name, ''), messages.sender_address) COLLATE NOCASE
      LIMIT 200
    `).bind(user.activeWorkspaceId).all<{ sender_address: string, sender_name: string }>(),
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, sent_at, received_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail')
        AND trashed_at IS NULL
        AND ${workspaceMessageScope('messages', user.id)}
    `).bind(user.activeWorkspaceId).all<ThreadRow>(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merges.mailbox_domain,
        thread_merges.folder, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
      WHERE ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
    `).bind(user.activeWorkspaceId).all<ManualThreadMergeMember>(),
  ])

  const hasMore = page.results.length > pageSize
  const rows = hasMore ? page.results.slice(0, pageSize) : page.results
  const { threadIds } = getThreadGrouping(threadResult.results, mergeResult.results)
  const threadRouteIds = new Map<string, string>()
  const threadRowsById = new Map(threadResult.results.map(row => [row.id, row]))
  for (const row of threadResult.results) {
    const root = threadIds.get(row.id) || row.id
    const existing = threadRowsById.get(threadRouteIds.get(root) ?? '')
    const timestamp = new Date(row.sent_at || row.received_at).getTime()
    const existingTimestamp = existing
      ? new Date(existing.sent_at || existing.received_at).getTime()
      : Number.POSITIVE_INFINITY
    if (timestamp < existingTimestamp) threadRouteIds.set(root, row.id)
  }

  return {
    results: rows.map((row) => {
      const threadRoot = threadIds.get(row.message_id) || row.message_id
      return {
        id: row.id,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        sender: row.sender_name || row.sender_address,
        senderAddress: row.sender_address,
        subject: row.subject,
        folder: row.folder,
        mailboxDomain: row.mailbox_domain,
        messageId: row.message_id,
        threadId: threadRouteIds.get(threadRoot) || row.message_id,
        timestamp: row.sent_at || row.received_at,
        previewUrl: `/api/attachments/${encodeURIComponent(row.id)}?inline=1`,
      }
    }),
    total: countRow?.total ?? 0,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : null,
    senders: senderRows.results.map(row => ({
      value: row.sender_address,
      label: row.sender_name || row.sender_address,
    })),
  }
})
