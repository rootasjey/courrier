<template>
  <header class="topbar">
    <div class="topbar-content">
      <div class="topbar-start">
        <NuxtLink v-if="showBackLink" class="topbar-back" :to="backTo">{{ $t('topbar.back') }}</NuxtLink>

        <NPopover
          :open="brandMenuOpen"
          :modal="false"
          :_popover-content="{ side: 'bottom', align: 'start', sideOffset: 12, avoidCollisions: true, 'aria-label': $t('topbar.menu') }"
          :una="{ popoverContent: 'brand-menu-panel topbar-popover-surface' }"
          @update:open="setBrandMenuOpen"
        >
          <template #trigger>
            <button class="brand-trigger" type="button" :aria-label="$t('topbar.openMenu')" :aria-expanded="brandMenuOpen">
              <span class="brand-mark" aria-hidden="true">C</span>
              <span class="brand-name">Courrier</span>
              <svg class="brand-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
            </button>
          </template>
          <template #default>
            <nav class="brand-menu-content" :aria-label="$t('topbar.menu')">
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
              <NuxtLink class="menu-settings" to="/settings" @click="brandMenuOpen = false">{{ $t('topbar.settings') }}</NuxtLink>
            </nav>
          </template>
        </NPopover>
      </div>

      <div class="topbar-end">
        <NPopover
          :open="accountMenuOpen"
          :modal="false"
          :_popover-content="{ side: 'bottom', align: 'end', sideOffset: 12, avoidCollisions: true, 'aria-label': $t('account.openMenu') }"
          :una="{ popoverContent: 'account-menu-panel topbar-popover-surface' }"
          @update:open="setAccountMenuOpen"
        >
          <template #trigger>
            <button class="profile-button" type="button" :aria-label="$t('account.openMenu')" :aria-expanded="accountMenuOpen">
              <img v-if="avatarAvailable" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
              <Avatar v-else :name="avatarName" variant="beam" :size="38" aria-hidden="true" />
            </button>
          </template>
          <template #default>
            <div class="account-menu-content">
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
          </template>
        </NPopover>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { MailboxKey } from '~/utils/mailbox-routing'
import { useI18n } from '#imports'
import { Avatar } from 'tronche/vue'

defineProps<{
  folders: { name: MailboxKey, label: string, slug: string, description: string }[]
  activeFolder: MailboxKey
  showBackLink: boolean
  backTo: string
}>()

const emit = defineEmits<{
  'select-folder': [folder: MailboxKey]
}>()

const brandMenuOpen = ref(false)
const accountMenuOpen = ref(false)
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
const avatarName = computed(() => accountSession.value?.user.displayName || accountSession.value?.user.email || 'Courrier')

function closeAccountMenu() {
  accountMenuOpen.value = false
}

function setBrandMenuOpen(open: boolean) {
  brandMenuOpen.value = open
  if (open) accountMenuOpen.value = false
}

function setAccountMenuOpen(open: boolean) {
  accountMenuOpen.value = open
  if (open) brandMenuOpen.value = false
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  signOutError.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    accountSession.value = null
    // A full document navigation avoids leaving Nuxt's client router on an empty
    // page when the just-cleared session is checked by the public login route.
    window.location.replace('/login')
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
  brandMenuOpen.value = false
}

onMounted(async () => {
  const [avatarResponse, workspaceResponse] = await Promise.all([
    $fetch.raw('/api/profile/avatar', { ignoreResponseError: true }).catch(() => null),
    $fetch<{ activeWorkspaceId: string | null, workspaces: WorkspaceSummary[] }>('/api/account/workspaces').catch(() => null),
  ])
  avatarAvailable.value = avatarResponse?.status === 200
  if (workspaceResponse) {
    workspaces.value = workspaceResponse.workspaces
  }
})
</script>
