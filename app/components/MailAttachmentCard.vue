<template>
  <div class="thread-attachment-card" @contextmenu.prevent="openMenu">
    <a class="thread-attachment-art" :href="downloadUrl" :download="attachment.filename" :aria-label="$t('mail.downloadAttachment', { filename: attachment.filename })">
      <span v-if="isImage" class="thread-attachment-photo">
        <img :src="`${downloadUrl}?inline=1`" :alt="$t('mail.attachmentPreview', { filename: attachment.filename })" loading="lazy">
      </span>
      <span v-else class="image-file-icon" aria-hidden="true">{{ extension }}</span>
      <span class="thread-attachment-download" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M5 17v3h14v-3" /></svg></span>
    </a>
    <button class="thread-attachment-menu-trigger" type="button" :aria-label="$t('mail.attachmentActions', { filename: attachment.filename })" :aria-expanded="menuOpen" @click.stop="menuOpen = !menuOpen">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></svg>
    </button>
    <div v-if="menuOpen" class="thread-attachment-menu" role="menu" @click.stop>
      <a role="menuitem" :href="downloadUrl" :download="attachment.filename" @click="menuOpen = false">{{ $t('mail.downloadAttachmentShort') }}</a>
      <a v-if="threadId" role="menuitem" :href="zipUrl" @click="menuOpen = false">{{ $t('mail.downloadThreadAttachmentsZip') }}</a>
    </div>
    <a class="thread-attachment-card-copy" :href="downloadUrl" :download="attachment.filename">
      <strong>{{ attachment.filename }}</strong>
      <small>{{ kind }} <i>·</i> {{ sizeLabel }}</small>
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  attachment: { id: string, filename: string, mimeType?: string, sizeBytes: number }
  threadId?: string
  sizeLabel: string
}>()

const menuOpen = ref(false)
const downloadUrl = computed(() => `/api/attachments/${encodeURIComponent(props.attachment.id)}`)
const zipUrl = computed(() => `/api/threads/${encodeURIComponent(props.threadId || '')}/attachments.zip`)
const isImage = computed(() => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(props.attachment.mimeType?.toLowerCase() ?? ''))
const extension = computed(() => props.attachment.filename.split('.').at(-1)?.slice(0, 5).toUpperCase() || 'FILE')
const kind = computed(() => props.attachment.mimeType?.split('/').at(-1)?.toUpperCase() || extension.value)

function openMenu() {
  menuOpen.value = true
}

function closeOnOutsideClick(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.thread-attachment-card')) menuOpen.value = false
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsideClick)
  document.addEventListener('keydown', closeOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsideClick)
  document.removeEventListener('keydown', closeOnEscape)
})
</script>
