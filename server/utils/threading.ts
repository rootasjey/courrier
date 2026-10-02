export type ThreadableMessage = {
  id: string
  message_id: string
  mailbox_domain: string
  folder: string
  in_reply_to: string | null
  references_header: string | null
}

export type ManualThreadMergeMember = {
  merge_id: string
  mailbox_domain: string
  folder: string
  root_message_id: string
}

function referenceIds(value: string | null) {
  if (!value) return []

  const bracketed = value.match(/<[^<>]+>/g)
  const candidates = bracketed?.length ? bracketed : value.trim().split(/\s+/)

  return [...new Set(candidates.map(id => id.trim()).filter(Boolean))]
}

function node(mailboxDomain: string, folder: string, messageId: string) {
  return `${mailboxDomain.toLocaleLowerCase('en-US')}\u0000${folder}\u0000${messageId}`
}

/** Group messages by RFC reply headers and optional reversible manual merges. */
export function getThreadGrouping(
  messages: ThreadableMessage[],
  manualMerges: ManualThreadMergeMember[] = [],
) {
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

  function union(firstMessageId: string, secondMessageId: string) {
    const firstRoot = find(firstMessageId)
    const secondRoot = find(secondMessageId)
    if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot)
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

  const membersByMerge = new Map<string, string[]>()
  for (const member of manualMerges) {
    const members = membersByMerge.get(member.merge_id) ?? []
    members.push(node(member.mailbox_domain, member.folder, member.root_message_id))
    membersByMerge.set(member.merge_id, members)
  }

  for (const members of membersByMerge.values()) {
    const [first, ...rest] = members
    if (!first) continue
    for (const member of rest) union(first, member)
  }

  const mergeIdsByRoot = new Map<string, Set<string>>()
  for (const [mergeId, members] of membersByMerge) {
    for (const member of members) {
      const root = find(member)
      const mergeIds = mergeIdsByRoot.get(root) ?? new Set<string>()
      mergeIds.add(mergeId)
      mergeIdsByRoot.set(root, mergeIds)
    }
  }

  const threadIds = new Map<string, string>()
  const manualMergeIds = new Map<string, string[]>()
  for (const message of messages) {
    const root = find(node(message.mailbox_domain, message.folder, message.message_id))
    threadIds.set(message.id, root)
    manualMergeIds.set(message.id, [...(mergeIdsByRoot.get(root) ?? [])])
  }

  return { threadIds, manualMergeIds }
}

/** Keep the original helper API for consumers that do not need merge metadata. */
export function getThreadIds(messages: ThreadableMessage[]) {
  return getThreadGrouping(messages).threadIds
}

export function messageIdFromThreadRoot(threadRoot: string) {
  return threadRoot.slice(threadRoot.lastIndexOf('\u0000') + 1)
}
