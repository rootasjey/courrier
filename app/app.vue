<script setup lang="ts">
import AppTopbar from '~/components/AppTopbar.vue'
import { mailboxFromPath, mailboxPath, mailboxes, type MailboxKey } from '~/utils/mailbox-routing'

const route = useRoute()
const router = useRouter()
const activeFolder = computed(() => mailboxFromPath(route.path))
const search = computed(() => typeof route.query.q === 'string' ? route.query.q : '')
const theme = useState<'system' | 'light' | 'dark'>('courrier-theme', () => 'system')

function selectFolder(folder: MailboxKey) {
  const destination = mailboxPath(folder)
  if (route.path !== destination) void router.push(destination)
}

function updateSearch(value: string) {
  if (!route.path.startsWith('/mail/')) return
  const query = { ...route.query }
  if (value.trim()) query.q = value
  else delete query.q

  if (value !== search.value) {
    void router.replace({ path: route.path, query })
  }
}

const backTo = computed(() => mailboxPath(activeFolder.value))
const showSearch = computed(() => route.path.startsWith('/mail/'))
const folderOptions = mailboxes.map(mailbox => ({ ...mailbox }))

function shortcutFolder(key: string, code: string, shiftKey: boolean): MailboxKey | undefined {
  if (!shiftKey) {
    return ({ '0': 'Screener', '1': 'Imbox', '2': 'The Feed', '3': 'Paper Trail' } as Record<string, MailboxKey>)[key]
  }

  return ({ Digit1: 'Imbox', Digit2: 'The Feed', Digit3: 'Paper Trail' } as Partial<Record<string, MailboxKey>>)[code]
}

function applyTheme(preference: 'system' | 'light' | 'dark') {
  const resolved = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference

  document.documentElement.dataset.theme = resolved
}

function updateSystemTheme() {
  if (theme.value === 'system') applyTheme('system')
}

function handleGlobalShortcut(event: KeyboardEvent) {
  const target = event.target
  const isTyping = target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  const isDialogOpen = target instanceof HTMLElement && Boolean(target.closest('[role="dialog"]'))

  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    if (!showSearch.value) void router.push(mailboxPath(activeFolder.value))
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#mail-search')?.focus())
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey || isTyping || isDialogOpen) return

  const folder = shortcutFolder(event.key, event.code, event.shiftKey)
  if (!folder) return

  event.preventDefault()
  selectFolder(folder)
}

onMounted(() => {
  const savedTheme = window.localStorage.getItem('courrier-theme')
  if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') theme.value = savedTheme
  applyTheme(theme.value)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateSystemTheme)
  window.addEventListener('keydown', handleGlobalShortcut)
})

onUnmounted(() => {
  if (!import.meta.client) return
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', updateSystemTheme)
  window.removeEventListener('keydown', handleGlobalShortcut)
})

watch(theme, (value) => {
  if (!import.meta.client) return
  applyTheme(value)
  window.localStorage.setItem('courrier-theme', value)
})
</script>

<template>
  <div class="app-shell">
    <AppTopbar
      :folders="folderOptions"
      :active-folder="activeFolder"
      :search="search"
      :show-search="showSearch"
      :back-to="backTo"
      @update:search="updateSearch"
      @select-folder="selectFolder"
    />
    <NuxtPage />
  </div>
</template>
