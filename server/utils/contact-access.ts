import type { AccountDb } from './account-auth'
import { workspaceMessageScope } from './account-auth'

export type ContactAddress = {
  address: string
  is_primary: number
}

export function normalizeContactAddress(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toLocaleLowerCase('en-US')
}

export function isValidContactAddress(address: string) {
  return address.length <= 254
    && /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/.test(address)
}

export function extractEmailAddresses(value: unknown) {
  if (typeof value !== 'string') return []
  const matches = value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || []
  return matches.map(address => normalizeContactAddress(address))
}

export async function hasAccessibleContactAddress(
  db: AccountDb,
  userId: string,
  workspaceId: string,
  address: string,
) {
  const candidates = await db.prepare(`
    SELECT messages.sender_address, messages.envelope_from, messages.envelope_to
    FROM messages
    WHERE ${workspaceMessageScope('messages', userId)}
      AND (
        lower(trim(messages.sender_address)) = ?
        OR instr(lower(messages.envelope_from), ?) > 0
        OR instr(lower(messages.envelope_to), ?) > 0
      )
  `).bind(workspaceId, address, address, address).all<{
    sender_address: string
    envelope_from: string
    envelope_to: string
  }>()

  return candidates.results.some((message) => {
    const sender = normalizeContactAddress(message.sender_address)
    return sender === address
      || extractEmailAddresses(message.envelope_from).includes(address)
      || extractEmailAddresses(message.envelope_to).includes(address)
  })
}

export async function getAccessibleContactAddresses(
  db: AccountDb,
  userId: string,
  workspaceId: string,
  contactId: string,
) {
  const result = await db.prepare(`
    SELECT address, is_primary
    FROM contact_addresses
    WHERE workspace_id = ? AND contact_id = ?
    ORDER BY is_primary DESC, address COLLATE NOCASE ASC
  `).bind(workspaceId, contactId).all<ContactAddress>()

  if (!result.results.length) throw createError({ statusCode: 404, statusMessage: 'Fiche contact introuvable.' })
  const accessible = await Promise.all(result.results.map(async (row) => ({
    ...row,
    accessible: await hasAccessibleContactAddress(db, userId, workspaceId, row.address),
  })))
  if (!accessible.some(row => row.accessible)) {
    throw createError({ statusCode: 404, statusMessage: 'Fiche contact introuvable.' })
  }
  return result.results
}
