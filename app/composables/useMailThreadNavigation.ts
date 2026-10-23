import { computed, nextTick, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import type { MailboxKey } from '~/utils/mailbox-routing'

type NavigableMessage = {
  id: string
  subject: string
  timestamp: string
  isOutgoing: boolean
  recipient: string
  address: string
}

type MailThreadNavigationOptions<Message extends NavigableMessage> = {
  activeFolder: ComputedRef<MailboxKey>
  chronologicalMessages: ComputedRef<Message[]>
  feedEditions: ComputedRef<Message[]>
  isGlobalSearch: ComputedRef<boolean>
  isReadingMessage: ComputedRef<boolean>
  openMessage: (message: Message, mailbox?: MailboxKey, replaceHistory?: boolean) => void
  selectedId: ComputedRef<string>
  selectedMessage: ComputedRef<Message | undefined>
}

export function useMailThreadNavigation<Message extends NavigableMessage>({
  activeFolder,
  chronologicalMessages,
  feedEditions,
  isGlobalSearch,
  isReadingMessage,
  openMessage,
  selectedId,
  selectedMessage,
}: MailThreadNavigationOptions<Message>) {
  const route = useRoute()
  const router = useRouter()
  const activeThreadMessageId = ref('')
  const threadSlideDirection = ref(1)
  const isReadingAll = ref(false)
  const threadMessageRail = ref<HTMLDivElement | null>(null)
  const railCanScrollStart = ref(false)
  const railCanScrollEnd = ref(false)
  const activeThreadMessage = computed(() => chronologicalMessages.value.find(message => message.id === activeThreadMessageId.value) ?? selectedMessage.value)
  const activeThreadMessageIndex = computed(() => chronologicalMessages.value.findIndex(message => message.id === activeThreadMessage.value?.id))
  const feedEditionIndex = computed(() => {
    const messageId = activeThreadMessage.value?.id
    return messageId ? feedEditions.value.findIndex(message => message.id === messageId) : -1
  })
  const isFeedReader = computed(() => activeFolder.value === 'The Feed'
    && !isGlobalSearch.value
    && Boolean(selectedId.value)
    && feedEditionIndex.value >= 0)
  const isInboxReader = computed(() => activeFolder.value === 'Imbox'
    && !isGlobalSearch.value
    && Boolean(selectedId.value))
  const { $t } = useI18n()
  const feedEditionAnnouncement = computed(() => isFeedReader.value && activeThreadMessage.value
    ? $t('mail.feedEditionAnnouncement', {
      subject: activeThreadMessage.value.subject,
      current: feedEditionIndex.value + 1,
      total: feedEditions.value.length,
    })
    : '')
  const feedTouchOrigin = ref<{ x: number, y: number } | null>(null)
  const replyRecipient = computed(() => activeThreadMessage.value?.isOutgoing
    ? activeThreadMessage.value.recipient
    : activeThreadMessage.value?.address || '')

  function updateThreadRailOverflow() {
    const rail = threadMessageRail.value
    if (!rail) {
      railCanScrollStart.value = false
      railCanScrollEnd.value = false
      return
    }

    const hasOverflow = rail.scrollWidth > rail.clientWidth + 2
    railCanScrollStart.value = hasOverflow && activeThreadMessageIndex.value > 0
    railCanScrollEnd.value = hasOverflow && activeThreadMessageIndex.value < chronologicalMessages.value.length - 1
  }

  function revealThreadTab(messageId: string) {
    const rail = threadMessageRail.value
    const tab = document.getElementById(`thread-message-tab-${messageId}`)
    if (!rail || !tab) return

    const railRect = rail.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    const nextScrollLeft = tabRect.left < railRect.left
      ? rail.scrollLeft + tabRect.left - railRect.left
      : tabRect.right > railRect.right
        ? rail.scrollLeft + tabRect.right - railRect.right
        : rail.scrollLeft
    rail.scrollTo({ left: nextScrollLeft, behavior: 'instant' })
    updateThreadRailOverflow()
  }

  function resetThreadPresentation(activeMessageId: string) {
    activeThreadMessageId.value = activeMessageId
    isReadingAll.value = false
  }

  function selectThreadMessage(messageId: string) {
    const nextIndex = chronologicalMessages.value.findIndex(message => message.id === messageId)
    if (nextIndex < 0) return

    threadSlideDirection.value = nextIndex > activeThreadMessageIndex.value ? 1 : -1
    activeThreadMessageId.value = messageId
    void router.replace({ path: route.path, query: { ...route.query, message: messageId } })
  }

  function navigateThreadMessage(direction: -1 | 1) {
    const nextMessage = chronologicalMessages.value[activeThreadMessageIndex.value + direction]
    if (nextMessage) selectThreadMessage(nextMessage.id)
  }

  function navigateFeedEdition(direction: -1 | 1) {
    const nextEdition = feedEditions.value[feedEditionIndex.value + direction]
    if (nextEdition) openMessage(nextEdition, 'The Feed', true)
  }

  function rememberFeedTouch(event: TouchEvent) {
    if (event.touches.length !== 1) {
      feedTouchOrigin.value = null
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest('a, button, input, textarea, select, [contenteditable="true"]')) {
      feedTouchOrigin.value = null
      return
    }

    const touch = event.touches[0]
    if (touch) feedTouchOrigin.value = { x: touch.clientX, y: touch.clientY }
  }

  function finishFeedTouch(event: TouchEvent) {
    const origin = feedTouchOrigin.value
    feedTouchOrigin.value = null
    const touch = event.changedTouches[0]
    if (!origin || !touch) return

    const deltaX = touch.clientX - origin.x
    const deltaY = touch.clientY - origin.y
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.35) return
    navigateFeedEdition(deltaX < 0 ? 1 : -1)
  }

  function toggleReadAll() {
    isReadingAll.value = !isReadingAll.value
  }

  let threadRailResizeObserver: ResizeObserver | undefined
  watch(threadMessageRail, async (rail) => {
    threadRailResizeObserver?.disconnect()
    if (rail && typeof ResizeObserver !== 'undefined') {
      threadRailResizeObserver = new ResizeObserver(updateThreadRailOverflow)
      threadRailResizeObserver.observe(rail)
    }
    await nextTick()
    if (rail && activeThreadMessage.value) revealThreadTab(activeThreadMessage.value.id)
    updateThreadRailOverflow()
  }, { flush: 'post' })

  watch(isReadingMessage, async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    if (activeThreadMessage.value) revealThreadTab(activeThreadMessage.value.id)
    updateThreadRailOverflow()
  }, { flush: 'post' })

  watch(() => chronologicalMessages.value.length, async () => {
    await nextTick()
    updateThreadRailOverflow()
  }, { flush: 'post' })

  onUnmounted(() => threadRailResizeObserver?.disconnect())

  return {
    activeThreadMessage,
    activeThreadMessageId,
    activeThreadMessageIndex,
    feedEditionAnnouncement,
    feedEditionIndex,
    feedTouchOrigin,
    finishFeedTouch,
    isFeedReader,
    isInboxReader,
    isReadingAll,
    navigateFeedEdition,
    navigateThreadMessage,
    railCanScrollEnd,
    railCanScrollStart,
    rememberFeedTouch,
    replyRecipient,
    resetThreadPresentation,
    revealThreadTab,
    selectThreadMessage,
    threadMessageRail,
    threadSlideDirection,
    toggleReadAll,
    updateThreadRailOverflow,
  }
}
