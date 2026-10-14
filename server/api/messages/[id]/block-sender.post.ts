import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope } from '../../../utils/account-auth'

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
  if (!message.mailbox_domain || !message.sender_address) {
    throw createError({ statusCode: 409, statusMessage: 'Cette adresse ne peut pas être bloquée.' })
  }

  const now = new Date().toISOString()
  await bindings.DB.batch([
    bindings.DB.prepare(`
      INSERT INTO blocked_senders (mailbox_domain, sender_address, created_at)
      SELECT ?, ?, ? FROM workspace_domains
      WHERE lower(workspace_domains.domain) = lower(?)
        AND ${workspaceDomainScope('workspace_domains.domain', user.id)}
      ON CONFLICT(mailbox_domain, sender_address) DO NOTHING
    `).bind(message.mailbox_domain, message.sender_address, now, message.mailbox_domain, user.activeWorkspaceId),
    bindings.DB.prepare(`
      UPDATE messages
      SET screener_state = 'blocked'
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ? AND folder = 'Screener' AND trashed_at IS NULL
        AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
    `).bind(message.mailbox_domain, message.sender_address, user.activeWorkspaceId),
  ])

  const count = await bindings.DB.prepare(`
    SELECT COUNT(*) AS count FROM messages
    WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ? AND folder = 'Screener' AND trashed_at IS NULL
      AND ${workspaceDomainScope('messages.mailbox_domain', user.id)}
  `).bind(message.mailbox_domain, message.sender_address, user.activeWorkspaceId).first<{ count: number }>()

  return { blocked: true, preservedMessages: count?.count ?? 0 }
})
