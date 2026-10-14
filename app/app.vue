<template>
  <div class="app-shell">
    <AppTopbar v-if="!isLoginRoute"
      :folders="folderOptions"
      :active-folder="activeFolder"
      :show-back-link="showBackLink"
      :back-to="backTo"
      @select-folder="selectFolder"
    />
    <NuxtPage :transition="pageTransition" />
    <CommandPalette v-if="!isLoginRoute" v-model:open="commandPaletteOpen" />
  </div>
</template>

<script setup lang="ts">
import AppTopbar from '~/components/AppTopbar.vue'
import { mailboxFromPath, mailboxPath, mailboxes, type MailboxKey } from '~/utils/mailbox-routing'

const route = useRoute()
const router = useRouter()
const isLoginRoute = computed(() => route.path === '/login')
const pageTransition = computed(() => isLoginRoute.value || route.path.startsWith('/admin')
  ? false
  : { name: 'page', mode: 'out-in' as const })
const activeFolder = computed(() => mailboxFromPath(route.path))
const theme = useState<'system' | 'light' | 'dark'>('courrier-theme', () => 'system')
const commandPaletteOpen = useState('courrier-command-palette-open', () => false)

function selectFolder(folder: MailboxKey) {
  const destination = mailboxPath(folder)
  if (route.path !== destination) void router.push(destination)
}

const backTo = computed(() => mailboxPath(activeFolder.value))
const showBackLink = computed(() => !route.path.startsWith('/mail/'))
const folderOptions = mailboxes.map(mailbox => ({ ...mailbox }))

function shortcutFolder(key: string, code: string, shiftKey: boolean): MailboxKey | undefined {
  if (!shiftKey) {
    return ({ '0': 'Screener', '1': 'Imbox', '2': 'The Feed', '3': 'Paper Trail', '4': 'Reply Later' } as Record<string, MailboxKey>)[key]
  }

  return ({ Digit1: 'Imbox', Digit2: 'The Feed', Digit3: 'Paper Trail', Digit4: 'Reply Later' } as Partial<Record<string, MailboxKey>>)[code]
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
    commandPaletteOpen.value = !commandPaletteOpen.value
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
