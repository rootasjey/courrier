<template>
  <div
    class="thread-selection-row"
    :class="[
      variant === 'other-folder' || variant === 'paper' ? 'other-thread-row' : undefined,
      variant === 'inbox' ? 'thread-card-lavender' : undefined,
      variant === 'paper' ? 'thread-card-relief' : undefined,
      {
        'is-thread-selected': selection.selected,
        'is-selection-cursor': selection.keyboardCursor,
      },
    ]"
    :data-thread-selection-id="thread.id"
    @click="openCardFromBackground"
    :aria-current="selection.keyboardCursor ? 'true' : undefined"
    role="listitem"
  >
    <span
      v-if="thread.unreadCount"
      class="unread-indicator"
      :class="{ 'is-selection-cursor': selection.keyboardCursor }"
      :aria-label="$t(thread.unreadCount === 1 ? 'mail.unreadOne' : 'mail.unreadMany', { count: thread.unreadCount })"
    >
      <svg v-if="selection.keyboardCursor" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg>
    </span>
    <span v-else-if="selection.keyboardCursor" class="thread-selection-cursor" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg>
    </span>
    <button
      v-if="selection.canSelect"
      class="thread-avatar-trigger"
      :class="{
        'is-selected': selection.active && selection.selected,
        'is-merged': thread.manualMergeIds.length,
      }"
      type="button"
      :aria-label="$t(selection.active && selection.selected ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')"
      :aria-pressed="selection.active ? selection.selected : undefined"
      @click="$emit('select', $event)"
    >
      <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
        <span v-if="selection.active && selection.selected" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
        <MailSenderAvatar v-else :initials="thread.latest.initials" :color="thread.latest.color" v-bind="avatarFor(thread.latest)" />
        <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
      </span>
    </button>
    <MailboxThreadSummary
      :subject="thread.subject"
      :sender="thread.latest.sender"
      :preview="thread.latest.preview"
      :timestamp="thread.latest.timestamp"
      :display-date="relativeDate(thread.latest.timestamp)"
      :absolute-date="absoluteDate(thread.latest.timestamp)"
      :card-style="variant === 'inbox' ? 'lavender' : variant === 'paper' ? 'relief' : undefined"
      :participants="participants"
      :attachment-count="attachmentCount"
      :message-count="thread.messages.length"
      :tags="thread.tags"
      :new-message-label="newMessageLabel"
      @open="$emit('open', $event)"
    />
    <button v-if="showRestore" class="screener-restore trash-restore" type="button" :disabled="restoreDisabled" @click="$emit('restore')">{{ $t('mail.restore') }}</button>
  </div>
</template>

<script setup lang="ts">
type ThreadMessage = {
  id: string
  initials: string
  color: string
  address: string
  isOutgoing: boolean
  recipient: string
  subject: string
  sender: string
  preview: string
  timestamp: string
  attachments: { id: string, filename: string, sizeBytes: number }[]
}

type MailThread = {
  id: string
  subject: string
  latest: ThreadMessage
  messages: { attachments: { id: string, filename: string, sizeBytes: number }[] }[]
  unreadCount: number
  manualMergeIds: string[]
  tags: { id: string, name: string, color: string }[]
}

type Participant = {
  address: string
  name: string
  initials: string
  color: 'terracotta' | 'blue' | 'green' | 'gold'
  avatarUrl?: string | null
  logoUrl?: string | null
}

const props = defineProps<{
  thread: MailThread
  variant: 'inbox' | 'paper' | 'other-folder'
  selection: {
    canSelect: boolean
    active: boolean
    selected: boolean
    keyboardCursor: boolean
  }
  participants: Participant[]
  newMessageLabel: string
  showRestore?: boolean
  restoreDisabled?: boolean
  avatarFor: (message: ThreadMessage) => { avatarUrl?: string | null, logoUrl?: string | null }
  relativeDate: (timestamp: string) => string
  absoluteDate: (timestamp: string) => string
}>()

const { $t } = useI18n()
const attachmentCount = computed(() => props.thread.messages.reduce((count, message) => count + message.attachments.length, 0))

function openCardFromBackground(event: MouseEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, [role="button"], [role="menuitem"]')) return
  emit('open', event)
}

const emit = defineEmits<{
  select: [event: MouseEvent]
  open: [event: MouseEvent]
  restore: []
}>()
</script>
