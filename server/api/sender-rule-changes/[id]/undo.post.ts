type UndoBindings = {
  DB?: D1Database
}

type SenderRuleChangeRow = {
  id: string
  mailbox_domain: string
  sender_address: string
  previous_rule_folder: 'Imbox' | 'The Feed' | 'Paper Trail' | null
  previous_change_id: string | null
  next_folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  expires_at: string
  undone_at: string | null
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as UndoBindings | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des emails n’est pas prêt.' })
  }

  const changeId = getRouterParam(event, 'id')
  if (!changeId) throw createError({ statusCode: 400, statusMessage: 'Changement manquant.' })

  const change = await bindings.DB.prepare(`
    SELECT id, mailbox_domain, sender_address, previous_rule_folder, previous_change_id,
      next_folder, expires_at, undone_at
    FROM sender_rule_changes WHERE id = ?
  `).bind(changeId).first<SenderRuleChangeRow>()

  if (!change) throw createError({ statusCode: 404, statusMessage: 'Annulation introuvable ou expirée.' })
  if (change.undone_at || change.expires_at <= new Date().toISOString()) {
    throw createError({ statusCode: 410, statusMessage: 'Cette annulation n’est plus disponible.' })
  }

  const now = new Date().toISOString()
  const guard = `EXISTS (
    SELECT 1 FROM sender_rule_changes
    WHERE id = ? AND undone_at = ?
  )`

  const statements = await bindings.DB.batch([
    bindings.DB.prepare(`
      UPDATE sender_rule_changes SET undone_at = ?
      WHERE id = ? AND undone_at IS NULL AND expires_at > ?
        AND EXISTS (
          SELECT 1 FROM sender_rules
          WHERE mailbox_domain = sender_rule_changes.mailbox_domain
            AND sender_address = sender_rule_changes.sender_address
            AND last_change_id = sender_rule_changes.id
        )
    `).bind(now, changeId, now),
    bindings.DB.prepare(`
      UPDATE messages
      SET folder = (
        SELECT previous_folder FROM sender_rule_change_messages
        WHERE change_id = ? AND message_id = messages.id
      )
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ?
        AND id IN (SELECT message_id FROM sender_rule_change_messages WHERE change_id = ?)
        AND is_set_aside = 0
        AND ${guard}
    `).bind(changeId, change.mailbox_domain, change.sender_address, changeId, changeId, now),
    bindings.DB.prepare(`
      UPDATE messages SET folder = ?
      WHERE mailbox_domain = ? AND lower(trim(sender_address)) = ?
        AND id NOT IN (SELECT message_id FROM sender_rule_change_messages WHERE change_id = ?)
        AND is_set_aside = 0
        AND ${guard}
    `).bind(
      change.previous_rule_folder ?? 'Screener',
      change.mailbox_domain,
      change.sender_address,
      changeId,
      changeId,
      now,
    ),
    bindings.DB.prepare(`
      UPDATE thread_merges
      SET folder = (
        SELECT previous_folder FROM sender_rule_change_merges
        WHERE change_id = ? AND merge_id = thread_merges.id
      )
      WHERE mailbox_domain = ?
        AND id IN (SELECT merge_id FROM sender_rule_change_merges WHERE change_id = ?)
        AND ${guard}
    `).bind(changeId, change.mailbox_domain, changeId, changeId, now),
    change.previous_rule_folder
      ? bindings.DB.prepare(`
          UPDATE sender_rules SET folder = ?, last_change_id = ?, updated_at = ?
          WHERE mailbox_domain = ? AND sender_address = ? AND last_change_id = ? AND ${guard}
        `).bind(
          change.previous_rule_folder,
          change.previous_change_id,
          now,
          change.mailbox_domain,
          change.sender_address,
          changeId,
          changeId,
          now,
        )
      : bindings.DB.prepare(`
          DELETE FROM sender_rules
          WHERE mailbox_domain = ? AND sender_address = ? AND last_change_id = ? AND ${guard}
        `).bind(change.mailbox_domain, change.sender_address, changeId, changeId, now),
  ])

  if (!statements[0]?.meta.changes) {
    throw createError({ statusCode: 409, statusMessage: 'La règle a changé ; recharge la boîte avant de réessayer.' })
  }

  return {
    id: changeId,
    restoredMessages: (statements[1]?.meta.changes ?? 0) + (statements[2]?.meta.changes ?? 0),
  }
})
