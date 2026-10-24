import { computed, type ComputedRef, type Ref } from 'vue'
import type { MailboxKey } from '~/utils/mailbox-routing'

type CollectionTag = {
  id: string
}

type CollectionMessage<Tag extends CollectionTag> = {
  id: string
  threadId: string
  folder: string
  isSetAside: boolean
  isReplyLater: boolean
  isRead: boolean
  timestamp: string
  threadSubject: string | null
  subject: string
  preview: string
  sender: string
  manualMergeIds: string[]
  tags: Tag[]
}

export type MailCollectionThread<Message, Tag> = {
  id: string
  messages: Message[]
  latest: Message
  subject: string
  unreadCount: number
  manualMergeIds: string[]
  tags: Tag[]
}

function groupMessages<Tag extends CollectionTag, Message extends CollectionMessage<Tag>>(messages: Message[]) {
  const threads = new Map<string, Message[]>()
  for (const message of messages) {
    const threadMessages = threads.get(message.threadId) ?? []
    threadMessages.push(message)
    threads.set(message.threadId, threadMessages)
  }

  return [...threads.entries()].map(([id, threadMessages]) => {
    threadMessages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const latest = threadMessages[0]!
    const tags = new Map<string, Tag>()
    for (const message of threadMessages) {
      for (const tag of message.tags) tags.set(tag.id, tag)
    }

    return {
      id,
      messages: threadMessages,
      latest,
      subject: threadMessages.find(message => message.threadSubject)?.threadSubject || latest.subject,
      unreadCount: threadMessages.filter(message => !message.isRead).length,
      manualMergeIds: [...new Set(threadMessages.flatMap(message => message.manualMergeIds))],
      tags: [...tags.values()],
    }
  })
}

export function useMailThreadCollections<
  Tag extends CollectionTag,
  Message extends CollectionMessage<Tag>,
>(options: {
  messages: Ref<Message[]>
  activeFolder: ComputedRef<MailboxKey>
  search: ComputedRef<string>
  selectedTagId: ComputedRef<string>
}) {
  const folderMessages = computed(() => options.messages.value.filter((message) => {
    if (options.activeFolder.value === 'Set Aside') return message.folder === 'Imbox' && message.isSetAside
    if (options.activeFolder.value === 'Reply Later') return message.isReplyLater
    if (options.activeFolder.value === 'Imbox') return message.folder === 'Imbox' && !message.isSetAside && !message.isReplyLater
    return message.folder === options.activeFolder.value && !message.isReplyLater
  }))

  const folderThreads = computed(() => groupMessages(folderMessages.value))

  const visibleThreads = computed(() => {
    const query = options.search.value.trim().toLocaleLowerCase('fr')
    const threads = ['Set Aside', 'Reply Later'].includes(options.activeFolder.value)
      ? [...folderThreads.value].sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp))
      : folderThreads.value
    const taggedThreads = options.selectedTagId.value
      ? threads.filter(thread => thread.tags.some(tag => tag.id === options.selectedTagId.value))
      : threads
    if (!query) return taggedThreads

    return taggedThreads.filter(thread => thread.subject.toLocaleLowerCase('fr').includes(query) || thread.messages.some(message =>
      `${message.sender} ${message.subject} ${message.preview}`.toLocaleLowerCase('fr').includes(query),
    ))
  })

  const feedEditions = computed(() => folderMessages.value
    .filter(message => message.folder === 'The Feed')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
  const visibleFeedEditions = computed(() => options.selectedTagId.value
    ? feedEditions.value.filter(message => message.tags.some(tag => tag.id === options.selectedTagId.value))
    : feedEditions.value)

  const setAsideThreads = computed(() => groupMessages(options.messages.value.filter(message =>
    message.folder === 'Imbox' && message.isSetAside,
  )).filter(thread => !options.selectedTagId.value || thread.tags.some(tag => tag.id === options.selectedTagId.value))
    .sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp)))

  const replyLaterThreads = computed(() => groupMessages(options.messages.value.filter(message => message.isReplyLater))
    .filter(thread => !options.selectedTagId.value || thread.tags.some(tag => tag.id === options.selectedTagId.value))
    .sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp)))

  return {
    folderMessages,
    folderThreads,
    visibleThreads,
    feedEditions,
    visibleFeedEditions,
    setAsideThreads,
    replyLaterThreads,
  }
}
