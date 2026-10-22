import type { AccountDb } from './account-auth'

export type ContactPhone = { label: string, number: string }
export type ContactPostalAddress = { label: string, address: string }

function parseRows<T extends { label: string }>(value: unknown, field: string, valueKey: string, maxValueLength: number) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 10) {
    throw createError({ statusCode: 400, statusMessage: `${field} : 10 entrées maximum.` })
  }
  const rows: T[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') throw createError({ statusCode: 400, statusMessage: `${field} invalide.` })
    const label = typeof item.label === 'string' ? item.label.trim() : ''
    const entry = typeof item[valueKey] === 'string' ? item[valueKey].trim() : ''
    if (!entry) continue
    if (label.length > 40 || entry.length > maxValueLength) {
      throw createError({ statusCode: 400, statusMessage: `${field} trop long.` })
    }
    if (valueKey === 'number' && !/\d/.test(entry)) {
      throw createError({ statusCode: 400, statusMessage: 'Le numéro de téléphone doit contenir au moins un chiffre.' })
    }
    rows.push({ label, [valueKey]: entry } as T)
  }
  return rows
}

export function parseContactPhones(value: unknown) {
  return parseRows<ContactPhone>(value, 'Téléphone', 'number', 80)
}

export function parseContactPostalAddresses(value: unknown) {
  return parseRows<ContactPostalAddress>(value, 'Adresse postale', 'address', 1000)
}

export function appendContactDetailStatements(
  db: AccountDb,
  workspaceId: string,
  contactId: string,
  now: string,
  phones: ContactPhone[] = [],
  postalAddresses: ContactPostalAddress[] = [],
) {
  const statements = []
  phones.forEach((phone, index) => statements.push(db.prepare(`
    INSERT INTO contact_phones (id, workspace_id, contact_id, label, number, is_primary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), workspaceId, contactId, phone.label, phone.number, index === 0 ? 1 : 0, now)))
  postalAddresses.forEach((item, index) => statements.push(db.prepare(`
    INSERT INTO contact_postal_addresses (id, workspace_id, contact_id, label, address, is_primary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), workspaceId, contactId, item.label, item.address, index === 0 ? 1 : 0, now)))
  return statements
}
