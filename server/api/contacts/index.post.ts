import { getAccountDb, getWorkspaceUserFromContext } from '../../utils/account-auth'
import { isValidContactAddress, normalizeContactAddress } from '../../utils/contact-access'
import { appendContactDetailStatements, parseContactPhones, parseContactPostalAddresses } from '../../utils/contact-details'

type ContactInput = { displayName?: unknown, addresses?: unknown, note?: unknown, company?: unknown, phones?: unknown, postalAddresses?: unknown }

function parseContact(input: ContactInput) {
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  const raw = Array.isArray(input.addresses) ? input.addresses : []
  const addresses = raw.map(normalizeContactAddress)
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  const company = typeof input.company === 'string' ? input.company.trim() : ''
  if (input.company !== undefined && typeof input.company !== 'string') throw createError({ statusCode: 400, statusMessage: 'La société est invalide.' })
  if (company.length > 120) throw createError({ statusCode: 400, statusMessage: 'Le nom de la société ne peut pas dépasser 120 caractères.' })
  const phones = parseContactPhones(input.phones) || []
  const postalAddresses = parseContactPostalAddresses(input.postalAddresses) || []
  if (!displayName || displayName.length > 120) throw createError({ statusCode: 400, statusMessage: 'Le nom doit contenir entre 1 et 120 caractères.' })
  if (!raw.length || raw.length > 10 || raw.some((item, i) => typeof item !== 'string' || !isValidContactAddress(addresses[i]!))) {
    throw createError({ statusCode: 400, statusMessage: 'Ajoute entre 1 et 10 adresses e-mail valides.' })
  }
  if (new Set(addresses).size !== addresses.length) throw createError({ statusCode: 400, statusMessage: 'Chaque adresse doit être unique.' })
  if (note.length > 10_000) throw createError({ statusCode: 400, statusMessage: 'La note ne peut pas dépasser 10 000 caractères.' })
  return { displayName, addresses, note, company, phones, postalAddresses }
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const input = parseContact(await readBody<ContactInput>(event) || {})
  const db = getAccountDb(event)
  const placeholders = input.addresses.map(() => '?').join(', ')
  const conflict = await db.prepare(`SELECT address FROM contact_addresses WHERE workspace_id = ? AND lower(address) IN (${placeholders}) LIMIT 1`)
    .bind(user.activeWorkspaceId, ...input.addresses).first<{ address: string }>()
  if (conflict) throw createError({ statusCode: 409, statusMessage: 'Une de ces adresses appartient déjà à un contact.' })

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const statements = [db.prepare(`INSERT INTO contacts (id, workspace_id, display_name, company, created_by_name, updated_by_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.activeWorkspaceId, input.displayName, input.company, user.displayName, user.displayName, now, now)]
  input.addresses.forEach((address, index) => statements.push(db.prepare(`INSERT INTO contact_addresses (workspace_id, contact_id, address, is_primary, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(user.activeWorkspaceId, id, address, index === 0 ? 1 : 0, now)))
  if (input.note) statements.push(db.prepare(`INSERT INTO contact_notes (workspace_id, contact_id, body, created_by_name, updated_by_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(user.activeWorkspaceId, id, input.note, user.displayName, user.displayName, now, now))
  statements.push(...appendContactDetailStatements(db, user.activeWorkspaceId, id, now, input.phones, input.postalAddresses))
  try { await db.batch(statements) }
  catch { throw createError({ statusCode: 409, statusMessage: 'Le contact n’a pas pu être enregistré. Vérifie que ses adresses ne sont pas déjà utilisées.' }) }
  return { id, displayName: input.displayName, primaryAddress: input.addresses[0] }
})
