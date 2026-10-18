import { getQuery } from 'h3'
import { getAccountDb, getWorkspaceUserFromContext, workspaceMessageScope } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const query = typeof getQuery(event).q === 'string' ? getQuery(event).q.trim().slice(0, 80) : ''
  if (query.length < 2) return []

  // Contact names and their addresses are already scoped to the active workspace.
  const escaped = `%${query.replace(/[!%_]/g, '!$&')}%`
  const db = getAccountDb(event)
  const savedContacts = await db.prepare(`
    SELECT contact_addresses.address, contacts.display_name
    FROM contact_addresses
    JOIN contacts ON contacts.id = contact_addresses.contact_id
      AND contacts.workspace_id = contact_addresses.workspace_id
    WHERE contacts.workspace_id = ?
      AND (contacts.display_name LIKE ? ESCAPE '!' OR contact_addresses.address LIKE ? ESCAPE '!')
    ORDER BY contact_addresses.is_primary DESC, contacts.display_name COLLATE NOCASE ASC,
      contact_addresses.address COLLATE NOCASE ASC
    LIMIT 12
  `).bind(user.activeWorkspaceId, escaped, escaped).all<{ address: string, display_name: string }>()

  const knownSenders = await db.prepare(`
    SELECT lower(trim(messages.sender_address)) AS address,
      COALESCE(
        MAX(NULLIF(trim(contacts.display_name), '')),
        MAX(NULLIF(trim(messages.sender_name), '')),
        lower(trim(messages.sender_address))
      ) AS display_name,
      MAX(COALESCE(messages.sent_at, messages.received_at)) AS last_message_at
    FROM messages
    LEFT JOIN contact_addresses ON contact_addresses.workspace_id = ?
      AND lower(trim(contact_addresses.address)) = lower(trim(messages.sender_address))
    LEFT JOIN contacts ON contacts.id = contact_addresses.contact_id
      AND contacts.workspace_id = contact_addresses.workspace_id
    WHERE ${workspaceMessageScope('messages', user.id)}
      AND COALESCE(messages.is_outgoing, 0) = 0
      AND trim(messages.sender_address) <> ''
      AND (contacts.display_name LIKE ? ESCAPE '!'
        OR messages.sender_name LIKE ? ESCAPE '!'
        OR messages.sender_address LIKE ? ESCAPE '!')
    GROUP BY lower(trim(messages.sender_address))
    ORDER BY last_message_at DESC, display_name COLLATE NOCASE ASC
    LIMIT 24
  `).bind(user.activeWorkspaceId, user.activeWorkspaceId, escaped, escaped, escaped).all<{ address: string, display_name: string }>()

  const seen = new Set<string>()
  return [...savedContacts.results, ...knownSenders.results].flatMap((row) => {
    const address = row.address.trim()
    const normalized = address.toLocaleLowerCase()
    if (!address || seen.has(normalized)) return []
    seen.add(normalized)
    return [{ address, displayName: row.display_name.trim() || address }]
  })
})
