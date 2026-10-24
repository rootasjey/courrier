<template>
  <div
    class="other-thread-row thread-selection-row feed-edition-row"
    :class="{
      'is-thread-selected': selection.selected,
      'is-selection-cursor': selection.keyboardCursor,
    }"
    :data-thread-selection-id="message.threadId"
    :aria-current="selection.keyboardCursor ? 'true' : undefined"
    role="listitem"
  >
    <span v-if="!message.isRead" class="unread-indicator" :aria-label="$t('mail.unreadOne', { count: 1 })" />
    <span v-else-if="selection.keyboardCursor" class="thread-selection-cursor" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg>
    </span>
    <button
      v-if="selection.canSelect"
      class="thread-avatar-trigger"
      :class="{
        'is-selected': selection.active && selection.selected,
        'is-merged': message.manualMergeIds.length,
      }"
      type="button"
      :aria-label="$t(selection.active && selection.selected ? 'mail.deselectThread' : 'mail.selectThread', { subject: message.subject }) + (message.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')"
      :aria-pressed="selection.active ? selection.selected : undefined"
      @click="$emit('select', $event)"
    >
      <span class="thread-avatar-wrap" :class="{ 'is-merged': message.manualMergeIds.length }">
        <span v-if="selection.active && selection.selected" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
        <MailSenderAvatar v-else :initials="message.initials" :color="message.color" v-bind="avatarFor(message)" />
        <span v-if="message.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
      </span>
    </button>
    <MailboxThreadSummary
      :subject="message.subject"
      :sender="message.sender"
      :preview="message.preview"
      :timestamp="message.timestamp"
      :display-date="relativeDate(message.timestamp)"
      :absolute-date="absoluteDate(message.timestamp)"
      :participants="[]"
      :attachment-count="message.attachments.length"
      :message-count="1"
      :tags="message.tags"
      @open="$emit('open', $event)"
    />
  </div>
</template>

<script setup lang="ts">
type FeedEdition = {
  threadId: string
  subject: string
  sender: string
  preview: string
  timestamp: string
  initials: string
  color: string
  address: string
  isOutgoing: boolean
  recipient: string
  isRead: boolean
  manualMergeIds: string[]
  tags: { id: string, name: string, color: string }[]
  attachments: { id: string, filename: string, sizeBytes: number }[]
}

type SelectionState = {
  canSelect: boolean
  active: boolean
  selected: boolean
  keyboardCursor: boolean
}

defineProps<{
  message: FeedEdition
  selection: SelectionState
  avatarFor: (message: FeedEdition) => { avatarUrl?: string | null, logoUrl?: string | null }
  relativeDate: (timestamp: string) => string
  absoluteDate: (timestamp: string) => string
}>()

defineEmits<{
  select: [event: MouseEvent]
  open: [event: MouseEvent]
}>()

const { $t } = useI18n()
</script>
