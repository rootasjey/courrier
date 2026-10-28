import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope } from '../../../utils/account-auth'
import { canUnblockSender } from '../../../utils/blocked-sender-policy'
import { isAdministrativeActor } from '../../../utils/platform-admin-audit'

type BlockBindings = Pick<MailStorageBindings, 'DB'>

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as BlockBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const message = await bindings.DB.prepare(`
    SELECT mailbox_domain, lower(trim(sender_address)) AS sender_address
    FROM messages WHERE id = ? AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
  `).bind(messageId, user.activeWorkspaceId).first<{ mailbox_domain: string, sender_address: string }>()

  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })

  const now = new Date().toISOString()
  const auditAction = await isAdministrativeActor(
    bindings.DB,
    user.id,
    user.activeWorkspaceId,
  )
  const blockedSender = await bindings.DB.prepare(`
    SELECT created_by_user_id FROM blocked_senders
    WHERE mailbox_domain = ? AND sender_address = ?
      AND ${workspaceDomainScope('blocked_senders.mailbox_domain', user.id)}
    LIMIT 1
  `).bind(message.mailbox_domain, message.sender_address, user.activeWorkspaceId)
    .first<{ created_by_user_id: string | null }>()

  if (blockedSender && !canUnblockSender(user.id, blockedSender.created_by_user_id, auditAction)) {
    throw createError({ statusCode: 403, statusMessage: 'Seule la personne à l’origine du blocage ou un administrateur peut le retirer.' })
  }

  const statements = [bindings.DB.prepare(`
      DELETE FROM blocked_senders WHERE mailbox_domain = ? AND sender_address = ?
        AND ${workspaceDomainScope('blocked_senders.mailbox_domain', user.id)}
    `).bind(message.mailbox_domain, message.sender_address, user.activeWorkspaceId)]

  if (auditAction) {
    statements.push(bindings.DB.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'blocked_sender.unblock', 'blocked_sender', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(
      crypto.randomUUID(),
      user.id,
      `${message.mailbox_domain}:${message.sender_address}`,
      user.activeWorkspaceId,
      JSON.stringify({ mailboxDomain: message.mailbox_domain, senderAddress: message.sender_address }),
      now,
    ))
  }

  statements.push(bindings.DB.prepare(`
      UPDATE messages SET screener_state = 'pending'
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ?
        AND folder = 'Screener' AND screener_state = 'blocked'
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(message.mailbox_domain, message.sender_address, user.activeWorkspaceId))

  await bindings.DB.batch(statements)

  return { blocked: false }
})
