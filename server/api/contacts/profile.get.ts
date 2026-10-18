import { getQuery } from 'h3'
import { getAccountDb, getWorkspaceUserFromContext, workspaceMessageScope } from '../../utils/account-auth'
import { hasAccessibleContactAddress, isValidContactAddress, normalizeContactAddress } from '../../utils/contact-access'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const address = normalizeContactAddress(getQuery(event).address)
  if (!isValidContactAddress(address)) {
    throw createError({ statusCode: 400, statusMessage: 'Adresse e-mail invalide.' })
  }

  const db = getAccountDb(event)
  if (!await hasAccessibleContactAddress(db, user.id, user.activeWorkspaceId, address)) {
    throw createError({ statusCode: 404, statusMessage: 'Aucun message accessible ne correspond à cette adresse.' })
  }

  const senderHint = await db.prepare(`
    SELECT messages.sender_name FROM messages
    WHERE ${workspaceMessageScope('messages', user.id)}
      AND lower(trim(messages.sender_address)) = ?
    ORDER BY COALESCE(messages.sent_at, messages.received_at) DESC
    LIMIT 1
  `).bind(user.activeWorkspaceId, address).first<{ sender_name: string }>()

  const contact = await db.prepare(`
    SELECT contacts.id, contacts.display_name, contacts.created_by_name, contacts.updated_by_name,
      contacts.created_at, contacts.updated_at,
      contact_notes.body AS note_body, contact_notes.created_by_name AS note_created_by_name,
      contact_notes.updated_by_name AS note_updated_by_name,
      contact_notes.created_at AS note_created_at, contact_notes.updated_at AS note_updated_at
    FROM contact_addresses
    JOIN contacts ON contacts.id = contact_addresses.contact_id
      AND contacts.workspace_id = contact_addresses.workspace_id
    LEFT JOIN contact_notes ON contact_notes.contact_id = contacts.id
      AND contact_notes.workspace_id = contacts.workspace_id
    WHERE contact_addresses.workspace_id = ? AND lower(contact_addresses.address) = ?
    LIMIT 1
  `).bind(user.activeWorkspaceId, address).first<{
    id: string
    display_name: string
    created_by_name: string
    updated_by_name: string
    created_at: string
    updated_at: string
    note_body: string | null
    note_created_by_name: string | null
    note_updated_by_name: string | null
    note_created_at: string | null
    note_updated_at: string | null
  }>()

  if (!contact) return { contact: null, suggestedName: senderHint?.sender_name?.trim() || '' }

  const addressResult = await db.prepare(`
    SELECT address, is_primary FROM contact_addresses
    WHERE workspace_id = ? AND contact_id = ?
    ORDER BY is_primary DESC, address COLLATE NOCASE ASC
  `).bind(user.activeWorkspaceId, contact.id).all<{ address: string, is_primary: number }>()

  return {
    suggestedName: senderHint?.sender_name?.trim() || '',
    contact: {
      id: contact.id,
      displayName: contact.display_name,
      addresses: addressResult.results.map(row => ({ address: row.address, isPrimary: Boolean(row.is_primary) })),
      createdBy: contact.created_by_name,
      updatedBy: contact.updated_by_name,
      createdAt: contact.created_at,
      updatedAt: contact.updated_at,
      note: contact.note_body ? {
        body: contact.note_body,
        createdBy: contact.note_created_by_name || '',
        updatedBy: contact.note_updated_by_name || '',
        createdAt: contact.note_created_at,
        updatedAt: contact.note_updated_at,
      } : null,
    },
  }
})
