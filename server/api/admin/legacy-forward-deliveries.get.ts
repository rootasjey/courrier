import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { auditPlatformAdminRead } from '../../utils/platform-admin-audit'

const TEST_MAILBOX = 'courrier-test@verbatims.cc'
const DELIVERY_REVIEW_LIMIT = 50

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  await auditPlatformAdminRead(db, actor, 'legacy_forward_recovery')
  const bindings = event.context.cloudflare?.env as { COURRIER_LEGACY_FORWARD_TO?: string } | undefined
  const destination = typeof bindings?.COURRIER_LEGACY_FORWARD_TO === 'string'
    ? bindings.COURRIER_LEGACY_FORWARD_TO.trim()
    : ''

  const deliveries = destination ? await db.prepare(`
    SELECT d.message_id AS id, d.status, d.attempt_count, d.claimed_at,
      d.forwarded_at, d.last_error, d.delivery_method,
      m.subject, m.sender_address, m.received_at
    FROM legacy_forward_deliveries d
    JOIN messages m ON m.id = d.message_id
    WHERE lower(m.envelope_to) = ?
      AND lower(m.mailbox_domain) = 'verbatims.cc'
      AND lower(d.destination) = lower(?)
      AND (
        d.status = 'failed'
        OR (d.status = 'processing' AND datetime(d.claimed_at) < datetime('now', '-10 minutes'))
      )
    ORDER BY COALESCE(d.claimed_at, d.created_at) ASC
    LIMIT ?
  `).bind(TEST_MAILBOX, destination, DELIVERY_REVIEW_LIMIT).all<{
    id: string
    status: 'processing' | 'failed'
    attempt_count: number
    claimed_at: string | null
    forwarded_at: string | null
    last_error: string | null
    delivery_method: string
    subject: string
    sender_address: string
    received_at: string
  }>() : { results: [] }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { deliveries: deliveries.results, limit: DELIVERY_REVIEW_LIMIT }
})
