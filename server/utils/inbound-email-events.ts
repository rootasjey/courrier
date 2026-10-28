export const INBOUND_EMAIL_EVENT_RETENTION_DAYS = 90

export type InboundEmailEventType = 'rejected' | 'degraded' | 'failed'
export type InboundEmailEventReason =
  | 'sender_blocked'
  | 'mailbox_unconfigured'
  | 'mail_storage_unavailable'
  | 'processing_failed'

type InboundEmailEventInput = {
  eventType: InboundEmailEventType
  reasonCode: InboundEmailEventReason
  senderAddress: string
  recipientAddress: string
  createdAt?: string
}

export function normalizeInboundEmailAddress(value: string) {
  return value.trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 320)
}

export async function recordInboundEmailEvent(
  db: Pick<D1Database, 'prepare'>,
  input: InboundEmailEventInput,
) {
  await db.prepare(`
    INSERT INTO inbound_email_events
      (id, event_type, reason_code, sender_address, recipient_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.eventType,
    input.reasonCode,
    normalizeInboundEmailAddress(input.senderAddress),
    normalizeInboundEmailAddress(input.recipientAddress),
    input.createdAt ?? new Date().toISOString(),
  ).run()
}

export async function pruneInboundEmailEvents(db: Pick<D1Database, 'prepare'>, now = new Date()) {
  const cutoff = new Date(now.getTime() - INBOUND_EMAIL_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await db.prepare('DELETE FROM inbound_email_events WHERE created_at < ?').bind(cutoff).run()
}
