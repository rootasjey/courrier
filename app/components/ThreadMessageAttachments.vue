<template>
  <section class="attachment-list thread-message-attachments" :aria-label="$t('mail.attachments')">
    <div class="attachment-heading">
      <h2>{{ $t('mail.attachments') }}</h2>
      <span class="attachment-heading-count">{{ attachments.length }}</span>
    </div>
    <span class="attachment-total-size">{{ $t('mail.attachmentTotalSize', { size: totalSizeLabel }) }}</span>

    <div class="thread-attachment-preview-grid">
      <MailAttachmentCard
        v-for="attachment in previewAttachments"
        :key="attachment.id"
        :attachment="attachment"
        :thread-id="threadId"
        :size-label="formatAttachmentSize(attachment.sizeBytes)"
      />
    </div>

    <button v-if="attachments.length > previewLimit" class="thread-attachments-open" type="button" @click="isOpen = true">
      <span class="i-tabler-layout-grid" aria-hidden="true" />
      {{ $t('mail.viewAllAttachments', { count: attachments.length }) }}
      <span class="i-tabler-arrow-up-right" aria-hidden="true" />
    </button>

    <NDialog
      :open="isOpen"
      :title="$t('mail.attachmentsCollectionTitle', { count: attachments.length })"
      :description="$t('mail.attachmentsCollectionDescription')"
      :show-close="false"
      :_dialog-content="{ class: 'thread-attachments-dialog' }"
      @update:open="isOpen = $event"
    >
      <template #content>
        <div class="thread-attachments-dialog-panel">
          <header class="thread-attachments-dialog-header">
            <div>
              <NDialogTitle class="thread-attachments-dialog-title">
                {{ $t('mail.attachmentsCollectionTitle', { count: attachments.length }) }}
              </NDialogTitle>
              <NDialogDescription class="thread-attachments-dialog-description">
                {{ $t('mail.attachmentsCollectionDescription') }}
              </NDialogDescription>
            </div>
            <button class="thread-attachments-dialog-close" type="button" :aria-label="$t('palette.close')" @click="isOpen = false">
              <span class="i-tabler-x" aria-hidden="true" />
            </button>
          </header>

          <a v-if="threadId" class="thread-attachments-download-all" :href="zipUrl">
            <span class="i-tabler-download" aria-hidden="true" />
            <span>{{ $t('mail.downloadThreadAttachmentsZip') }}</span>
            <span class="thread-attachments-download-scope">{{ $t('mail.downloadThreadAttachmentsZipDescription') }}</span>
          </a>

          <div class="thread-attachments-dialog-content">
            <section v-for="group in attachmentGroups" :key="group.key" class="thread-attachment-group">
              <h3>
                {{ $t(`mail.attachmentTypes.${group.key}`) }}
                <span>{{ group.attachments.length }}</span>
              </h3>
              <div class="thread-attachment-dialog-grid">
                <MailAttachmentCard
                  v-for="attachment in group.attachments"
                  :key="attachment.id"
                  :attachment="attachment"
                  :size-label="formatAttachmentSize(attachment.sizeBytes)"
                />
              </div>
            </section>
          </div>
        </div>
      </template>
    </NDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import MailAttachmentCard from '~/components/MailAttachmentCard.vue'

type Attachment = { id: string, filename: string, mimeType?: string, sizeBytes: number }
type AttachmentGroupKey = 'images' | 'documents' | 'spreadsheets' | 'presentations' | 'archives' | 'other'

const props = defineProps<{
  attachments: Attachment[]
  threadId?: string
}>()

const previewLimit = 3
const isOpen = ref(false)
const { locale } = useI18nLocale()
const previewAttachments = computed(() => props.attachments.slice(0, previewLimit))
const totalAttachmentBytes = computed(() => props.attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0))
const totalSizeLabel = computed(() => formatAttachmentSize(totalAttachmentBytes.value))
const zipUrl = computed(() => `/api/threads/${encodeURIComponent(props.threadId || '')}/attachments.zip`)
const attachmentGroups = computed(() => {
  const grouped = new Map<AttachmentGroupKey, Attachment[]>()
  for (const attachment of props.attachments) {
    const key = attachmentGroupFor(attachment)
    const items = grouped.get(key) ?? []
    items.push(attachment)
    grouped.set(key, items)
  }

  const order: AttachmentGroupKey[] = ['images', 'documents', 'spreadsheets', 'presentations', 'archives', 'other']
  return order.flatMap(key => {
    const items = grouped.get(key)
    return items?.length ? [{ key, attachments: items }] : []
  })
})

function attachmentGroupFor(attachment: Attachment): AttachmentGroupKey {
  const mimeType = attachment.mimeType?.toLowerCase() ?? ''
  const filename = attachment.filename.toLowerCase()
  if (mimeType.startsWith('image/')) return 'images'
  if (mimeType === 'application/pdf' || /\.(pdf|doc|docx|odt|rtf|txt)$/.test(filename)) return 'documents'
  if (/spreadsheet|excel|csv/.test(mimeType) || /\.(xls|xlsx|ods|csv)$/.test(filename)) return 'spreadsheets'
  if (/presentation|powerpoint/.test(mimeType) || /\.(ppt|pptx|odp)$/.test(filename)) return 'presentations'
  if (/zip|compressed|gzip/.test(mimeType) || /\.(zip|7z|rar|gz)$/.test(filename)) return 'archives'
  return 'other'
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
</script>
