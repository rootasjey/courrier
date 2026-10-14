<template>
  <header class="topbar">
    <div class="topbar-start">
      <NuxtLink v-if="showBackLink" class="topbar-back" :to="backTo">{{ $t('topbar.back') }}</NuxtLink>

      <details ref="menu" class="brand-menu">
        <summary class="brand-trigger" :aria-label="$t('topbar.openMenu')">
          <span class="brand-mark" aria-hidden="true">C</span>
          <span class="brand-name">Courrier</span>
          <svg class="brand-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
        </summary>
        <nav class="brand-menu-panel" :aria-label="$t('topbar.menu')">
          <p class="menu-heading">{{ $t('topbar.mailboxes') }}</p>
          <button
            v-for="folder in folders"
            :key="folder.name"
            class="menu-folder"
            :class="{ 'is-current': activeFolder === folder.name }"
            type="button"
            :aria-current="activeFolder === folder.name ? 'page' : undefined"
            @click="chooseFolder(folder.name)"
          >
            <span>{{ folder.label }}</span>
            <span v-if="folder.name === 'Screener' || folder.name === 'Reply Later' || folder.name === 'Set Aside'" class="menu-folder-note">{{ $t(`topbar.folderNotes.${folder.name === 'Screener' ? 'screener' : folder.name === 'Reply Later' ? 'replyLater' : 'setAside'}`) }}</span>
          </button>
          <div class="menu-divider" />
          <NuxtLink class="menu-settings" to="/settings" @click="menu && (menu.open = false)">{{ $t('topbar.settings') }}</NuxtLink>
        </nav>
      </details>
    </div>

    <div class="topbar-end">
      <details ref="accountMenu" class="account-menu">
        <summary class="profile-button" :aria-label="$t('account.openMenu')">
          <img v-if="avatarAvailable" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
          <span v-else>{{ accountInitial }}</span>
        </summary>
        <div class="account-menu-panel">
          <p class="account-menu-name">{{ accountSession?.user.displayName || accountSession?.user.email }}</p>
          <p class="account-menu-email">{{ accountSession?.user.email }}</p>
          <div class="menu-divider" />
          <p class="account-menu-label">{{ $t('account.workspace') }}</p>
          <select
            v-if="workspaces.length"
            class="account-workspace-select"
            :value="accountSession?.activeWorkspaceId || ''"
            :aria-label="$t('account.workspace')"
            :disabled="switchingWorkspace || workspaces.length < 2"
            @change="switchWorkspace"
          >
            <option v-for="workspace in workspaces" :key="workspace.id" :value="workspace.id">{{ workspace.name }}</option>
          </select>
          <p v-else class="account-menu-workspace">{{ accountSession?.isPlatformAdmin ? $t('account.noWorkspace') : $t('account.workspaceLoading') }}</p>
          <NuxtLink v-if="accountSession?.isPlatformAdmin" class="menu-settings" to="/admin" @click="closeAccountMenu">{{ $t('account.adminConsole') }}</NuxtLink>
          <NuxtLink class="menu-settings" to="/settings" @click="closeAccountMenu">{{ $t('topbar.settings') }}</NuxtLink>
          <button class="menu-settings account-signout" type="button" :disabled="signingOut" @click="signOut">
            {{ signingOut ? $t('account.signingOut') : $t('account.signOut') }}
          </button>
          <p v-if="workspaceError" class="account-menu-error" role="alert">{{ workspaceError }}</p>
          <p v-if="signOutError" class="account-menu-error" role="alert">{{ signOutError }}</p>
        </div>
      </details>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { MailboxKey } from '~/utils/mailbox-routing'
import { useI18n } from '#imports'

defineProps<{
  folders: { name: MailboxKey, label: string, slug: string, description: string }[]
  activeFolder: MailboxKey
  showBackLink: boolean
  backTo: string
}>()

const emit = defineEmits<{
  'select-folder': [folder: MailboxKey]
}>()

const menu = ref<HTMLDetailsElement | null>(null)
const accountMenu = ref<HTMLDetailsElement | null>(null)
const { $t } = useI18n()
const avatarVersion = useState('courrier-avatar-version', () => 0)
const avatarAvailable = useState('courrier-avatar-available', () => false)
type WorkspaceSummary = { id: string, name: string, role: string }
type AccountSession = { user: { id: string, email: string, displayName: string }, activeWorkspaceId: string | null, isPlatformAdmin: boolean }
const accountSession = useState<AccountSession | null>('courrier-account-session', () => null)
const workspaces = ref<WorkspaceSummary[]>([])
const signingOut = ref(false)
const switchingWorkspace = ref(false)
const workspaceError = ref('')
const signOutError = ref('')
const accountInitial = computed(() => (accountSession.value?.user.displayName || accountSession.value?.user.email || 'C').trim().slice(0, 1).toLocaleUpperCase())

function closeAccountMenu() {
  if (accountMenu.value) accountMenu.value.open = false
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  signOutError.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    accountSession.value = null
    await navigateTo('/login')
  } catch {
    signOutError.value = $t('account.signOutError')
  } finally {
    signingOut.value = false
  }
}

async function switchWorkspace(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement) || !target.value || switchingWorkspace.value) return
  if (target.value === accountSession.value?.activeWorkspaceId) return
  switchingWorkspace.value = true
  workspaceError.value = ''
  try {
    const response = await $fetch<{ activeWorkspaceId: string }>('/api/account/workspaces/active', {
      method: 'PATCH',
      body: { workspaceId: target.value },
    })
    if (accountSession.value) accountSession.value.activeWorkspaceId = response.activeWorkspaceId
    closeAccountMenu()
    window.location.reload()
  } catch {
    workspaceError.value = $t('account.workspaceSwitchError')
    target.value = accountSession.value?.activeWorkspaceId || ''
  } finally {
    switchingWorkspace.value = false
  }
}

function chooseFolder(folder: MailboxKey) {
  emit('select-folder', folder)
  if (menu.value) menu.value.open = false
}

function closeMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && (menu.value?.open || accountMenu.value?.open)) {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (menu.value) menu.value.open = false
    if (accountMenu.value) accountMenu.value.open = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', closeMenuOnEscape)
  const [avatarResponse, workspaceResponse] = await Promise.all([
    $fetch.raw('/api/profile/avatar', { ignoreResponseError: true }).catch(() => null),
    $fetch<{ activeWorkspaceId: string | null, workspaces: WorkspaceSummary[] }>('/api/account/workspaces').catch(() => null),
  ])
  avatarAvailable.value = avatarResponse?.status === 200
  if (workspaceResponse) {
    workspaces.value = workspaceResponse.workspaces
  }
})
onUnmounted(() => window.removeEventListener('keydown', closeMenuOnEscape))
</script>
