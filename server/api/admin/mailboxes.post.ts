import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { AdminMailboxInputError, parseAdminMailboxPayload, type AdminMailboxPayload } from '../../utils/admin-mailbox-input'
import { CloudflareMailboxRuleError, setCloudflareMailboxRule } from '../../utils/cloudflare-email-routing'

type MailboxInsertResult = { meta?: { changes?: number } }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  let parsed: ReturnType<typeof parseAdminMailboxPayload>
  try {
    parsed = parseAdminMailboxPayload(await readBody<AdminMailboxPayload>(event))
  } catch (error) {
    if (error instanceof AdminMailboxInputError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
  const { domainId, localPart, userIds } = parsed

  const domain = await db.prepare(`
    SELECT d.workspace_id, lower(d.domain) AS domain
    FROM workspace_domains d
    JOIN workspaces w ON w.id = d.workspace_id AND w.status = 'active'
    WHERE d.id = ? AND d.verification_status = 'verified'
    LIMIT 1
  `).bind(domainId).first<{ workspace_id: string, domain: string }>()
  if (!domain) {
    throw createError({ statusCode: 404, statusMessage: 'Domaine vérifié introuvable.' })
  }

  const address = `${localPart}@${domain.domain}`
  if (address.length > 254) throw createError({ statusCode: 400, statusMessage: 'Adresse trop longue.' })

  const mailboxId = crypto.randomUUID()
  const now = new Date().toISOString()
  const usersJson = JSON.stringify(userIds)
  const routingAuditId = crypto.randomUUID()

  let results: Awaited<ReturnType<typeof db.batch>>
  try {
    results = await db.batch([
      db.prepare(`
        INSERT INTO mailboxes (id, workspace_id, domain_id, address, status, created_at)
        SELECT ?, d.workspace_id, d.id, ?, 'active', ?
        FROM workspace_domains d
        JOIN workspaces w ON w.id = d.workspace_id AND w.status = 'active'
        WHERE d.id = ? AND d.verification_status = 'verified'
          AND lower(d.domain) = ?
          AND NOT EXISTS (SELECT 1 FROM mailboxes WHERE address = ? COLLATE NOCASE)
          AND (
            SELECT COUNT(*)
            FROM json_each(?) selected
            JOIN workspace_memberships wm ON wm.workspace_id = d.workspace_id
              AND wm.user_id = selected.value AND wm.status = 'active'
            JOIN users u ON u.id = wm.user_id AND u.status = 'active'
          ) = ?
        LIMIT 1
      `).bind(mailboxId, address, now, domainId, domain.domain, address, usersJson, userIds.length),
      db.prepare(`
        INSERT INTO mailbox_access_grants
          (workspace_id, mailbox_id, user_id, granted_by_user_id, status, created_at)
        SELECT mb.workspace_id, mb.id, selected.value, ?, 'active', ?
        FROM mailboxes mb
        JOIN json_each(?) selected
        JOIN workspace_memberships wm ON wm.workspace_id = mb.workspace_id
          AND wm.user_id = selected.value AND wm.status = 'active'
        JOIN users u ON u.id = wm.user_id AND u.status = 'active'
        WHERE mb.id = ? AND mb.workspace_id = ?
      `).bind(actor.id, now, usersJson, mailboxId, domain.workspace_id),
      db.prepare(`
        INSERT INTO platform_audit_log
          (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
        SELECT ?, ?, 'workspace_mailbox.created', 'mailbox', ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM mailboxes WHERE id = ? AND workspace_id = ?)
      `).bind(
        crypto.randomUUID(), actor.id, mailboxId, domain.workspace_id,
        JSON.stringify({ address, domainId, initialUserIds: userIds }), now, mailboxId, domain.workspace_id,
      ),
      db.prepare(`
        INSERT INTO platform_audit_log
          (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
        SELECT ?, ?, 'workspace_mailbox.routing_setup_started', 'mailbox', ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM mailboxes WHERE id = ? AND workspace_id = ?)
      `).bind(
        routingAuditId, actor.id, mailboxId, domain.workspace_id,
        JSON.stringify({ address, domainId }), now, mailboxId, domain.workspace_id,
      ),
    ])
  } catch (error) {
    const existing = await db.prepare(`
      SELECT 1 AS found FROM mailboxes WHERE address = ? COLLATE NOCASE LIMIT 1
    `).bind(address).first<{ found: number }>()
    if (existing) throw createError({ statusCode: 409, statusMessage: 'Cette adresse existe déjà.' })
    throw error
  }

  const inserted = Number((results[0] as MailboxInsertResult | undefined)?.meta?.changes ?? 0) > 0
  const granted = Number((results[1] as MailboxInsertResult | undefined)?.meta?.changes ?? 0)
  if (inserted && granted === userIds.length) {
    const bindings = event.context.cloudflare?.env as { COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN?: string } | undefined
    let routingStatus: 'configured' | 'manual_required' | 'conflict' = 'manual_required'
    if (bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN) {
      try {
        await setCloudflareMailboxRule({
          domain: domain.domain,
          address,
          enabled: true,
          token: bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN,
        })
        routingStatus = 'configured'
      } catch (error) {
        // Keep manual setup as a recoverable fallback, but suspend on a route conflict.
        if (error instanceof CloudflareMailboxRuleError && error.code === 'conflict') {
          routingStatus = 'conflict'
          try {
            const suspended = await db.prepare("UPDATE mailboxes SET status = 'suspended' WHERE id = ? AND workspace_id = ? AND status = 'active'")
              .bind(mailboxId, domain.workspace_id).run()
            if (Number(suspended.meta?.changes ?? 0) !== 1) throw new Error('MAILBOX_SUSPENSION_NOT_APPLIED')
          } catch {
            throw createError({ statusCode: 503, statusMessage: 'Une règle Cloudflare conflictuelle existe; la boîte n’a pas pu être suspendue automatiquement. Vérifie ses deux états avant usage.' })
          }
        }
      }
    }

    try {
      await db.prepare(`
        UPDATE platform_audit_log SET action = ?, details_json = ? WHERE id = ? AND actor_user_id = ?
      `).bind(
        routingStatus === 'configured' ? 'workspace_mailbox.routing_configured'
          : routingStatus === 'conflict' ? 'workspace_mailbox.routing_conflict'
            : 'workspace_mailbox.routing_manual_required',
        JSON.stringify({ address, domainId, routingStatus }), routingAuditId, actor.id,
      ).run()
    } catch {
      // The initial batch already records that routing setup was requested.
    }

    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseStatus(event, 201)
    return { mailboxId, workspaceId: domain.workspace_id, address, grantedUserIds: userIds, routingStatus, status: routingStatus === 'conflict' ? 'suspended' : 'active' }
  }

  const activeMembers = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM json_each(?) selected
    JOIN workspace_memberships wm ON wm.workspace_id = ? AND wm.user_id = selected.value AND wm.status = 'active'
    JOIN users u ON u.id = wm.user_id AND u.status = 'active'
  `).bind(usersJson, domain.workspace_id).first<{ count: number }>()
  if (Number(activeMembers?.count ?? 0) !== userIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Tous les membres sélectionnés doivent être actifs dans l’espace du domaine.' })
  }

  throw createError({ statusCode: 409, statusMessage: 'La boîte n’a pas pu être créée. Vérifie que son adresse est disponible.' })
})
