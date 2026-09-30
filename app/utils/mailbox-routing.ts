export type MailboxKey = 'Screener' | 'Imbox' | 'The Feed' | 'Paper Trail'

export const mailboxes: {
  name: MailboxKey
  label: 'Inbox' | 'Feed' | 'Paper' | 'Screener'
  slug: 'inbox' | 'feed' | 'paper' | 'screener'
  description: string
}[] = [
  { name: 'Screener', label: 'Screener', slug: 'screener', description: 'Nouveaux expéditeurs' },
  { name: 'Imbox', label: 'Inbox', slug: 'inbox', description: 'À lire et à traiter' },
  { name: 'The Feed', label: 'Feed', slug: 'feed', description: 'Newsletters et lectures' },
  { name: 'Paper Trail', label: 'Paper', slug: 'paper', description: 'Reçus et confirmations' },
]

export function mailboxByName(name: MailboxKey) {
  return mailboxes.find(mailbox => mailbox.name === name) ?? mailboxes[1]!
}

export function mailboxBySlug(slug: string | undefined) {
  return mailboxes.find(mailbox => mailbox.slug === slug)
}

export function mailboxFromPath(path: string): MailboxKey {
  return mailboxBySlug(path.split('/')[2])?.name ?? 'Imbox'
}

export function threadIdFromPath(path: string) {
  const segments = path.split('/').filter(Boolean)
  if (segments.length !== 4 || segments[0] !== 'mail' || segments[2] !== 'threads') return ''

  try {
    return decodeURIComponent(segments[3]!)
  } catch {
    return ''
  }
}

export function mailboxPath(name: MailboxKey) {
  return `/mail/${mailboxByName(name).slug}`
}

export function threadPath(name: MailboxKey, threadId: string) {
  return `${mailboxPath(name)}/threads/${encodeURIComponent(threadId)}`
}
