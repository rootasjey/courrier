type MailFolder = 'Imbox' | 'The Feed' | 'Paper Trail'

type ClassificationBindings = {
  DB?: D1Database
}

type SenderRuleRow = {
  folder: MailFolder
  last_change_id: string | null
}

const folders = new Set<MailFolder>(['Imbox', 'The Feed', 'Paper Trail'])

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as ClassificationBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const messageId = getRouterParam(event, 'id')
  if (!messageId) throw createError({ statusCode: 400, statusMessage: 'Message manquant.' })

  const body = await readBody<{ folder?: unknown }>(event)
  if (typeof body?.folder !== 'string' || !folders.has(body.folder as MailFolder)) {
    throw createError({ statusCode: 400, statusMessage: 'Boîte de destination invalide.' })
  }

  const folder = body.folder as MailFolder
  const message = await bindings.DB.prepare(`
    SELECT mailbox_domain, lower(trim(sender_address)) AS sender_address
    FROM messages
    WHERE id = ?
  `).bind(messageId).first<{ mailbox_domain: string, sender_address: string }>()

  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message introuvable.' })
  if (!message.mailbox_domain || !message.sender_address) {
    throw createError({ statusCode: 409, statusMessage: 'Cet expéditeur ne peut pas encore être classé.' })
  }

  const previousRule = await bindings.DB.prepare(`
    SELECT folder, last_change_id FROM sender_rules
    WHERE mailbox_domain = ? AND sender_address = ?
  `).bind(message.mailbox_domain, message.sender_address).first<SenderRuleRow>()

  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const changeId = crypto.randomUUID()
  let previousChangeId: string | null = null

  if (previousRule?.last_change_id) {
    const activePreviousChange = await bindings.DB.prepare(`
      SELECT id FROM sender_rule_changes
      WHERE id = ? AND undone_at IS NULL AND expires_at > ?
    `).bind(previousRule.last_change_id, now).first<{ id: string }>()
    previousChangeId = activePreviousChange?.id ?? null
  }

  await bindings.DB.batch([
    bindings.DB.prepare(`
      DELETE FROM sender_rule_change_messages
      WHERE change_id IN (SELECT id FROM sender_rule_changes WHERE expires_at <= ?)
    `).bind(now),
    bindings.DB.prepare('DELETE FROM sender_rule_changes WHERE expires_at <= ?').bind(now),
    bindings.DB.prepare(`
      INSERT INTO sender_rule_changes (
        id, mailbox_domain, sender_address, previous_rule_folder, previous_change_id,
        next_folder, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      changeId,
      message.mailbox_domain,
      message.sender_address,
      previousRule?.folder ?? null,
      previousChangeId,
      folder,
      now,
      expiresAt,
    ),
    bindings.DB.prepare(`
      INSERT INTO sender_rule_change_messages (change_id, message_id, previous_folder)
      SELECT ?, id, folder FROM messages
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ? AND trashed_at IS NULL
    `).bind(changeId, message.mailbox_domain, message.sender_address),
    bindings.DB.prepare(`
      INSERT INTO sender_rules (
        mailbox_domain, sender_address, folder, created_at, updated_at, last_change_id
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(mailbox_domain, sender_address) DO UPDATE SET
        folder = excluded.folder,
        updated_at = excluded.updated_at,
        last_change_id = excluded.last_change_id
    `).bind(message.mailbox_domain, message.sender_address, folder, now, now, changeId),
    bindings.DB.prepare(`
      UPDATE messages
      SET folder = ?
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ? AND trashed_at IS NULL
    `).bind(folder, message.mailbox_domain, message.sender_address),
  ])

  const { results } = await bindings.DB.prepare(`
    SELECT COUNT(*) AS count FROM messages
    WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ? AND trashed_at IS NULL
  `).bind(message.mailbox_domain, message.sender_address).all<{ count: number }>()

  return {
    folder,
    affectedMessages: results[0]?.count ?? 0,
    undoId: changeId,
    undoExpiresAt: expiresAt,
  }
})
