import { getAccountDb, getWorkspaceUserFromContext } from '../../utils/account-auth'
import { isValidContactAddress, normalizeContactAddress } from '../../utils/contact-access'
import { appendContactDetailStatements, parseContactPhones, parseContactPostalAddresses } from '../../utils/contact-details'

type ImportCard = { displayName?: unknown, addresses?: unknown, company?: unknown, phones?: unknown, postalAddresses?: unknown }

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const body = await readBody<{ contacts?: ImportCard[] }>(event)
  const cards = body?.contacts
  if (!Array.isArray(cards) || cards.length > 100) throw createError({ statusCode: 400, statusMessage: 'L’import accepte au maximum 100 contacts à la fois.' })
  const db = getAccountDb(event)
  const used = new Set<string>()
  const imported: string[] = []
  const duplicates: string[] = []
  const importedContacts: { id: string, primaryAddress: string }[] = []
  for (const card of cards) {
    const name = typeof card?.displayName === 'string' ? card.displayName.trim().slice(0, 120) : ''
    const company = typeof card?.company === 'string' ? card.company.trim().slice(0, 120) : ''
    const raw = Array.isArray(card?.addresses) ? card.addresses : []
    if (raw.length > 10) {
      duplicates.push(name || 'Contact')
      continue
    }
    const addresses = [...new Set(raw.map(normalizeContactAddress).filter(address => isValidContactAddress(address)))].slice(0, 10)
    if (!addresses.length) continue
    const phones = parseContactPhones(card?.phones) || []
    const postalAddresses = parseContactPostalAddresses(card?.postalAddresses) || []
    const key = addresses.find(address => used.has(address))
    const placeholders = addresses.map(() => '?').join(', ')
    const conflict = key || (await db.prepare(`SELECT lower(address) AS address FROM contact_addresses WHERE workspace_id = ? AND lower(address) IN (${placeholders}) LIMIT 1`)
      .bind(user.activeWorkspaceId, ...addresses).first<{ address: string }>())?.address
    if (conflict) {
      duplicates.push(name || addresses[0]!)
      addresses.forEach(address => used.add(address))
      continue
    }
    addresses.forEach(address => used.add(address))
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const statements = [db.prepare(`INSERT INTO contacts (id, workspace_id, display_name, company, created_by_name, updated_by_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.activeWorkspaceId, name || addresses[0], company, user.displayName, user.displayName, now, now)]
    addresses.forEach((address, index) => statements.push(db.prepare(`INSERT INTO contact_addresses (workspace_id, contact_id, address, is_primary, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(user.activeWorkspaceId, id, address, index === 0 ? 1 : 0, now)))
    statements.push(...appendContactDetailStatements(db, user.activeWorkspaceId, id, now, phones, postalAddresses))
    try { await db.batch(statements); imported.push(name || addresses[0]!); importedContacts.push({ id, primaryAddress: addresses[0]! }) }
    catch { duplicates.push(name || addresses[0]!) }
  }
  return { imported, duplicates, importedContacts, importedCount: imported.length, duplicateCount: duplicates.length }
})
