import { getQuery } from 'h3'
import { getAccountDb, getWorkspaceUserFromContext, workspaceMessageScope } from '../../utils/account-auth'
import { extractEmailAddresses, isValidContactAddress, normalizeContactAddress } from '../../utils/contact-access'
import { contactLogoUrl } from '../../utils/contact-logo'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const rawAddresses = getQuery(event).addresses
  const addresses = [...new Set((typeof rawAddresses === 'string' ? rawAddresses : '')
    .split(',')
    .map(normalizeContactAddress)
    .filter(address => address && isValidContactAddress(address)))]

  if (addresses.length > 30) {
    throw createError({ statusCode: 400, statusMessage: 'Trop d’adresses à traiter en une fois.' })
  }
  if (!addresses.length) return { avatars: {} }

  const db = getAccountDb(event)
  const placeholders = addresses.map(() => '?').join(', ')
  const candidates = await db.prepare(`
    SELECT sender_address, envelope_from, envelope_to
    FROM messages
    WHERE ${workspaceMessageScope('messages', user.id)}
      AND (
        lower(trim(sender_address)) IN (${placeholders})
        OR ${addresses.map(() => 'instr(lower(envelope_from), ?) > 0').join(' OR ')}
        OR ${addresses.map(() => 'instr(lower(envelope_to), ?) > 0').join(' OR ')}
      )
  `).bind(user.activeWorkspaceId, ...addresses, ...addresses, ...addresses).all<{
    sender_address: string
    envelope_from: string
    envelope_to: string
  }>()
  const requested = new Set(addresses)
  const accessibleSet = new Set<string>()
  for (const message of candidates.results) {
    const sender = normalizeContactAddress(message.sender_address)
    if (requested.has(sender)) accessibleSet.add(sender)
    for (const address of [...extractEmailAddresses(message.envelope_from), ...extractEmailAddresses(message.envelope_to)]) {
      if (requested.has(address)) accessibleSet.add(address)
    }
  }
  const accessible = addresses.filter(address => accessibleSet.has(address))
  if (!accessible.length) return { avatars: {} }

  const accessiblePlaceholders = accessible.map(() => '?').join(', ')
  const contacts = await db.prepare(`
    SELECT lower(contact_addresses.address) AS address, contacts.id, contacts.avatar_object_key, contacts.updated_at
    FROM contact_addresses
    JOIN contacts ON contacts.id = contact_addresses.contact_id
      AND contacts.workspace_id = contact_addresses.workspace_id
    WHERE contact_addresses.workspace_id = ?
      AND lower(contact_addresses.address) IN (${accessiblePlaceholders})
  `).bind(user.activeWorkspaceId, ...accessible).all<{
    address: string
    id: string
    avatar_object_key: string | null
    updated_at: string
  }>()
  const contactByAddress = new Map(contacts.results.map(contact => [contact.address, contact]))
  const logoKey = (event.context.cloudflare?.env as { LOGO_DEV_PUBLISHABLE_KEY?: string } | undefined)?.LOGO_DEV_PUBLISHABLE_KEY

  return {
    avatars: Object.fromEntries(accessible.map((address) => {
      const contact = contactByAddress.get(address)
      return [address, {
        avatarUrl: contact?.avatar_object_key ? `/api/contacts/${contact.id}/avatar?v=${encodeURIComponent(contact.updated_at)}` : null,
        logoUrl: contactLogoUrl(address, logoKey),
      }]
    })),
  }
})
