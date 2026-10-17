<template>
  <div class="app-shell">
    <AppTopbar v-if="!isPublicAuthRoute"
      :folders="folderOptions"
      :active-folder="activeFolder"
      :show-back-link="showBackLink"
      :back-to="backTo"
      @select-folder="selectFolder"
    />
    <NuxtPage :transition="pageTransition" />
    <CommandPalette v-if="!isPublicAuthRoute" v-model:open="commandPaletteOpen" />
  </div>
</template>

<script setup lang="ts">
import '@fontsource-variable/dm-sans/wght.css'
import AppTopbar from '~/components/AppTopbar.vue'
import { mailboxFromPath, mailboxPath, mailboxes, type MailboxKey } from '~/utils/mailbox-routing'

const route = useRoute()
const router = useRouter()
const isPublicAuthRoute = computed(() => route.path === '/login'
  || route.path === '/password-reset'
  || route.path.startsWith('/invitation/'))
const pageTransition = computed(() => isPublicAuthRoute.value || route.path.startsWith('/admin')
  ? false
  : { name: 'page', mode: 'out-in' as const })
const activeFolder = computed(() => mailboxFromPath(route.path))
type ThemeMode = 'system' | 'light' | 'dark'
type ThemeName = 'paper' | 'forest' | 'graphite' | 'lavender' | 'ayu' | 'one-dark-pro' | 'synthwave' | 'shades-purple' | 'min'
const themeMode = useState<ThemeMode>('courrier-color-mode', () => 'system')
const themeName = useState<ThemeName>('courrier-theme-family', () => 'paper')
const commandPaletteOpen = useState('courrier-command-palette-open', () => false)
const themeModeStorageKey = 'courrier-color-mode'
const themeNameStorageKey = 'courrier-theme-family'
const legacyThemeStorageKey = 'courrier-theme'

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

function applyTheme(mode: ThemeMode, theme: ThemeName) {
  const resolvedMode = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode

  document.documentElement.dataset.theme = resolvedMode
  document.documentElement.dataset.themeVariant = theme
}

function updateSystemTheme() {
  if (themeMode.value === 'system') applyTheme(themeMode.value, themeName.value)
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isThemeName(value: string | null): value is ThemeName {
  return value === 'paper' || value === 'forest' || value === 'graphite' || value === 'lavender'
    || value === 'ayu' || value === 'one-dark-pro' || value === 'synthwave' || value === 'shades-purple' || value === 'min'
}

function migrateLegacyTheme(value: string | null, systemIsDark: boolean): { mode: ThemeMode, theme: ThemeName } | null {
  if (value === 'system') return { mode: 'system', theme: systemIsDark ? 'graphite' : 'paper' }
  if (value === 'light' || value === 'paper') return { mode: 'light', theme: 'paper' }
  if (value === 'dark' || value === 'graphite') return { mode: 'dark', theme: 'graphite' }
  if (value === 'forest') return { mode: 'dark', theme: 'forest' }
  if (value === 'black') return { mode: 'dark', theme: 'lavender' }
  return null
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
  const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const savedMode = window.localStorage.getItem(themeModeStorageKey)
  const savedThemeName = window.localStorage.getItem(themeNameStorageKey)
  const migrated = migrateLegacyTheme(window.localStorage.getItem(legacyThemeStorageKey), systemIsDark)

  if (isThemeMode(savedMode)) themeMode.value = savedMode
  else if (migrated) themeMode.value = migrated.mode

  if (isThemeName(savedThemeName)) themeName.value = savedThemeName
  else if (migrated) themeName.value = migrated.theme

  window.localStorage.removeItem(legacyThemeStorageKey)
  applyTheme(themeMode.value, themeName.value)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateSystemTheme)
  window.addEventListener('keydown', handleGlobalShortcut)
})

onUnmounted(() => {
  if (!import.meta.client) return
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', updateSystemTheme)
  window.removeEventListener('keydown', handleGlobalShortcut)
})

watch([themeMode, themeName], ([mode, name]) => {
  if (!import.meta.client) return
  applyTheme(mode, name)
  window.localStorage.setItem(themeModeStorageKey, mode)
  window.localStorage.setItem(themeNameStorageKey, name)
})
</script>
