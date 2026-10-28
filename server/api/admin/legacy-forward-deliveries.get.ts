import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { auditPlatformAdminRead } from '../../utils/platform-admin-audit'

const DELIVERY_REVIEW_LIMIT = 50

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  await auditPlatformAdminRead(db, actor, 'legacy_forward_recovery')
  const query = getQuery(event)
  if (query.cursor !== undefined && typeof query.cursor !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Curseur de reprise invalide.' })
  }
  const cursor = typeof query.cursor === 'string' ? query.cursor.trim() : ''
  if (cursor && !/^[0-9a-f]{64}$/i.test(cursor)) {
    throw createError({ statusCode: 400, statusMessage: 'Curseur de reprise invalide.' })
  }

  let cursorSortAt: string | null = null
  if (cursor) {
    const row = await db.prepare(`
      SELECT created_at AS sort_at
      FROM legacy_forward_deliveries
      WHERE message_id = ?
    `).bind(cursor).first<{ sort_at: string }>()
    if (!row) throw createError({ statusCode: 400, statusMessage: 'Curseur de reprise introuvable.' })
    cursorSortAt = row.sort_at
  }

  const deliveries = await db.prepare(`
    SELECT d.message_id AS id, d.status, d.attempt_count, d.claimed_at,
      d.forwarded_at, d.last_error, d.delivery_method,
      m.subject, m.sender_address, m.envelope_to AS mailbox_address,
      d.destination, m.received_at
    FROM legacy_forward_deliveries d
    JOIN messages m ON m.id = d.message_id
    WHERE (
      d.status = 'failed'
      OR (d.status = 'processing' AND (
        d.claimed_at IS NULL
        OR datetime(d.claimed_at) < datetime('now', '-10 minutes')
      ))
    )
      AND (? IS NULL OR d.created_at > ?
        OR (d.created_at = ? AND d.message_id > ?))
    ORDER BY d.created_at ASC, d.message_id ASC
    LIMIT ?
  `).bind(cursorSortAt, cursorSortAt, cursorSortAt, cursor || null, DELIVERY_REVIEW_LIMIT + 1).all<{
    id: string
    status: 'processing' | 'failed'
    attempt_count: number
    claimed_at: string | null
    forwarded_at: string | null
    last_error: string | null
    delivery_method: string
    subject: string
    sender_address: string
    mailbox_address: string
    destination: string
    received_at: string
  }>()

  const hasMore = deliveries.results.length > DELIVERY_REVIEW_LIMIT
  const page = hasMore ? deliveries.results.slice(0, DELIVERY_REVIEW_LIMIT) : deliveries.results
  const nextCursor = hasMore ? page.at(-1)?.id ?? null : null

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { deliveries: page, limit: DELIVERY_REVIEW_LIMIT, nextCursor }
})
