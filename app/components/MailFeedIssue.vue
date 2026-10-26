<template>
  <div class="feed-reader-content">
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</span>

    <header class="feed-issue-sender">
      <div class="message-meta">
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
      </div>
    </header>
    <div class="feed-issue-body" @touchstart.passive="$emit('touchStart', $event)" @touchend.passive="$emit('touchEnd', $event)" @touchcancel.passive="$emit('touchCancel')">
      <div class="feed-issue-text">
        <p v-if="message.body === undefined && isLoading" role="status">{{ $t('mail.loading') }}</p>
        <p v-else-if="message.body === undefined" role="alert">{{ $t('mail.loadErrorBody') }}</p>
        <template v-else>
          <p v-for="(paragraph, paragraphIndex) in message.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p>
          <p v-if="!message.body.trim()" class="feed-empty-body">{{ $t('mail.emptyMessageBody') }}</p>
        </template>
      </div>
      <div v-if="message.attachments.length" class="attachment-list" :aria-label="$t('mail.attachments')">
        <span class="attachment-heading">{{ $t(message.attachments.length === 1 ? 'mail.attachmentCountOne' : 'mail.attachmentCountMany', { count: message.attachments.length }) }}</span>
        <a v-if="threadId" class="attachment-download-zip" :href="`/api/threads/${encodeURIComponent(threadId)}/attachments.zip`">{{ $t('mail.downloadThreadAttachmentsZip') }}</a>
        <div class="thread-attachment-grid">
          <MailAttachmentCard v-for="attachment in message.attachments" :key="attachment.id" :attachment="attachment" :thread-id="threadId" :size-label="formatSize(attachment.sizeBytes)" />
        </div>
      </div>
    </div>
    <div class="feed-issue-date">
      <NTooltip :content="absoluteDate(message.timestamp)">
        <time :datetime="message.timestamp">{{ relativeDate(message.timestamp) }}</time>
      </NTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { senderPath } from '~/utils/mailbox-routing'

type FeedMessage = {
  isOutgoing: boolean
  address: string
  sender: string
  initials: string
  color: string
  recipient: string
  body?: string
  attachments: { id: string, filename: string, sizeBytes: number }[]
  timestamp: string
}

defineProps<{
  message: FeedMessage
  threadId: string
  isLoading: boolean
  announcement: string
  avatar: { avatarUrl?: string | null, logoUrl?: string | null }
  recipientAddresses: (value: string) => string[]
  absoluteDate: (timestamp: string) => string
  relativeDate: (timestamp: string) => string
}>()

defineEmits<{
  touchStart: [event: TouchEvent]
  touchEnd: [event: TouchEvent]
  touchCancel: []
}>()

const { $t } = useI18n()

function formatSize(bytes: number) {
  const isEnglish = useI18nLocale().locale.value?.startsWith('en')
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} ${isEnglish ? 'MB' : 'Mo'}`
    : `${Math.max(1, Math.round(bytes / 1024))} ${isEnglish ? 'KB' : 'Ko'}`
}

import MailAttachmentCard from '~/components/MailAttachmentCard.vue'
</script>
