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
  const senderHint = await db.prepare(`
    SELECT messages.sender_name FROM messages
    WHERE ${workspaceMessageScope('messages', user.id)}
      AND lower(trim(messages.sender_address)) = ?
    ORDER BY COALESCE(messages.sent_at, messages.received_at) DESC
    LIMIT 1
  `).bind(user.activeWorkspaceId, address).first<{ sender_name: string }>()

  const contact = await db.prepare(`
    SELECT contacts.id, contacts.display_name, contacts.company, contacts.avatar_object_key, contacts.created_by_name, contacts.updated_by_name,
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
    company: string
    avatar_object_key: string | null
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

  if (!contact && !await hasAccessibleContactAddress(db, user.id, user.activeWorkspaceId, address)) {
    throw createError({ statusCode: 404, statusMessage: 'Aucun message accessible ne correspond à cette adresse.' })
  }
  if (!contact) return { contact: null, suggestedName: senderHint?.sender_name?.trim() || '' }

  const addressResult = await db.prepare(`
    SELECT address, is_primary FROM contact_addresses
    WHERE workspace_id = ? AND contact_id = ?
    ORDER BY is_primary DESC, address COLLATE NOCASE ASC
  `).bind(user.activeWorkspaceId, contact.id).all<{ address: string, is_primary: number }>()
  const [phoneResult, postalResult] = await Promise.all([
    db.prepare(`SELECT label, number, is_primary FROM contact_phones WHERE workspace_id = ? AND contact_id = ? ORDER BY is_primary DESC, label COLLATE NOCASE ASC, number ASC`)
      .bind(user.activeWorkspaceId, contact.id).all<{ label: string, number: string, is_primary: number }>(),
    db.prepare(`SELECT label, address, is_primary FROM contact_postal_addresses WHERE workspace_id = ? AND contact_id = ? ORDER BY is_primary DESC, label COLLATE NOCASE ASC`)
      .bind(user.activeWorkspaceId, contact.id).all<{ label: string, address: string, is_primary: number }>(),
  ])

  return {
    suggestedName: senderHint?.sender_name?.trim() || '',
    contact: {
      id: contact.id,
      displayName: contact.display_name,
      company: contact.company,
      avatarUrl: contact.avatar_object_key ? `/api/contacts/${contact.id}/avatar?v=${encodeURIComponent(contact.updated_at)}` : null,
      addresses: addressResult.results.map(row => ({ address: row.address, isPrimary: Boolean(row.is_primary) })),
      phones: phoneResult.results.map(row => ({ label: row.label, number: row.number, isPrimary: Boolean(row.is_primary) })),
      postalAddresses: postalResult.results.map(row => ({ label: row.label, address: row.address, isPrimary: Boolean(row.is_primary) })),
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
