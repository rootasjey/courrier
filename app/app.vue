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
    <PageLoadingIndicator />
    <CommandPalette v-if="!isPublicAuthRoute" v-model:open="commandPaletteOpen" />
  </div>
</template>

<script setup lang="ts">
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource-variable/dm-sans/wght-italic.css'
import AppTopbar from '~/components/AppTopbar.vue'
import PageLoadingIndicator from '~/components/PageLoadingIndicator.vue'
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
type AccountThemePreferences = {
  user: { id: string, themeMode: ThemeMode | null, themeName: ThemeName | null }
} | null
const accountSession = useState<AccountThemePreferences>('courrier-account-session', () => null)
const accountHasThemePreferences = computed(() => isThemeMode(accountSession.value?.user.themeMode ?? null)
  && isThemeName(accountSession.value?.user.themeName ?? null))
const themeMode = useState<ThemeMode>('courrier-color-mode', () => {
  const saved = accountSession.value?.user.themeMode
  return isThemeMode(saved ?? null) ? saved : 'system'
})
const themeName = useState<ThemeName>('courrier-theme-family', () => {
  const saved = accountSession.value?.user.themeName
  return isThemeName(saved ?? null) ? saved : 'paper'
})
const themeReady = ref(false)
const systemPrefersDark = ref(false)
const themeSyncStatus = useState<'idle' | 'saving' | 'saved' | 'error'>('courrier-theme-sync-status', () => 'idle')
let lastSavedThemePair = accountHasThemePreferences.value
  ? accountSession.value!.user.themeMode + ':' + accountSession.value!.user.themeName
  : ''
let themeSaveQueue = Promise.resolve()
const commandPaletteOpen = useState('courrier-command-palette-open', () => false)
const themeModeStorageKey = 'courrier-color-mode'
const themeNameStorageKey = 'courrier-theme-family'
const legacyThemeStorageKey = 'courrier-theme'
const themeBootstrapScript = '(()=>{try{const r=document.documentElement;let m=r.dataset.themeMode||"system";let n=r.dataset.themeVariant||"paper";if(r.dataset.themeSource!=="account"){const modes=["system","light","dark"];const names=["paper","forest","graphite","lavender","ayu","one-dark-pro","synthwave","shades-purple","min"];const sm=localStorage.getItem("courrier-color-mode");const sn=localStorage.getItem("courrier-theme-family");const old=localStorage.getItem("courrier-theme");if(modes.includes(sm))m=sm;if(names.includes(sn))n=sn;else if(old==="forest"){m="dark";n="forest"}else if(old==="graphite"||old==="dark"){m="dark";n="graphite"}else if(old==="black"){m="dark";n="lavender"}else if(old==="paper"||old==="light"){m="light";n="paper"}else if(old==="system"){m="system";n=matchMedia("(prefers-color-scheme: dark)").matches?"graphite":"paper"}r.dataset.themeMode=m;r.dataset.themeVariant=n}r.dataset.theme=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m}catch{}})()'

useHead({
  htmlAttrs: {
    'data-theme': computed(() => themeMode.value === 'system'
      ? (systemPrefersDark.value ? 'dark' : 'light')
      : themeMode.value),
    'data-theme-mode': computed(() => themeMode.value),
    'data-theme-variant': computed(() => themeName.value),
    'data-theme-source': computed(() => accountHasThemePreferences.value ? 'account' : 'browser'),
  },
  link: [
    { rel: 'icon', type: 'image/png', href: '/courrier-mark.png' },
    { rel: 'preload', as: 'image', href: '/courrier-loader/stamp-base.png' },
    { rel: 'preload', as: 'image', href: '/courrier-loader/stamp-gull.png' },
    { rel: 'preload', as: 'image', href: '/courrier-loader/stamp-waves.png' },
  ],
  script: [{ key: 'courrier-theme-bootstrap', innerHTML: themeBootstrapScript, tagPosition: 'head' }],
})

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
  document.documentElement.dataset.themeMode = mode
  document.documentElement.dataset.themeVariant = theme
}

function updateSystemTheme() {
  systemPrefersDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
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

  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'g' && !event.altKey && !event.shiftKey) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    commandPaletteOpen.value = !commandPaletteOpen.value
    return
  }

  if (event.key === 'Escape') {
    if (event.defaultPrevented || isTyping || route.path.startsWith('/settings') || route.path === mailboxPath('Imbox')) return
    const activeElement = document.activeElement
    const activeSurface = activeElement instanceof HTMLElement
      && Boolean(activeElement.closest('[role="dialog"], [role="menu"], [role="listbox"], [data-state="open"], [aria-expanded="true"]'))
    const openSurface = [...document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [aria-haspopup="dialog"][aria-expanded="true"], [aria-haspopup="menu"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]',
    )].some(surface => surface.getClientRects().length > 0)
    if (activeSurface || openSurface || document.querySelector('details[open]')) return

    const previousPath = window.history.state?.back
    if (typeof previousPath === 'string' && previousPath.startsWith('/') && previousPath !== route.fullPath
      && !previousPath.startsWith('/login') && !previousPath.startsWith('/password-reset')) {
      void router.back()
    } else {
      void router.push(mailboxPath('Imbox'))
    }
    return
  }

  if (event.metaKey || event.ctrlKey || event.altKey || isTyping || isDialogOpen) return

  const folder = shortcutFolder(event.key, event.code, event.shiftKey)
  if (!folder) return

  event.preventDefault()
  selectFolder(folder)
}

onBeforeMount(() => {
  const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  systemPrefersDark.value = systemIsDark
  const savedMode = window.localStorage.getItem(themeModeStorageKey)
  const savedThemeName = window.localStorage.getItem(themeNameStorageKey)
  const migrated = migrateLegacyTheme(window.localStorage.getItem(legacyThemeStorageKey), systemIsDark)

  if (accountHasThemePreferences.value) {
    themeMode.value = accountSession.value!.user.themeMode!
    themeName.value = accountSession.value!.user.themeName!
  } else {
    if (isThemeMode(savedMode)) themeMode.value = savedMode
    else if (migrated) themeMode.value = migrated.mode

    if (isThemeName(savedThemeName)) themeName.value = savedThemeName
    else if (migrated) themeName.value = migrated.theme
  }

  window.localStorage.removeItem(legacyThemeStorageKey)
  applyTheme(themeMode.value, themeName.value)
  window.localStorage.setItem(themeModeStorageKey, themeMode.value)
  window.localStorage.setItem(themeNameStorageKey, themeName.value)
  if (!accountHasThemePreferences.value && accountSession.value?.user.id) {
    void persistThemePreferences(themeMode.value, themeName.value)
  }
  themeReady.value = true
})

onMounted(() => {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateSystemTheme)
  window.addEventListener('keydown', handleGlobalShortcut, true)
})

onUnmounted(() => {
  if (!import.meta.client) return
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', updateSystemTheme)
  window.removeEventListener('keydown', handleGlobalShortcut, true)
})

watch([themeMode, themeName], ([mode, name]) => {
  if (!import.meta.client) return
  applyTheme(mode, name)
  window.localStorage.setItem(themeModeStorageKey, mode)
  window.localStorage.setItem(themeNameStorageKey, name)
  if (accountHasThemePreferences.value
    && accountSession.value?.user.themeMode === mode
    && accountSession.value.user.themeName === name) return
  if (themeReady.value) void persistThemePreferences(mode, name)
})

function persistThemePreferences(mode: ThemeMode, name: ThemeName) {
  const pair = mode + ':' + name
  if (pair === lastSavedThemePair) return

  themeSaveQueue = themeSaveQueue.catch(() => {}).then(async () => {
    if (pair === lastSavedThemePair) return
    themeSyncStatus.value = 'saving'
    try {
      const saved = await $fetch<{ themeMode: ThemeMode, themeName: ThemeName }>('/api/account/preferences', {
        method: 'PATCH',
        body: { themeMode: mode, themeName: name },
      })
      lastSavedThemePair = saved.themeMode + ':' + saved.themeName
      if (accountSession.value) {
        accountSession.value.user.themeMode = saved.themeMode
        accountSession.value.user.themeName = saved.themeName
      }
      themeSyncStatus.value = 'saved'
    } catch {
      themeSyncStatus.value = 'error'
    }
  })
  return themeSaveQueue
}
</script>
