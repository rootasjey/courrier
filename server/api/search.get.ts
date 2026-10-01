import type { MailStorageBindings } from '../utils/mail-store'
import { getThreadIds } from '../utils/threading'

type SearchMessageRow = {
  id: string
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  snippet: string
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

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const params = getQuery(event)
  const query = String(params.q ?? '').trim().slice(0, 200)
  const matchQuery = toFtsQuery(query)
  if (!matchQuery) return { results: [], total: 0, hasMore: false, nextOffset: null }

  const requestedOffset = Number(params.offset ?? 0)
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0
  const pageSize = 40
  const bindingsList = [matchQuery]

  const [countRow, page, threadRows] = await Promise.all([
    bindings.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM messages_search
      JOIN messages ON messages.rowid = messages_search.rowid
      WHERE messages_search MATCH ?
        AND messages.folder IN ('Imbox', 'The Feed', 'Paper Trail')
        AND messages.trashed_at IS NULL
    `).bind(...bindingsList).first<{ total: number }>(),
    bindings.DB.prepare(`
      SELECT messages.id, messages.folder, messages.sent_at, messages.received_at,
        snippet(messages_search, 3, '', '', ' … ', 14) AS snippet
      FROM messages_search
      JOIN messages ON messages.rowid = messages_search.rowid
      WHERE messages_search MATCH ?
        AND messages.folder IN ('Imbox', 'The Feed', 'Paper Trail')
        AND messages.trashed_at IS NULL
      ORDER BY COALESCE(messages.sent_at, messages.received_at) DESC
      LIMIT ? OFFSET ?
    `).bind(matchQuery, pageSize + 1, offset).all<SearchMessageRow>(),
    bindings.DB.prepare(`
      SELECT id, message_id, mailbox_domain, folder, in_reply_to,
        references_header, sent_at, received_at
      FROM messages
      WHERE folder IN ('Imbox', 'The Feed', 'Paper Trail')
        AND trashed_at IS NULL
    `).all<ThreadRow>(),
  ])

  const hasMore = page.results.length > pageSize
  const rows = hasMore ? page.results.slice(0, pageSize) : page.results
  const threadIds = getThreadIds(threadRows.results)
  const routeIds = new Map<string, string>()
  const rowsById = new Map(threadRows.results.map(row => [row.id, row]))

  for (const row of threadRows.results) {
    const threadRoot = threadIds.get(row.id) || row.id
    const existing = rowsById.get(routeIds.get(threadRoot) ?? '')
    const timestamp = new Date(row.sent_at || row.received_at).getTime()
    const existingTimestamp = existing
      ? new Date(existing.sent_at || existing.received_at).getTime()
      : Number.POSITIVE_INFINITY

    if (timestamp < existingTimestamp) routeIds.set(threadRoot, row.id)
  }

  return {
    results: rows.map(row => ({
      id: row.id,
      folder: row.folder,
      threadId: routeIds.get(threadIds.get(row.id) || row.id) || row.id,
      snippet: row.snippet,
    })),
    total: countRow?.total ?? 0,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : null,
  }
})
