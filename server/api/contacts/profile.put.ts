import { getAccountDb, getWorkspaceUserFromContext } from '../../utils/account-auth'
import { hasAccessibleContactAddress, isValidContactAddress, normalizeContactAddress } from '../../utils/contact-access'
import { appendContactDetailStatements, parseContactPhones, parseContactPostalAddresses } from '../../utils/contact-details'

type ProfileBody = {
  id?: string
  sourceAddress?: string
  displayName?: string
  primaryAddress?: string
  secondaryAddresses?: string[]
  company?: unknown
  phones?: unknown
  postalAddresses?: unknown
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const body = await readBody<ProfileBody>(event)
  const sourceAddress = normalizeContactAddress(body?.sourceAddress)
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const primaryAddress = normalizeContactAddress(body?.primaryAddress)
  const rawSecondaryAddresses: unknown[] = Array.isArray(body?.secondaryAddresses) ? body.secondaryAddresses : []
  const secondaryAddresses = rawSecondaryAddresses.map(normalizeContactAddress).filter(Boolean)
  const company = typeof body?.company === 'string' ? body.company.trim() : ''
  if (body?.company !== undefined && typeof body.company !== 'string') throw createError({ statusCode: 400, statusMessage: 'La société est invalide.' })
  if (company.length > 120) throw createError({ statusCode: 400, statusMessage: 'Le nom de la société ne peut pas dépasser 120 caractères.' })
  const phones = parseContactPhones(body?.phones)
  const postalAddresses = parseContactPostalAddresses(body?.postalAddresses)

  if (!isValidContactAddress(sourceAddress) || !isValidContactAddress(primaryAddress)) {
    throw createError({ statusCode: 400, statusMessage: 'Vérifie l’adresse principale et l’adresse du contact.' })
  }
  if (!displayName || displayName.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Le nom doit contenir entre 1 et 120 caractères.' })
  }
  if ((body?.secondaryAddresses !== undefined && !Array.isArray(body.secondaryAddresses))
    || rawSecondaryAddresses.length > 9
    || rawSecondaryAddresses.some(address => typeof address !== 'string')
    || secondaryAddresses.some(address => !isValidContactAddress(address))) {
    throw createError({ statusCode: 400, statusMessage: 'Une adresse secondaire est invalide ou la limite de 9 adresses est dépassée.' })
  }
  if (new Set([primaryAddress, ...secondaryAddresses]).size !== 1 + secondaryAddresses.length) {
    throw createError({ statusCode: 400, statusMessage: 'Chaque adresse doit être unique.' })
  }
  const db = getAccountDb(event)
  const bySource = await db.prepare(`
    SELECT contact_id FROM contact_addresses
    WHERE workspace_id = ? AND lower(address) = ? LIMIT 1
  `).bind(user.activeWorkspaceId, sourceAddress).first<{ contact_id: string }>()
  if (body.id && bySource && bySource.contact_id !== body.id) {
    throw createError({ statusCode: 409, statusMessage: 'Cette adresse est déjà rattachée à une autre fiche.' })
  }
  const contactId = body.id || bySource?.contact_id || crypto.randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de fiche contact invalide.' })
  }

  const existing = await db.prepare(`
    SELECT id FROM contacts WHERE id = ? AND workspace_id = ? LIMIT 1
  `).bind(contactId, user.activeWorkspaceId).first<{ id: string }>()
  if (body.id && !existing) throw createError({ statusCode: 404, statusMessage: 'Fiche contact introuvable.' })
  if (!existing && !await hasAccessibleContactAddress(db, user.id, user.activeWorkspaceId, sourceAddress)) {
    throw createError({ statusCode: 404, statusMessage: 'Aucun message accessible ne correspond à cette adresse.' })
  }
  if (body.id) {
    const currentAddresses = await db.prepare(`
      SELECT address FROM contact_addresses WHERE workspace_id = ? AND contact_id = ?
    `).bind(user.activeWorkspaceId, contactId).all<{ address: string }>()
    if (!currentAddresses.results.some(row => normalizeContactAddress(row.address) === sourceAddress)) {
      throw createError({ statusCode: 409, statusMessage: 'L’adresse de départ ne correspond pas à cette fiche.' })
    }
  }

  const addresses = [...new Set([primaryAddress, ...secondaryAddresses])]
  const accessibleAddresses = await Promise.all(addresses.map(address =>
    hasAccessibleContactAddress(db, user.id, user.activeWorkspaceId, address),
  ))
  if (!existing && !accessibleAddresses.some(Boolean)) {
    throw createError({ statusCode: 400, statusMessage: 'Conserve au moins une adresse liée à des échanges accessibles.' })
  }
  const placeholders = addresses.map(() => '?').join(', ')
  const conflict = await db.prepare(`
    SELECT address FROM contact_addresses
    WHERE workspace_id = ? AND lower(address) IN (${placeholders}) AND contact_id <> ?
    LIMIT 1
  `).bind(user.activeWorkspaceId, ...addresses, contactId).first<{ address: string }>()
  if (conflict) throw createError({ statusCode: 409, statusMessage: 'Cette adresse appartient déjà à une autre fiche.' })

  const now = new Date().toISOString()
  const statements = existing
    ? [
        db.prepare(`UPDATE contacts SET display_name = ?, company = COALESCE(?, company), updated_by_name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
          .bind(displayName, body.company === undefined ? null : company, user.displayName, now, contactId, user.activeWorkspaceId),
        db.prepare(`DELETE FROM contact_addresses WHERE workspace_id = ? AND contact_id = ?`)
          .bind(user.activeWorkspaceId, contactId),
      ]
    : [db.prepare(`
        INSERT INTO contacts (id, workspace_id, display_name, company, created_by_name, updated_by_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(contactId, user.activeWorkspaceId, displayName, company, user.displayName, user.displayName, now, now)]

  if (existing && phones !== undefined) {
    statements.push(db.prepare(`DELETE FROM contact_phones WHERE workspace_id = ? AND contact_id = ?`).bind(user.activeWorkspaceId, contactId))
  }
  if (existing && postalAddresses !== undefined) {
    statements.push(db.prepare(`DELETE FROM contact_postal_addresses WHERE workspace_id = ? AND contact_id = ?`).bind(user.activeWorkspaceId, contactId))
  }

  for (const address of addresses) {
    statements.push(db.prepare(`
      INSERT INTO contact_addresses (workspace_id, contact_id, address, is_primary, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(user.activeWorkspaceId, contactId, address, address === primaryAddress ? 1 : 0, now))
  }
  statements.push(...appendContactDetailStatements(db, user.activeWorkspaceId, contactId, now, phones, postalAddresses))

  try {
    await db.batch(statements)
  } catch (error) {
    console.error('Contact profile save failed', error)
    throw createError({ statusCode: 409, statusMessage: 'La fiche n’a pas pu être enregistrée. Vérifie les adresses puis réessaie.' })
  }

  return { id: contactId, displayName, primaryAddress, secondaryAddresses: addresses.filter(address => address !== primaryAddress) }
})
