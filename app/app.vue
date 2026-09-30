<script setup lang="ts">
import AppTopbar from '~/components/AppTopbar.vue'

type Folder = 'Screener' | 'Imbox' | 'The Feed' | 'Paper Trail'

const folders: { name: Folder, description: string }[] = [
  { name: 'Screener', description: 'Nouveaux expéditeurs' },
  { name: 'Imbox', description: 'À lire et à traiter' },
  { name: 'The Feed', description: 'Newsletters et lectures' },
  { name: 'Paper Trail', description: 'Reçus et confirmations' },
]

const route = useRoute()
const router = useRouter()
const activeFolder = useState<Folder>('courrier-active-folder', () => 'Imbox')
const search = useState('courrier-search', () => '')
const theme = useState<'system' | 'light' | 'dark'>('courrier-theme', () => 'system')

function selectFolder(folder: Folder) {
  activeFolder.value = folder
  search.value = ''
  if (route.path !== '/') void router.push('/')
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
    if (route.path !== '/') void router.push('/')
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#mail-search')?.focus())
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey || isTyping || isDialogOpen) return

  const unshiftedFolders: Record<string, Folder> = {
    '0': 'Screener',
    '1': 'Imbox',
    '2': 'The Feed',
    '3': 'Paper Trail',
  }
  const azertyNumberRowFolders: Partial<Record<string, Folder>> = {
    Digit1: 'Imbox',
    Digit2: 'The Feed',
    Digit3: 'Paper Trail',
  }
  const folder = event.shiftKey
    ? azertyNumberRowFolders[event.code]
    : unshiftedFolders[event.key]
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
      :folders="folders"
      :active-folder="activeFolder"
      :search="search"
      :show-search="route.path === '/'"
      @update:search="search = $event"
      @select-folder="selectFolder"
    />
    <NuxtPage />
  </div>
</template>
