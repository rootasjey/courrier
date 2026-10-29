import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'
import { checkCloudflareMailboxRouting, setCloudflareMailboxRule } from '../../../utils/cloudflare-email-routing'

type MailboxRow = { id: string, workspace_id: string, domain: string, address: string, status: 'active' | 'suspended' }
type MutationResult = { meta?: { changes?: number } }

async function restoreCloudflareMailboxRule(mailbox: MailboxRow, token: string, enabled: boolean) {
  try {
    await setCloudflareMailboxRule({ domain: mailbox.domain, address: mailbox.address, enabled, token })
    return true
  } catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const mailboxId = getRouterParam(event, 'id')?.trim() ?? ''
  const body = await readBody<{ status?: unknown }>(event)
  const nextStatus = body?.status === 'active' || body?.status === 'suspended' ? body.status : null

  if (!mailboxId || mailboxId.length > 256 || /[\u0000-\u001f\u007f]/u.test(mailboxId) || !nextStatus) {
    throw createError({ statusCode: 400, statusMessage: 'Boîte ou état invalide.' })
  }

  const mailbox = await db.prepare(`
    SELECT mb.id, mb.workspace_id, lower(d.domain) AS domain, lower(mb.address) AS address, mb.status
    FROM mailboxes mb
    JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
    JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      AND d.verification_status IN ('verified', 'legacy_unverified')
    WHERE mb.id = ?
    LIMIT 1
  `).bind(mailboxId).first<MailboxRow>()
  if (!mailbox) throw createError({ statusCode: 404, statusMessage: 'Boîte active ou suspendue introuvable.' })

  const bindings = event.context.cloudflare?.env as {
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN?: string
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN?: string
  } | undefined
  const enabled = nextStatus === 'active'
  let routingChange: string

  if (bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN) {
    try {
      routingChange = await setCloudflareMailboxRule({
        domain: mailbox.domain,
        address: mailbox.address,
        enabled,
        token: bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN,
      })
    } catch {
      throw createError({ statusCode: 502, statusMessage: 'La règle de réception Cloudflare n’a pas pu être mise à jour. La boîte n’a pas changé d’état.' })
    }
  } else {
    const checks = await checkCloudflareMailboxRouting({
      domain: mailbox.domain,
      addresses: [mailbox.address],
      token: bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN,
    })
    const state = checks[0]?.state
    const matchesDesiredState = enabled ? state === 'configured' : state === 'disabled'
    if (!matchesDesiredState) {
      throw createError({
        statusCode: state === 'unavailable' ? 503 : 409,
        statusMessage: enabled
          ? 'Active la règle exacte vers Courrier dans Cloudflare, puis réessaie.'
          : 'Désactive la règle exacte dans Cloudflare, puis réessaie.',
      })
    }
    routingChange = 'manually_verified'
  }

  if (mailbox.status === nextStatus) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return { mailboxId, status: nextStatus, unchanged: true, routingChange }
  }

  const now = new Date().toISOString()
  const action = nextStatus === 'suspended' ? 'workspace_mailbox.suspended' : 'workspace_mailbox.reactivated'
  let results: Awaited<ReturnType<typeof db.batch>>
  try {
    results = await db.batch([
      db.prepare(`
        UPDATE mailboxes SET status = ? WHERE id = ? AND workspace_id = ? AND status = ?
      `).bind(nextStatus, mailbox.id, mailbox.workspace_id, mailbox.status),
      db.prepare(`
        INSERT INTO platform_audit_log
          (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
        SELECT ?, ?, ?, 'mailbox', ?, ?, ?, ? WHERE changes() > 0
      `).bind(
        crypto.randomUUID(), actor.id, action, mailbox.id, mailbox.workspace_id,
        JSON.stringify({ address: mailbox.address, domain: mailbox.domain, routingChange }), now,
      ),
    ])
  } catch {
    if (bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN) {
      const restored = await restoreCloudflareMailboxRule(mailbox, bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN, mailbox.status === 'active')
      if (!restored) {
        await db.prepare(`
          INSERT INTO platform_audit_log
            (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
          VALUES (?, ?, 'workspace_mailbox.routing_compensation_failed', 'mailbox', ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(), actor.id, mailbox.id, mailbox.workspace_id,
          JSON.stringify({ address: mailbox.address, domain: mailbox.domain, expectedStatus: mailbox.status }), new Date().toISOString(),
        ).run().catch(() => undefined)
        throw createError({ statusCode: 503, statusMessage: 'La boîte n’a pas changé d’état et le retour arrière Cloudflare a échoué. Vérifie la règle de réception avant toute nouvelle tentative.' })
      }
    }
    throw createError({ statusCode: 503, statusMessage: 'La boîte n’a pas changé d’état. Actualise la console et vérifie sa règle Cloudflare.' })
  }
  const changed = Number((results[0] as MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    if (bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN) {
      const restored = await restoreCloudflareMailboxRule(mailbox, bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN, mailbox.status === 'active')
      if (!restored) {
        await db.prepare(`
          INSERT INTO platform_audit_log
            (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
          VALUES (?, ?, 'workspace_mailbox.routing_compensation_failed', 'mailbox', ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(), actor.id, mailbox.id, mailbox.workspace_id,
          JSON.stringify({ address: mailbox.address, domain: mailbox.domain, expectedStatus: mailbox.status }), new Date().toISOString(),
        ).run().catch(() => undefined)
        throw createError({ statusCode: 503, statusMessage: 'La boîte a changé entre-temps et le retour arrière Cloudflare a échoué. Vérifie la règle de réception avant toute nouvelle tentative.' })
      }
    }
    throw createError({ statusCode: 409, statusMessage: 'La boîte a été modifiée entre-temps. Actualise la console.' })
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { mailboxId, status: nextStatus, unchanged: false, routingChange }
})
