import { assertSameOrigin, getAccountDb, requirePlatformAdmin, type AccountDb } from '../../../../utils/account-auth'

const TEST_MAILBOX = 'courrier-test@verbatims.cc'
const REPLAY_FROM = 'courrier-test@verbatims.cc'
const DELIVERY_LEASE_MINUTES = 10

type ReplayBindings = {
  DB?: D1Database
  MAIL_STORE?: R2Bucket
  EMAIL?: SendEmail
  COURRIER_LEGACY_FORWARD_TO?: string
}

type ReplayDelivery = {
  id: string
  destination: string
  status: 'processing' | 'failed' | 'forwarded'
  claimed_at: string | null
  attempt_count: number
  raw_object_key: string
  envelope_to: string
  mailbox_domain: string
}

async function markReplayResult(
  db: AccountDb,
  id: string,
  claimToken: string,
  attemptCount: number,
  status: 'forwarded' | 'failed',
  error: string | null,
) {
  await db.prepare(`
    UPDATE legacy_forward_deliveries
    SET status = ?, forwarded_at = ?, claimed_at = NULL, claim_token = NULL, last_error = ?, delivery_method = 'email_replay'
    WHERE message_id = ? AND status = 'processing' AND claim_token = ? AND attempt_count = ?
  `).bind(status, status === 'forwarded' ? new Date().toISOString() : null, error?.slice(0, 1000) ?? null, id, claimToken, attemptCount).run()
  const marked = await db.prepare(`
    SELECT 1 AS marked FROM legacy_forward_deliveries
    WHERE message_id = ? AND status = ? AND delivery_method = 'email_replay' AND attempt_count = ?
      AND claim_token IS NULL
      AND ((? = 'forwarded' AND forwarded_at IS NOT NULL) OR (? = 'failed' AND claimed_at IS NULL))
  `).bind(id, status, attemptCount, status, status).first<{ marked: number }>()
  return Boolean(marked)
}

async function recordReplayOutcome(
  db: AccountDb,
  actorId: string,
  messageId: string,
  status: 'accepted' | 'failed',
  createdAt: string,
) {
  await db.prepare(`
    INSERT INTO platform_audit_log
      (id, actor_user_id, action, target_type, target_id, details_json, created_at)
    VALUES (?, ?, ?, 'legacy_forward_delivery', ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    actorId,
    `platform_admin.legacy_forward_replay_${status}`,
    messageId,
    JSON.stringify({ transport: 'cloudflare_email_binding', status }),
    createdAt,
  ).run()
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const bindings = event.context.cloudflare?.env as ReplayBindings | undefined
  const id = getRouterParam(event, 'id')?.trim() || ''
  const destination = typeof bindings?.COURRIER_LEGACY_FORWARD_TO === 'string'
    ? bindings.COURRIER_LEGACY_FORWARD_TO.trim()
    : ''

  if (!/^[0-9a-f]{64}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de message invalide.' })
  }
  if (!destination || !bindings?.MAIL_STORE || !bindings.EMAIL) {
    throw createError({ statusCode: 503, statusMessage: 'Le service de reprise des transferts est indisponible.' })
  }

  const delivery = await db.prepare(`
    SELECT d.message_id AS id, d.destination, d.status, d.claimed_at, d.attempt_count,
      m.raw_object_key, m.envelope_to, m.mailbox_domain
    FROM legacy_forward_deliveries d
    JOIN messages m ON m.id = d.message_id
    WHERE d.message_id = ?
      AND lower(d.destination) = lower(?)
      AND lower(m.envelope_to) = ?
      AND lower(m.mailbox_domain) = 'verbatims.cc'
      AND (
        d.status = 'failed'
        OR (d.status = 'processing' AND datetime(d.claimed_at) < datetime('now', '-${DELIVERY_LEASE_MINUTES} minutes'))
      )
    LIMIT 1
  `).bind(id, destination, TEST_MAILBOX).first<ReplayDelivery>()

  if (!delivery) {
    throw createError({ statusCode: 409, statusMessage: 'Ce transfert n’est plus à reprendre ou ne concerne pas la boîte de test.' })
  }

  const claimedAt = new Date().toISOString()
  const claimToken = crypto.randomUUID()
  await db.prepare(`
    UPDATE legacy_forward_deliveries
    SET status = 'processing', attempt_count = attempt_count + 1,
      claimed_at = ?, claim_token = ?, last_error = NULL, delivery_method = 'email_replay'
    WHERE message_id = ? AND lower(destination) = lower(?)
      AND (
        status = 'failed'
        OR (status = 'processing' AND datetime(claimed_at) < datetime(?, '-${DELIVERY_LEASE_MINUTES} minutes'))
      )
  `).bind(claimedAt, claimToken, id, destination, claimedAt).run()

  const currentClaim = await db.prepare(`
    SELECT 1 AS claimed FROM legacy_forward_deliveries
    WHERE message_id = ? AND status = 'processing' AND claimed_at = ? AND claim_token = ?
  `).bind(id, claimedAt, claimToken).first<{ claimed: number }>()
  if (!currentClaim) {
    throw createError({ statusCode: 409, statusMessage: 'Un autre traitement a déjà pris ce transfert en charge.' })
  }

  const auditAt = new Date().toISOString()
  await db.prepare(`
    INSERT INTO platform_audit_log
      (id, actor_user_id, action, target_type, target_id, details_json, created_at)
    VALUES (?, ?, 'platform_admin.legacy_forward_replay_requested', 'legacy_forward_delivery', ?, ?, ?)
  `).bind(
    crypto.randomUUID(), actor.id, id,
    JSON.stringify({ transport: 'cloudflare_email_binding', destination: 'configured_legacy_forward' }),
    auditAt,
  ).run()

  let storedMessage: R2ObjectBody | null
  try {
    storedMessage = await bindings.MAIL_STORE.get(delivery.raw_object_key)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await markReplayResult(db, id, claimToken, delivery.attempt_count + 1, 'failed', `Échec de lecture R2 : ${detail}`)
    await recordReplayOutcome(db, actor.id, id, 'failed', new Date().toISOString())
    throw createError({ statusCode: 502, statusMessage: 'La copie MIME ne peut pas être lue dans le stockage. La reprise pourra être retentée.' })
  }

  if (!storedMessage) {
    const error = 'La copie MIME originale est absente du stockage R2.'
    await markReplayResult(db, id, claimToken, delivery.attempt_count + 1, 'failed', error)
    await recordReplayOutcome(db, actor.id, id, 'failed', new Date().toISOString())
    throw createError({ statusCode: 410, statusMessage: error })
  }

  try {
    const { EmailMessage } = await import('cloudflare:email')
    await bindings.EMAIL.send(new EmailMessage(REPLAY_FROM, destination, storedMessage.body))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await markReplayResult(db, id, claimToken, delivery.attempt_count + 1, 'failed', detail)
    await recordReplayOutcome(db, actor.id, id, 'failed', new Date().toISOString())
    throw createError({ statusCode: 502, statusMessage: 'Cloudflare n’a pas confirmé la reprise. Vérifie la boîte destinataire avant une nouvelle tentative.' })
  }

  const marked = await markReplayResult(db, id, claimToken, delivery.attempt_count + 1, 'forwarded', null)
  if (!marked) {
    await recordReplayOutcome(db, actor.id, id, 'accepted', new Date().toISOString())
    throw createError({ statusCode: 409, statusMessage: 'Cloudflare a accepté le nouvel envoi, mais son état n’a pas pu être enregistré. Vérifie la boîte destinataire.' })
  }
  await recordReplayOutcome(db, actor.id, id, 'accepted', new Date().toISOString())

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { accepted: true, attemptCount: delivery.attempt_count + 1 }
})
