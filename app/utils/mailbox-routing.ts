export type MailboxKey = 'Screener' | 'Imbox' | 'The Feed' | 'Paper Trail' | 'Reply Later' | 'Set Aside' | 'Trash'

export const mailboxes: {
  name: MailboxKey
  label: 'Inbox' | 'Feed' | 'Paper' | 'Reply Later' | 'Set Aside' | 'Screener' | 'Corbeille'
  slug: 'inbox' | 'feed' | 'paper' | 'reply-later' | 'set-aside' | 'screener' | 'trash'
  description: string
}[] = [
  { name: 'Screener', label: 'Screener', slug: 'screener', description: 'Nouveaux expéditeurs' },
  { name: 'Imbox', label: 'Inbox', slug: 'inbox', description: 'À lire et à traiter' },
  { name: 'The Feed', label: 'Feed', slug: 'feed', description: 'Newsletters et lectures' },
  { name: 'Paper Trail', label: 'Paper', slug: 'paper', description: 'Reçus et confirmations' },
  { name: 'Reply Later', label: 'Reply Later', slug: 'reply-later', description: 'Réponses à préparer' },
  { name: 'Set Aside', label: 'Set Aside', slug: 'set-aside', description: 'À garder sous la main' },
  { name: 'Trash', label: 'Corbeille', slug: 'trash', description: 'Messages mis de côté' },
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
