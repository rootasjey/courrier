<template>
  <NDialog
    :open="open"
    :title="$t('palette.title')"
    :description="$t('palette.description')"
    :show-close="false"
    :_dialog-overlay="{ class: 'command-palette-overlay' }"
    :_dialog-content="{ class: 'command-palette-dialog' }"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #content>
      <div class="command-palette" @keydown="handleKeydown">
        <label class="command-palette-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
          <input
            ref="input"
            v-model="query"
            type="search"
            autocomplete="off"
            :placeholder="$t('palette.placeholder')"
            :aria-label="$t('palette.input')"
            :aria-activedescendant="activeOptionId"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-options"
            @input="scheduleSearch"
          >
          <kbd>ESC</kbd>
        </label>

        <div id="command-palette-options" class="command-palette-options" role="listbox" aria-label="Suggestions">
          <template v-if="filteredCommands.length">
          <p class="command-palette-heading">{{ prefix === '/' ? $t('palette.actions') : prefix === '@' ? $t('palette.navigation') : $t('palette.quickAccess') }}</p>
            <button
              v-for="(item, index) in filteredCommands"
              :id="optionId(index)"
              :key="item.id"
              class="command-palette-option"
              :class="{ 'is-active': activeIndex === index }"
              type="button"
              role="option"
              :aria-selected="activeIndex === index"
              @mouseenter="activeIndex = index"
              @click="runCommand(item)"
            >
              <span class="command-option-icon" aria-hidden="true"><component :is="item.icon" /></span>
              <span class="command-option-copy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
              <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
            </button>
          </template>

          <template v-if="!prefix && query.trim()">
            <p class="command-palette-heading">{{ $t('palette.results') }}</p>
            <button
              v-for="(result, index) in searchResults"
              :id="optionId(filteredCommands.length + index)"
              :key="result.id"
              class="command-palette-option command-result-option"
              :class="{ 'is-active': activeIndex === filteredCommands.length + index }"
              type="button"
              role="option"
              :aria-selected="activeIndex === filteredCommands.length + index"
              @mouseenter="activeIndex = filteredCommands.length + index"
              @click="openResult(result)"
            >
              <span class="command-result-folder">{{ folderLabel(result.folder) }}</span>
              <span class="command-option-copy"><strong>{{ result.snippet || $t('palette.open') }}</strong><small>{{ $t('palette.openThread') }}</small></span>
            </button>
            <p v-if="searchPending" class="command-palette-empty">{{ $t('palette.searching') }}</p>
            <p v-else-if="!searchResults.length" class="command-palette-empty">{{ $t('palette.noResults', { query: query.trim() }) }}</p>
          </template>
        </div>

        <footer class="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ $t('palette.browse') }}</span><span><kbd>↵</kbd> {{ $t('palette.open') }}</span><span><kbd>⌘</kbd><kbd>K</kbd> {{ $t('palette.close') }}</span>
        </footer>
      </div>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { mailboxPath, threadPath, type MailboxKey } from '~/utils/mailbox-routing'

type PaletteItem = { id: string, label: string, description: string, icon: object, shortcut?: string, action: 'compose' | 'navigate' | 'search', to?: string }
type SearchResult = { id: string, folder: MailboxKey, threadId: string, snippet: string }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const router = useRouter()
const { $t } = useI18n()
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeIndex = ref(0)
const searchResults = ref<SearchResult[]>([])
const searchPending = ref(false)
const composeRequest = useState('courrier-compose-request', () => 0)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRevision = 0

const icon = (path: string) => ({ render: () => h('svg', { viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true' }, [h('path', { d: path })]) })
const items = computed<PaletteItem[]>(() => [
  { id: 'compose', label: $t('palette.newMessage'), description: $t('palette.newMessageDescription'), icon: icon('M4 14.5 14.8 3.7a1.7 1.7 0 0 1 2.4 2.4L6.4 16.9 3 17.5l.6-3Z M11.5 5.5l3 3'), shortcut: 'C', action: 'compose' },
  { id: 'inbox', label: 'Inbox', description: $t('palette.inboxDescription'), icon: icon('M3 4h14v12H3z M3 11h4l1.5 2h3L13 11h4'), action: 'navigate', to: mailboxPath('Imbox') },
  { id: 'feed', label: 'The Feed', description: $t('palette.feedDescription'), icon: icon('M3 4.5c3-.8 5.5-.4 7 1.3v10c-1.5-1.7-4-2.1-7-1.3v-10Zm14 0c-3-.8-5.5-.4-7 1.3v10c1.5-1.7 4-2.1 7-1.3v-10Z'), action: 'navigate', to: mailboxPath('The Feed') },
  { id: 'paper', label: 'Paper Trail', description: $t('palette.paperDescription'), icon: icon('M5 2.5h10v15l-2.5-1.7L10 17.5l-2.5-1.7L5 17.5v-15Zm3 4h4m-4 3h4'), action: 'navigate', to: mailboxPath('Paper Trail') },
  { id: 'reply-later', label: 'Reply Later', description: $t('palette.replyLaterDescription'), icon: icon('M7.5 5 3 9.5 7.5 14 M3.5 9.5H11a5 5 0 0 1 5 5v1'), action: 'navigate', to: mailboxPath('Reply Later') },
  { id: 'drafts', label: $t('palette.drafts'), description: $t('palette.draftsDescription'), icon: icon('M4 3h12v14H4z M7 7h6m-6 3h6m-6 3h4'), action: 'navigate', to: '/mail/drafts' },
  { id: 'settings', label: $t('palette.settings'), description: $t('palette.settingsDescription'), icon: icon('M10 3v2m0 10v2M3 10h2m10 0h2M5 5l1.5 1.5m7 7L15 15m0-10-1.5 1.5m-7 7L5 15 M13.5 10A3.5 3.5 0 1 1 6.5 10a3.5 3.5 0 0 1 7 0Z'), action: 'navigate', to: '/settings' },
])

const prefix = computed(() => query.value.startsWith('/') || query.value.startsWith('@') ? query.value[0] : '')
const normalizedQuery = computed(() => query.value.trim().replace(/^[/@]\s*/, '').toLocaleLowerCase('fr'))
const filteredCommands = computed(() => {
  const filtered = items.value.filter((item) => {
    if (prefix.value === '/' && item.action !== 'compose') return item.id === 'drafts'
    if (prefix.value === '@' && item.action !== 'navigate') return false
    if (!normalizedQuery.value) return true
    return `${item.label} ${item.description}`.toLocaleLowerCase('fr').includes(normalizedQuery.value)
  })
  return prefix.value ? filtered : filtered.slice(0, 5)
})
const activeOptionId = computed(() => optionId(activeIndex.value))
const visibleOptionCount = computed(() => filteredCommands.value.length + (!prefix.value && query.value.trim() ? searchResults.value.length : 0))

function optionId(index: number) { return `command-palette-option-${index}` }
function folderLabel(folder: MailboxKey) {
  return folder === 'Imbox' ? 'Inbox' : folder === 'The Feed' ? 'The Feed' : folder === 'Paper Trail' ? 'Paper Trail' : folder
}
function close() { emit('update:open', false) }

async function runCommand(item: PaletteItem) {
  close()
  if (item.action === 'compose') {
    await router.push(mailboxPath('Imbox'))
    await nextTick()
    composeRequest.value += 1
    return
  }
  if (item.action === 'navigate' && item.to) await router.push(item.to)
  if (item.action === 'search') await submitSearch()
}

async function submitSearch() {
  const value = query.value.trim().replace(/^[/@]\s*/, '')
  if (!value) return
  close()
  await router.push({ path: mailboxPath('Imbox'), query: { q: value } })
}

async function openResult(result: SearchResult) {
  close()
  await router.push({ path: threadPath(result.folder, result.threadId), query: { message: result.id } })
}

function scheduleSearch() {
  activeIndex.value = 0
  searchResults.value = []
  searchPending.value = false
  searchRevision += 1
  const revision = searchRevision
  if (searchTimer) clearTimeout(searchTimer)
  if (prefix.value || !query.value.trim()) return
  searchPending.value = true
  searchTimer = setTimeout(async () => {
    try {
      const response = await $fetch<{ results: SearchResult[] }>('/api/search', { query: { q: query.value.trim(), offset: 0 } })
      if (revision === searchRevision) searchResults.value = response.results.slice(0, 5)
    } catch {
      if (revision === searchRevision) searchResults.value = []
    } finally {
      if (revision === searchRevision) searchPending.value = false
    }
  }, 180)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const count = visibleOptionCount.value
    if (!count) return
    activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const command = filteredCommands.value[activeIndex.value]
    if (command) void runCommand(command)
    else if (!prefix.value && searchResults.value[activeIndex.value - filteredCommands.value.length]) void openResult(searchResults.value[activeIndex.value - filteredCommands.value.length]!)
    else void submitSearch()
  }
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    query.value = ''
    searchResults.value = []
    activeIndex.value = 0
    await nextTick()
    input.value?.focus()
  } else if (searchTimer) clearTimeout(searchTimer)
})
onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer) })
</script>
