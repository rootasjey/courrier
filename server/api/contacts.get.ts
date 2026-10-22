import { getAccountDb, getWorkspaceUserFromContext, workspaceMessageScope } from '../utils/account-auth'
import { extractEmailAddresses } from '../utils/contact-access'

type ContactRow = {
  id: string
  display_name: string
  company: string
  address: string
  is_primary: number
  note_body: string | null
}

type MessageRow = {
  sender_name: string
  sender_address: string
  envelope_to: string
  subject: string
  is_outgoing: number
  timestamp: string
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const db = getAccountDb(event)

  const [contactResult, messageResult] = await Promise.all([
    db.prepare(`
      SELECT contacts.id, contacts.display_name, contacts.company, contact_addresses.address,
        contact_addresses.is_primary, contact_notes.body AS note_body
      FROM contacts
      JOIN contact_addresses ON contact_addresses.contact_id = contacts.id
        AND contact_addresses.workspace_id = contacts.workspace_id
      LEFT JOIN contact_notes ON contact_notes.contact_id = contacts.id
        AND contact_notes.workspace_id = contacts.workspace_id
      WHERE contacts.workspace_id = ?
      ORDER BY contacts.display_name COLLATE NOCASE ASC,
        contact_addresses.is_primary DESC, contact_addresses.address COLLATE NOCASE ASC
    `).bind(user.activeWorkspaceId).all<ContactRow>(),
    db.prepare(`
      SELECT messages.sender_name, messages.sender_address, messages.envelope_to,
        messages.subject, messages.is_outgoing,
        COALESCE(messages.sent_at, messages.received_at) AS timestamp
      FROM messages
      WHERE ${workspaceMessageScope('messages', user.id)}
      ORDER BY timestamp DESC
    `).bind(user.activeWorkspaceId).all<MessageRow>(),
  ])

  const activity = new Map<string, { name: string, count: number, timestamp: string, subject: string }>()
  for (const message of messageResult.results) {
    const addresses = message.is_outgoing
      ? extractEmailAddresses(message.envelope_to)
      : [(message.sender_address || '').trim().toLocaleLowerCase('en-US')]
    for (const address of new Set(addresses.filter(Boolean))) {
      const existing = activity.get(address)
      if (existing) {
        existing.count += 1
        if (!existing.name && !message.is_outgoing) existing.name = message.sender_name.trim()
        continue
      }
      activity.set(address, {
        name: message.is_outgoing ? '' : message.sender_name.trim(),
        count: 1,
        timestamp: message.timestamp,
        subject: message.subject.trim(),
      })
    }
  }

  const contacts = new Map<string, {
    id: string
    displayName: string
    company: string
    addresses: { address: string, isPrimary: boolean }[]
    note: string | null
    lastMessageAt: string | null
    messageCount: number
    latestSubject: string
    profileAddress: string
  }>()
  const savedAddresses = new Set<string>()
  for (const row of contactResult.results) {
    const address = row.address.trim().toLocaleLowerCase('en-US')
    savedAddresses.add(address)
    const message = activity.get(address)
    let contact = contacts.get(row.id)
    if (!contact) {
      contact = {
        id: row.id,
        displayName: row.display_name,
        company: row.company,
        addresses: [],
        note: row.note_body,
        lastMessageAt: message?.timestamp || null,
        messageCount: 0,
        latestSubject: message?.subject || '',
        profileAddress: address,
      }
      contacts.set(row.id, contact)
    }
    contact.addresses.push({ address: row.address, isPrimary: Boolean(row.is_primary) })
    if (!message) continue
    contact.messageCount += message.count
    if (!contact.lastMessageAt || message.timestamp > contact.lastMessageAt) {
      contact.lastMessageAt = message.timestamp
      contact.latestSubject = message.subject
      contact.profileAddress = address
    }
  }

  const recentSenders = [...activity.entries()]
    .filter(([address]) => !savedAddresses.has(address))
    .map(([address, message]) => ({ address, displayName: message.name || address, ...message }))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 500)

  return {
    contacts: [...contacts.values()].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    recentSenders,
  }
})
