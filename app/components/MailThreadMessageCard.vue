<template>
  <article
    :id="variant === 'full' ? `thread-full-message-${message.id}` : 'thread-message-panel'"
    class="thread-message-card"
    :class="[
      variant === 'full' ? 'thread-full-message' : undefined,
      { 'is-selected': variant === 'full' && isSelected, 'inbox-message-card': isInboxReader },
    ]"
    :aria-label="$t('mail.messageFrom', { sender: message.sender })"
  >
    <div class="message-meta" :class="{ 'inbox-message-sender': isInboxReader }">
      <NTooltip v-if="showBackButton" :content="$t('mail.backToFolder', { folder: folderLabel }) + ' · Esc'" :una="{ tooltipContent: 'z-[120]' }">
        <button
          class="inbox-reader-back-button"
          type="button"
          :aria-label="$t('mail.backToFolder', { folder: folderLabel })"
          aria-keyshortcuts="Escape"
          @click="$emit('close')"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" /></svg>
        </button>
      </NTooltip>
      <NuxtLink v-if="!message.isOutgoing" class="sender-profile-avatar" :to="senderPath(message.address)" :aria-label="$t('mail.openSenderPage', { sender: message.sender })">
        <MailSenderAvatar class="meta-avatar" :initials="message.initials" :color="message.color" v-bind="avatar" />
      </NuxtLink>
      <span v-else class="sender-profile-avatar" aria-hidden="true">
        <MailSenderAvatar class="meta-avatar" :initials="message.initials" :color="message.color" v-bind="avatar" />
      </span>
      <span class="meta-copy">
        <NuxtLink v-if="!message.isOutgoing" class="sender-profile-name" :to="senderPath(message.address)">{{ message.sender }}</NuxtLink>
        <span v-else class="sender-profile-name">{{ message.sender }}</span>
        <span v-if="message.isOutgoing" class="sender-recipient-links">
          {{ $t('mail.recipient') }}
          <template v-if="recipientAddresses(message.recipient).length">
            <NuxtLink v-for="email in recipientAddresses(message.recipient)" :key="email" class="sender-profile-link" :to="senderPath(email)">{{ email }}</NuxtLink>
          </template>
          <span v-else>{{ message.recipient }}</span>
        </span>
        <NuxtLink v-else class="sender-profile-link" :to="senderPath(message.address)">{{ message.address }}</NuxtLink>
      </span>
      <NTooltip v-if="!isInboxReader" :content="absoluteMailDate(message.timestamp)">
        <time :datetime="message.timestamp">{{ relativeMailDate(message.timestamp) }}</time>
      </NTooltip>
    </div>

    <div v-if="!isInboxReader" class="message-rule" />
    <div class="message-content" :class="{ 'inbox-message-body': isInboxReader }">
      <p v-if="message.body === undefined && isLoading" role="status">{{ $t('mail.loading') }}</p>
      <p v-else-if="message.body === undefined" role="alert">{{ $t('mail.loadErrorBody') }}</p>
      <div v-else-if="message.isOutgoing && message.htmlBody" class="message-rich-body" v-html="message.htmlBody" />
      <template v-else-if="message.body !== undefined"><p v-for="(paragraph, paragraphIndex) in message.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p></template>
      <section v-if="message.attachments.length" class="attachment-list" :aria-label="$t('mail.attachments')">
        <div class="attachment-heading">
          <h2>{{ $t('mail.attachments') }}</h2>
          <span class="attachment-heading-count">{{ message.attachments.length }}</span>
        </div>
        <span class="attachment-total-size">{{ $t('mail.attachmentTotalSize', { size: formatAttachmentSize(totalAttachmentBytes) }) }}</span>
        <div class="thread-attachment-grid">
        <a
          v-for="attachment in message.attachments"
          :key="attachment.id"
          class="thread-attachment-card"
          :href="`/api/attachments/${attachment.id}`"
          :download="attachment.filename"
          :aria-label="$t('mail.downloadAttachment', { filename: attachment.filename })"
        >
          <span class="thread-attachment-art">
            <span v-if="isImageAttachment(attachment)" class="thread-attachment-photo">
              <img :src="`/api/attachments/${encodeURIComponent(attachment.id)}?inline=1`" :alt="$t('mail.attachmentPreview', { filename: attachment.filename })" loading="lazy">
            </span>
            <span v-else class="image-file-icon" aria-hidden="true">{{ attachmentExtension(attachment.filename) }}</span>
            <span class="thread-attachment-download" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M5 17v3h14v-3" /></svg></span>
          </span>
          <span class="thread-attachment-card-copy">
            <strong>{{ attachment.filename }}</strong>
            <small>{{ formatAttachmentKind(attachment) }} <i>·</i> {{ formatAttachmentSize(attachment.sizeBytes) }}</small>
          </span>
        </a>
        </div>
      </section>
    </div>

    <div v-if="isInboxReader" class="inbox-message-footer">
      <ThreadParticipantsStack v-if="showParticipants" :participants="participants" mobile-drawer />
      <span class="inbox-message-footer-date">
        <InboxMessageDate :timestamp="message.timestamp" :relative-date="relativeMailDate(message.timestamp)" :absolute-date="absoluteMailDate(message.timestamp)" />
      </span>
    </div>
  </article>
</template>

<script setup lang="ts">
import InboxMessageDate from '~/components/InboxMessageDate.vue'
import ThreadParticipantsStack from '~/components/ThreadParticipantsStack.vue'
import { senderPath } from '~/utils/mailbox-routing'

type ReaderMessage = {
  id: string
  sender: string
  address: string
  timestamp: string
  initials: string
  color: string
  isOutgoing: boolean
  recipient: string
  body?: string
  htmlBody?: string
  attachments: { id: string, filename: string, mimeType?: string, sizeBytes: number }[]
}

type Participant = { address: string, name: string, initials: string, color: 'terracotta' | 'blue' | 'green' | 'gold', avatarUrl?: string | null, logoUrl?: string | null }

defineEmits<{ close: [] }>()

const props = withDefaults(defineProps<{
  message: ReaderMessage
  variant?: 'active' | 'full'
  isInboxReader?: boolean
  isLoading?: boolean
  isSelected?: boolean
  showBackButton?: boolean
  folderLabel?: string
  avatar?: { avatarUrl?: string | null, logoUrl?: string | null }
  participants?: Participant[]
  showParticipants?: boolean
}>(), {
  variant: 'active',
  isInboxReader: false,
  isLoading: false,
  isSelected: false,
  showBackButton: false,
  folderLabel: '',
  avatar: () => ({}),
  participants: () => [],
  showParticipants: false,
})

const totalAttachmentBytes = computed(() => props.message.attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0))

const { $t } = useI18n()
const { locale } = useI18nLocale()

function isImageAttachment(attachment: ReaderMessage['attachments'][number]) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(attachment.mimeType?.toLowerCase() ?? '')
}

function attachmentExtension(filename: string) {
  return filename.split('.').at(-1)?.slice(0, 5).toUpperCase() || 'FILE'
}

function formatAttachmentKind(attachment: ReaderMessage['attachments'][number]) {
  const kind = attachment.mimeType?.split('/').at(-1)?.toUpperCase()
  return kind || attachmentExtension(attachment.filename)
}

function formatAttachmentSize(bytes: number) {
  const megabyte = 1024 * 1024
  const isEnglish = locale.value?.startsWith('en')
  if (bytes >= megabyte) {
    const value = new Intl.NumberFormat(locale.value || 'fr', { maximumFractionDigits: 1 }).format(bytes / megabyte)
    return `${value} ${isEnglish ? 'MB' : 'Mo'}`
  }

  return `${Math.max(1, Math.round(bytes / 1024))} ${isEnglish ? 'KB' : 'Ko'}`
}

function recipientAddresses(value: string) {
  const matches = value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || []
  return [...new Set(matches.map(address => address.trim().toLocaleLowerCase('en-US')))]
}

function relativeMailDate(timestamp: string) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return ''
  const difference = time - Date.now()
  const absoluteDifference = Math.abs(difference)
  const units: { unit: Intl.RelativeTimeFormatUnit, milliseconds: number }[] = [
    { unit: 'year', milliseconds: 31_536_000_000 },
    { unit: 'month', milliseconds: 2_592_000_000 },
    { unit: 'week', milliseconds: 604_800_000 },
    { unit: 'day', milliseconds: 86_400_000 },
    { unit: 'hour', milliseconds: 3_600_000 },
    { unit: 'minute', milliseconds: 60_000 },
    { unit: 'second', milliseconds: 1_000 },
  ]
  const { unit, milliseconds } = units.find(candidate => absoluteDifference >= candidate.milliseconds) ?? units.at(-1)!
  return new Intl.RelativeTimeFormat(locale.value || 'fr', { numeric: 'auto', style: 'short' }).format(Math.round(difference / milliseconds), unit)
}

function absoluteMailDate(timestamp: string) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value || 'fr', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(date)
}
</script>
