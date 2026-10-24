import type { ComputedRef, Ref } from 'vue'

type MessageContent = {
  id: string
  threadId: string
  body?: string
  htmlBody?: string
}

export function useMailThreadContent<Message extends MessageContent>(
  messages: Ref<Message[] | undefined>,
  selectedThreadId: ComputedRef<string>,
  refreshMessagesList: () => Promise<unknown>,
) {
  const loadingThreadId = ref('')
  const requests = new Map<string, Promise<void>>()
  const isLoadingSelectedThread = computed(() => Boolean(selectedThreadId.value) && loadingThreadId.value === selectedThreadId.value)

  async function loadThreadContent(threadId: string) {
    const threadMessages = (messages.value ?? []).filter(message => message.threadId === threadId)
    if (!threadMessages.length || threadMessages.every(message => message.body !== undefined)) return

    const pendingRequest = requests.get(threadId)
    if (pendingRequest) return pendingRequest

    loadingThreadId.value = threadId
    const request = (async () => {
      try {
        const details = await $fetch<MessageContent[]>('/api/messages', {
          query: { includeBody: 'true', threadId },
        })
        const detailsById = new Map(details.map(message => [message.id, message]))
        messages.value = (messages.value ?? []).map((message) => {
          const detail = detailsById.get(message.id)
          return detail
            ? { ...message, body: detail.body ?? '', htmlBody: detail.htmlBody ?? '' }
            : message
        })
      } catch {
        // The reader shows a localized retry hint when the content is still missing.
      } finally {
        if (loadingThreadId.value === threadId) loadingThreadId.value = ''
        requests.delete(threadId)
      }
    })()
    requests.set(threadId, request)
    return request
  }

  async function refreshMessages() {
    await refreshMessagesList()
    if (selectedThreadId.value) await loadThreadContent(selectedThreadId.value)
  }

  return {
    isLoadingSelectedThread,
    loadThreadContent,
    refreshMessages,
  }
}
