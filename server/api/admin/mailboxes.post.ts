import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { AdminMailboxInputError, parseAdminMailboxPayload, type AdminMailboxPayload } from '../../utils/admin-mailbox-input'

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

  try {
    const results = await db.batch([
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
    ])

    const inserted = Number((results[0] as MailboxInsertResult | undefined)?.meta?.changes ?? 0) > 0
    const granted = Number((results[1] as MailboxInsertResult | undefined)?.meta?.changes ?? 0)
    if (inserted && granted === userIds.length) {
      setResponseHeader(event, 'Cache-Control', 'private, no-store')
      setResponseStatus(event, 201)
      return { mailboxId, workspaceId: domain.workspace_id, address, grantedUserIds: userIds }
    }
  } catch (error) {
    const existing = await db.prepare(`
      SELECT 1 AS found FROM mailboxes WHERE address = ? COLLATE NOCASE LIMIT 1
    `).bind(address).first<{ found: number }>()
    if (existing) throw createError({ statusCode: 409, statusMessage: 'Cette adresse existe déjà.' })
    throw error
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
