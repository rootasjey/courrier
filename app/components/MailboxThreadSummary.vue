<template>
  <div class="mailbox-thread-summary" :class="{ 'is-card-summary': cardStyle, [`is-card-summary-${cardStyle}`]: cardStyle }">
    <div v-if="cardStyle" class="thread-card-heading">
      <strong class="thread-card-sender">{{ sender }}</strong>
      <NTooltip :content="absoluteDate" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
        <time class="thread-date" :datetime="timestamp">{{ displayDate }}</time>
      </NTooltip>
    </div>
    <NTooltip v-if="preview" :_tooltipContent="tooltipContentOptions" :una="{ tooltipContent: 'thread-preview-tooltip z-[120]' }">
      <button
        ref="subjectElement"
        class="mailbox-thread-subject"
        type="button"
        @pointerenter="anchorTooltipToPointer"
        @focus="anchorTooltipToSubject"
        @click="$emit('open', $event)"
      >{{ subject }}</button>
      <template #content>
        <span>{{ preview }}</span>
        <NTooltipArrow :width="12" :height="6" :rounded="true" />
      </template>
    </NTooltip>
    <button v-else class="mailbox-thread-subject" type="button" @click="$emit('open', $event)">{{ subject }}</button>
    <p v-if="cardStyle && cardPreview" class="thread-card-preview">{{ cardPreview }}</p>
    <div class="thread-secondary">
      <span v-if="newMessageLabel" class="set-aside-new-message">{{ newMessageLabel }}</span>
      <span v-for="tag in tags" :key="tag.id" class="workspace-tag-chip" :class="`tag-color-${tag.color}`">{{ tag.name }}</span>
      <span v-if="!cardStyle" class="thread-sender-badge">{{ sender }}</span>
      <ThreadParticipantsStack v-if="participants.length" inline :participants="participants" />
      <NTooltip v-if="attachmentCount" :content="$t('mail.attachmentCount', { count: attachmentCount })" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
        <span class="thread-attachment-count" :aria-label="$t('mail.attachmentCount', { count: attachmentCount })">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.5 8.8 4.2-4.2a2.2 2.2 0 0 1 3.1 3.1l-5.7 5.7a3.4 3.4 0 0 1-4.8-4.8l5.6-5.6" /></svg>
          <span>{{ attachmentCount }}</span>
        </span>
      </NTooltip>
      <NTooltip v-if="messageCount > 1" :content="$t('mail.messageCount', { count: messageCount })" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
        <span class="thread-message-count" :aria-label="$t('mail.messageCount', { count: messageCount })">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.75A2.25 2.25 0 0 1 4.75 1.5h6.5a2.25 2.25 0 0 1 2.25 2.25v4.5a2.25 2.25 0 0 1-2.25 2.25H7l-3.75 3v-3.2A2.25 2.25 0 0 1 2.5 8.25v-4.5Z" /></svg>
          <span>{{ messageCount }}</span>
        </span>
      </NTooltip>
      <NTooltip v-if="!cardStyle" :content="absoluteDate" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
        <time class="thread-date" :datetime="timestamp">{{ displayDate }}</time>
      </NTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ThreadParticipantsStack from '~/components/ThreadParticipantsStack.vue'

const subjectElement = ref<HTMLButtonElement>()
const pointerPosition = ref<{ x: number, y: number }>()
const pointerAnchored = ref(false)
const props = defineProps<{
  subject: string
  sender: string
  preview: string
  timestamp: string
  displayDate: string
  absoluteDate: string
  participants: { address: string, name: string, initials: string, color: 'terracotta' | 'blue' | 'green' | 'gold', avatarUrl?: string | null, logoUrl?: string | null }[]
  attachmentCount: number
  messageCount: number
  newMessageLabel?: string
  tags?: { id: string, name: string, color: string }[]
  cardStyle?: 'lavender' | 'relief'
}>()

const cardPreview = computed(() => props.preview.replace(/^\[MESSAGE FICTIF — DONNÉES LOCALES DE DÉMO\]\s*/u, ''))

const tooltipReference = computed(() => {
  const position = pointerPosition.value
  if (!pointerAnchored.value || !position)
    return subjectElement.value

  return {
    contextElement: subjectElement.value,
    getBoundingClientRect: () => new DOMRect(position.x, position.y, 0, 0),
  }
})

const tooltipContentOptions = computed(() => ({
  reference: tooltipReference.value,
  side: 'top' as const,
  align: 'start' as const,
  sideOffset: 10,
  alignOffset: 10,
  collisionPadding: 12,
}))

function anchorTooltipToPointer(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen')
    return

  pointerPosition.value = { x: event.clientX, y: event.clientY }
  pointerAnchored.value = true
}

function anchorTooltipToSubject() {
  pointerAnchored.value = false
}

defineEmits<{ open: [event: MouseEvent] }>()
</script>
