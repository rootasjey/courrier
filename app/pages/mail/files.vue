<template>
  <main class="mail-page files-page">
    <section class="files-view" aria-labelledby="files-title">
      <header class="files-heading">
        <div class="files-heading-copy">
          <h1 id="files-title">{{ $t('files.title') }}</h1>
          <p>{{ $t(total === 1 ? 'files.countOne' : 'files.countMany', { count: total }) }}</p>
        </div>
        <NuxtLink class="files-back" to="/mail/inbox">
          <span class="i-tabler-arrow-left" aria-hidden="true" />
          {{ $t('files.backToInbox') }}
        </NuxtLink>
      </header>

      <div class="files-controls">
        <label class="files-search">
          <span class="i-tabler-search" aria-hidden="true" />
          <span class="sr-only">{{ $t('files.searchLabel') }}</span>
          <input ref="searchInput" v-model="query" class="files-search-input" type="search" :placeholder="$t('files.searchPlaceholder')" autocomplete="off">
          <button v-if="query" class="files-clear" type="button" :aria-label="$t('files.clearSearch')" @click="query = ''">
            <span class="i-tabler-x" aria-hidden="true" />
          </button>
        </label>
        <NCombobox
          class="files-filter files-sender-filter"
          :items="senderOptions"
          :model-value="selectedSenderOption"
          :open="senderMenuOpen"
          by="value"
          :_combobox-input="{ placeholder: $t('files.filterSender'), autocomplete: 'off' }"
          :_combobox-list="{ align: 'end', side: 'bottom', sideOffset: 7, class: 'files-filter-list files-sender-list z-[120]' }"
          :_combobox-viewport="{ class: 'files-filter-viewport' }"
          :_combobox-trigger="{ class: 'files-filter-trigger', style: { minWidth: '0' }, trailing: 'i-lucide-chevron-down', ariaLabel: $t('files.filterSender') }"
          :_combobox-item="{ class: 'files-filter-item' }"
          :text-empty="$t('files.noSenderMatch')"
          @update:open="senderMenuOpen = $event"
          @update:model-value="selectSender"
        >
          <template #trigger>
            <span>{{ selectedSenderOption?.label }}</span>
          </template>
        </NCombobox>
        <NCombobox
          class="files-filter files-type-filter"
          :items="fileKindOptions"
          :model-value="selectedTypeOption"
          :open="typeMenuOpen"
          by="value"
          :_combobox-input="{ placeholder: $t('files.filterType'), autocomplete: 'off' }"
          :_combobox-list="{ align: 'end', side: 'bottom', sideOffset: 7, class: 'files-filter-list files-type-list z-[120]' }"
          :_combobox-viewport="{ class: 'files-filter-viewport' }"
          :_combobox-trigger="{ class: 'files-filter-trigger', style: { minWidth: '0' }, trailing: 'i-lucide-chevron-down', ariaLabel: $t('files.filterType') }"
          :_combobox-item="{ class: 'files-filter-item' }"
          :text-empty="$t('files.noTypeMatch')"
          @update:open="typeMenuOpen = $event"
          @update:model-value="selectType"
        >
          <template #trigger>
            <span>{{ selectedTypeOption?.label }}</span>
          </template>
        </NCombobox>
      </div>

      <div v-if="error" class="files-state files-error" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="loadFiles(true)">{{ $t('files.retry') }}</button>
      </div>
      <div v-else-if="loading && !files.length" class="files-state" role="status">{{ $t('files.loading') }}</div>
      <div v-else-if="!files.length" class="files-state files-empty">
        <span class="i-tabler-paperclip" aria-hidden="true" />
        <h2>{{ query || selectedSender || selectedType ? $t('files.noResultsTitle') : $t('files.emptyTitle') }}</h2>
        <p>{{ query || selectedSender || selectedType ? $t('files.noResultsDescription') : $t('files.emptyDescription') }}</p>
        <button v-if="query || selectedSender || selectedType" type="button" @click="clearFilters">{{ $t('files.clearFilters') }}</button>
      </div>
      <div v-else class="files-grid" role="list" :aria-label="$t('files.listLabel')" aria-live="polite">
        <article v-for="file in files" :key="file.id" class="file-card" role="listitem">
          <a class="file-download" :href="`/api/attachments/${encodeURIComponent(file.id)}`" :download="file.filename" :aria-label="$t('files.downloadNamed', { filename: file.filename })">
            <span class="file-preview" :class="{ 'is-image': isImage(file.mimeType) }">
              <img v-if="isImage(file.mimeType)" :src="file.previewUrl" alt="" loading="lazy">
              <span v-else class="file-type-mark" :class="fileIcon(file)" aria-hidden="true" />
              <span class="file-download-hint"><span class="i-tabler-download" aria-hidden="true" />{{ $t('files.download') }}</span>
            </span>
            <span class="file-name">{{ file.filename }}</span>
          </a>
          <NuxtLink class="file-message" :to="messageLink(file)">
            <span class="file-subject">{{ file.subject || $t('files.noSubject') }}</span>
            <span class="file-meta">
              <span>{{ file.sender }}</span>
              <span aria-hidden="true">·</span>
              <time :datetime="file.timestamp">{{ formatDate(file.timestamp) }}</time>
              <span aria-hidden="true">·</span>
              <span>{{ formatSize(file.sizeBytes) }}</span>
            </span>
          </NuxtLink>
        </article>
      </div>

      <div v-if="loading && files.length" class="files-loading-more" role="status">{{ $t('files.loading') }}</div>
      <button v-if="hasMore && !loading && !error" class="files-load-more" type="button" @click="loadFiles(false)">{{ $t('files.loadMore') }}</button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { threadPath } from '~/utils/mailbox-routing'

type FileResult = {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  sender: string
  senderAddress: string
  subject: string
  folder: 'Imbox' | 'The Feed' | 'Paper Trail'
  messageId: string
  threadId: string
  timestamp: string
  previewUrl: string
}
type SenderOption = { value: string, label: string }
type FileResponse = { results: FileResult[], total: number, hasMore: boolean, nextOffset: number | null, senders: SenderOption[] }

const { $t } = useI18n()
const { locale } = useI18nLocale()
const router = useRouter()
const route = useRoute()
const files = ref<FileResult[]>([])
const searchInput = ref<HTMLInputElement | null>(null)
const senders = ref<SenderOption[]>([])
const total = ref(0)
const hasMore = ref(false)
const offset = ref(0)
const loading = ref(false)
const error = ref('')
const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const selectedSender = ref('')
const selectedType = ref('')
const senderMenuOpen = ref(false)
const typeMenuOpen = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let requestRevision = 0

const fileKinds = [
  { value: 'image', label: 'files.types.image' },
  { value: 'pdf', label: 'files.types.pdf' },
  { value: 'document', label: 'files.types.document' },
  { value: 'spreadsheet', label: 'files.types.spreadsheet' },
  { value: 'presentation', label: 'files.types.presentation' },
  { value: 'archive', label: 'files.types.archive' },
  { value: 'other', label: 'files.types.other' },
]
const senderOptions = computed(() => [
  { value: '', label: String($t('files.allSenders')) },
  ...senders.value,
])
const fileKindOptions = computed(() => [
  { value: '', label: String($t('files.allTypes')) },
  ...fileKinds.map(kind => ({ value: kind.value, label: String($t(kind.label)) })),
])
const selectedSenderOption = computed(() => senderOptions.value.find(option => option.value === selectedSender.value))
const selectedTypeOption = computed(() => fileKindOptions.value.find(option => option.value === selectedType.value))

function isImage(mimeType: string) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType.toLocaleLowerCase('en-US'))
}

function fileIcon(file: FileResult) {
  const name = file.filename.toLocaleLowerCase('en-US')
  if (file.mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'i-tabler-file-type-pdf'
  if (/\.(?:doc|docx|odt|rtf|txt)$/.test(name)) return 'i-tabler-file-type-doc'
  if (/\.(?:xls|xlsx|csv|ods)$/.test(name)) return 'i-tabler-file-type-xls'
  if (/\.(?:ppt|pptx|odp)$/.test(name)) return 'i-tabler-file-type-ppt'
  if (/\.(?:zip|7z|rar|gz)$/.test(name)) return 'i-tabler-file-zip'
  return 'i-tabler-file'
}

function formatSize(size: number) {
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toLocaleString(locale.value, { maximumFractionDigits: 0 })} Ko`
  return `${(size / (1024 * 1024)).toLocaleString(locale.value, { maximumFractionDigits: 1 })} Mo`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function messageLink(file: FileResult) {
  return { path: threadPath(file.folder, file.threadId), query: { message: file.messageId } }
}

async function loadFiles(reset = true) {
  const revision = ++requestRevision
  if (reset) {
    files.value = []
    offset.value = 0
  }
  error.value = ''
  loading.value = true
  try {
    const response = await $fetch<FileResponse>('/api/files', {
      query: {
        q: query.value.trim(),
        sender: selectedSender.value,
        type: selectedType.value,
        offset: reset ? 0 : offset.value,
      },
    })
    if (revision !== requestRevision) return
    files.value = reset ? response.results : [...files.value, ...response.results]
    senders.value = response.senders
    total.value = response.total
    hasMore.value = response.hasMore
    offset.value = response.nextOffset ?? offset.value + response.results.length
  } catch {
    if (revision === requestRevision) error.value = $t('files.loadError')
  } finally {
    if (revision === requestRevision) loading.value = false
  }
}

function clearFilters() {
  query.value = ''
  selectedSender.value = ''
  selectedType.value = ''
}

function selectSender(option: { value: string } | null | undefined) {
  if (option) selectedSender.value = option.value
  senderMenuOpen.value = false
}

function selectType(option: { value: string } | null | undefined) {
  if (option) selectedType.value = option.value
  typeMenuOpen.value = false
}

watch([query, selectedSender, selectedType], () => {
  if (searchTimer) clearTimeout(searchTimer)
  const nextQuery = { ...route.query }
  if (query.value.trim()) nextQuery.q = query.value.trim()
  else delete nextQuery.q
  void router.replace({ path: route.path, query: nextQuery })
  searchTimer = setTimeout(() => { void loadFiles(true) }, 240)
})

onMounted(() => {
  void nextTick(() => searchInput.value?.focus())
  void loadFiles(true)
})
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
  requestRevision += 1
})
</script>
