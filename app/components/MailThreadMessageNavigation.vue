<template>
  <div v-if="messages.length > 1" class="thread-carousel-header">
      <div class="thread-carousel-status">
        <span class="thread-carousel-position" aria-live="polite">{{ $t('mail.messagePosition', { current: activeIndex + 1, total: messages.length }) }}</span>
        <NTooltip :content="$t(readingAll ? 'mail.readOneAtATime' : 'mail.readWholeConversation')">
          <button
            class="thread-read-all"
            type="button"
            :aria-label="$t(readingAll ? 'mail.readOneAtATime' : 'mail.readWholeConversation')"
            :aria-pressed="readingAll"
            @click="$emit('toggle-read-all')"
          >
            <svg v-if="!readingAll" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M6 3.5h8.5A1.5 1.5 0 0 1 16 5v10.5M4.5 6H13a1.5 1.5 0 0 1 1.5 1.5V17H6a1.5 1.5 0 0 1-1.5-1.5z" />
              <path d="M7 9h5.5M7 12h5.5" />
            </svg>
            <svg v-else viewBox="0 0 20 20" aria-hidden="true">
              <rect x="3.5" y="4" width="13" height="12" rx="1.5" />
              <path d="M6.5 8h7M6.5 11h7" />
            </svg>
          </button>
        </NTooltip>
      </div>
    </div>

    <div
      v-if="messages.length > 1"
      class="thread-carousel-navigation"
      :style="{ '--thread-navigation-width': Math.min(messages.length * 240 + 96, 1050) + 'px' }"
      :aria-label="$t('mail.conversationNavigation')"
    >
      <button
        class="thread-carousel-arrow"
        type="button"
        :aria-label="$t('mail.previousMessage')"
        :disabled="activeIndex <= 0"
        @click="$emit('navigate', -1)"
      >‹</button>
      <div
        class="thread-message-rail-viewport"
        :class="{ 'can-scroll-start': canScrollStart, 'can-scroll-end': canScrollEnd }"
      >
        <span v-if="canScrollStart" class="thread-message-rail-fade thread-message-rail-fade-start" aria-hidden="true" />
        <div ref="messageRail" class="thread-message-rail" role="group" :aria-label="$t('mail.conversationMessages')" @scroll="updateRailOverflow">
          <button
            v-for="(message, index) in messages"
            :id="'thread-message-tab-' + message.id"
            :key="message.id"
            :data-thread-message-id="message.id"
            class="thread-message-tab"
            :class="message.id === activeMessageId ? 'is-active' : undefined"
            type="button"
            :aria-pressed="message.id === activeMessageId"
            @click="$emit('select', message.id)"
          >
            <span class="thread-tab-heading">
              <MailSenderAvatar class="thread-tab-avatar" :initials="message.initials" :color="message.color" v-bind="avatarFor(message)" />
              <span class="thread-tab-sender">{{ message.sender }}</span>
              <NTooltip :content="absoluteDate(message.timestamp)">
                <time :datetime="message.timestamp">{{ relativeDate(message.timestamp) }}</time>
              </NTooltip>
            </span>
            <span class="thread-tab-preview">{{ message.preview || $t('mail.emptyMessageBody') }}</span>
            <span class="sr-only">{{ $t('mail.messagePosition', { current: index + 1, total: messages.length }) }}</span>
          </button>
        </div>
        <span v-if="canScrollEnd" class="thread-message-rail-fade thread-message-rail-fade-end" aria-hidden="true" />
      </div>
      <button
        class="thread-carousel-arrow"
        type="button"
        :aria-label="$t('mail.nextMessage')"
        :disabled="activeIndex >= messages.length - 1"
        @click="$emit('navigate', 1)"
      >›</button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type CarouselMessage = {
  id: string
  sender: string
  address: string
  timestamp: string
  initials: string
  color: string
  isOutgoing: boolean
  recipient: string
  preview: string
}

const props = defineProps<{
  messages: CarouselMessage[]
  activeMessageId: string
  activeIndex: number
  readingAll: boolean
  avatarFor: (message: CarouselMessage) => { avatarUrl?: string | null, logoUrl?: string | null }
  relativeDate: (timestamp: string) => string
  absoluteDate: (timestamp: string) => string
}>()

defineEmits<{
  navigate: [direction: -1 | 1]
  select: [messageId: string]
  'toggle-read-all': []
}>()

const { $t } = useI18n()
const messageRail = ref<HTMLDivElement | null>(null)
const canScrollStart = ref(false)
const canScrollEnd = ref(false)

function updateRailOverflow() {
  const rail = messageRail.value
  if (!rail) {
    canScrollStart.value = false
    canScrollEnd.value = false
    return
  }

  const hasOverflow = rail.scrollWidth > rail.clientWidth + 2
  canScrollStart.value = hasOverflow && props.activeIndex > 0
  canScrollEnd.value = hasOverflow && props.activeIndex < props.messages.length - 1
}

function revealActiveTab() {
  const rail = messageRail.value
  const tab = [...(rail?.querySelectorAll<HTMLButtonElement>('[data-thread-message-id]') ?? [])]
    .find(candidate => candidate.dataset.threadMessageId === props.activeMessageId)
  if (!rail || !tab) return

  const railRect = rail.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  const nextScrollLeft = tabRect.left < railRect.left
    ? rail.scrollLeft + tabRect.left - railRect.left
    : tabRect.right > railRect.right
      ? rail.scrollLeft + tabRect.right - railRect.right
      : rail.scrollLeft
  rail.scrollTo({ left: nextScrollLeft, behavior: 'instant' })
  updateRailOverflow()
}

let railResizeObserver: ResizeObserver | undefined
watch(messageRail, async (rail) => {
  railResizeObserver?.disconnect()
  if (rail && typeof ResizeObserver !== 'undefined') {
    railResizeObserver = new ResizeObserver(updateRailOverflow)
    railResizeObserver.observe(rail)
  }
  await nextTick()
  revealActiveTab()
  updateRailOverflow()
}, { flush: 'post' })

watch(() => props.activeMessageId, async () => {
  await nextTick()
  revealActiveTab()
}, { flush: 'post' })

watch(() => [props.messages.length, props.activeIndex], async () => {
  await nextTick()
  updateRailOverflow()
}, { flush: 'post' })

onMounted(() => {
  updateRailOverflow()
})

onBeforeUnmount(() => railResizeObserver?.disconnect())
</script>
