type ThreadableMessage = {
  id: string
  message_id: string
  mailbox_domain: string
  folder: string
  in_reply_to: string | null
  references_header: string | null
}

function referenceIds(value: string | null) {
  if (!value) return []

  const bracketed = value.match(/<[^<>]+>/g)
  const candidates = bracketed?.length ? bracketed : value.trim().split(/\s+/)

  return [...new Set(candidates.map(id => id.trim()).filter(Boolean))]
}

/** Group only messages linked by RFC reply headers, within one mailbox and folder. */
export function getThreadIds(messages: ThreadableMessage[]) {
  const parent = new Map<string, string>()

  function find(id: string): string {
    const current = parent.get(id)
    if (!current) {
      parent.set(id, id)
      return id
    }
    if (current === id) return id

    const root = find(current)
    parent.set(id, root)
    return root
  }

  function union(olderMessageId: string, newerMessageId: string) {
    const olderRoot = find(olderMessageId)
    const newerRoot = find(newerMessageId)
    if (olderRoot !== newerRoot) parent.set(newerRoot, olderRoot)
  }

  function node(mailboxDomain: string, folder: string, messageId: string) {
    return `${mailboxDomain.toLocaleLowerCase('en-US')}\u0000${folder}\u0000${messageId}`
  }

  for (const message of messages) {
    const scope = { mailboxDomain: message.mailbox_domain, folder: message.folder }
    const ownId = node(scope.mailboxDomain, scope.folder, message.message_id)
    find(ownId)

    const references = [
      ...referenceIds(message.references_header),
      ...referenceIds(message.in_reply_to),
    ]

    for (const reference of references) {
      union(node(scope.mailboxDomain, scope.folder, reference), ownId)
    }
  }

  return new Map(messages.map((message) => {
    const ownId = node(message.mailbox_domain, message.folder, message.message_id)
    return [message.id, find(ownId)]
  }))
}
