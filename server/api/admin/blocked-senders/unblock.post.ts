import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'

type BlockedSenderPayload = { mailboxDomain?: unknown, senderAddress?: unknown }

function parseBlockedSender(payload: BlockedSenderPayload | undefined) {
  const mailboxDomain = typeof payload?.mailboxDomain === 'string' ? payload.mailboxDomain.trim().toLowerCase() : ''
  const senderAddress = typeof payload?.senderAddress === 'string' ? payload.senderAddress.trim().toLowerCase() : ''
  const at = senderAddress.indexOf('@')
  if (
    !mailboxDomain
    || mailboxDomain.length > 253
    || /[\s\u0000-\u001f\u007f]/.test(mailboxDomain)
    || at < 1
    || at !== senderAddress.lastIndexOf('@')
    || senderAddress.length > 320
    || /[\s\u0000-\u001f\u007f]/.test(senderAddress)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Adresse bloquée invalide.' })
  }

  return { mailboxDomain, senderAddress }
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const { mailboxDomain, senderAddress } = parseBlockedSender(await readBody<BlockedSenderPayload>(event))
  const targetId = `${mailboxDomain}:${senderAddress}`
  const now = new Date().toISOString()
  const details = JSON.stringify({ mailboxDomain, senderAddress })
  const workspace = await db.prepare(`
    SELECT workspace_id FROM workspace_domains
    WHERE lower(domain) = lower(?)
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(mailboxDomain).first<{ workspace_id: string }>()

  const results = await db.batch([
    db.prepare(`
      DELETE FROM blocked_senders
      WHERE mailbox_domain = ? AND sender_address = ?
    `).bind(mailboxDomain, senderAddress),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'blocked_sender.unblock', 'blocked_sender', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, targetId, workspace?.workspace_id ?? null, details, now),
    db.prepare(`
      UPDATE messages SET screener_state = 'pending'
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ?
        AND folder = 'Screener' AND screener_state = 'blocked' AND trashed_at IS NULL
    `).bind(mailboxDomain, senderAddress),
  ])

  const deleteResult = results[0] as { meta?: { changes?: number } } | undefined
  const removed = (deleteResult?.meta?.changes ?? 0) > 0

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { removed }
})
