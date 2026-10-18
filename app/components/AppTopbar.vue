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
          :_popover-content="{ side: 'bottom', align: 'end', sideOffset: 20, avoidCollisions: true, 'aria-label': $t('account.openMenu') }"
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
              <div class="account-menu-identity">
                <span class="account-menu-avatar" aria-hidden="true">
                  <img v-if="avatarAvailable" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
                  <Avatar v-else :name="avatarName" variant="beam" :size="36" aria-hidden="true" />
                </span>
                <div class="account-menu-identity-copy">
                  <p class="account-menu-name">{{ accountSession?.user.displayName || accountSession?.user.email }}</p>
                  <p class="account-menu-email">{{ accountSession?.user.email }}</p>
                </div>
              </div>

              <div class="account-menu-divider" />

              <section class="account-menu-workspace-section">
                <p class="account-menu-label">{{ $t('account.workspace') }}</p>
                <NCombobox
                  v-if="workspaces.length"
                  class="account-workspace-combobox"
                  :items="workspaceOptions"
                  :model-value="activeWorkspaceOption"
                  :open="workspaceMenuOpen"
                  :disabled="switchingWorkspace || workspaces.length < 2"
                  by="value"
                  :_combobox-input="{ placeholder: $t('account.findWorkspace'), autocomplete: 'off' }"
                  :_combobox-list="{ align: 'end', side: 'bottom', sideOffset: 7, class: 'account-workspace-list z-[130]' }"
                  :_combobox-viewport="{ class: 'account-workspace-viewport' }"
                  :_combobox-trigger="{ class: 'account-workspace-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('account.workspace') }"
                  :_combobox-item="{ class: 'account-workspace-item' }"
                  :text-empty="$t('account.noWorkspaceMatch')"
                  @update:open="setWorkspaceMenuOpen"
                  @update:model-value="switchWorkspace"
                >
                  <template #trigger>
                    <span>{{ activeWorkspaceOption?.label || $t('account.chooseWorkspace') }}</span>
                  </template>
                </NCombobox>
                <p v-else class="account-menu-workspace">{{ accountSession?.isPlatformAdmin ? $t('account.noWorkspace') : $t('account.workspaceLoading') }}</p>
              </section>

              <div class="account-menu-divider" />

              <div class="account-menu-actions">
                <NuxtLink v-if="accountSession?.isPlatformAdmin" class="account-menu-action" to="/admin" @click="closeAccountMenu">
                  <span class="account-menu-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none"><path d="M3.5 16.5V5.8a1.3 1.3 0 0 1 1.3-1.3h10.4a1.3 1.3 0 0 1 1.3 1.3v10.7M2.5 16.5h15M7 7.5h2m2 0h2M7 10.5h2m2 0h2M8 16.5v-3h4v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  </span>
                  <span class="account-menu-action-label">{{ $t('account.adminConsole') }}</span>
                  <svg class="account-menu-action-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
                </NuxtLink>
                <NuxtLink class="account-menu-action" to="/settings" @click="closeAccountMenu">
                  <span class="account-menu-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none"><path d="M10 7.1a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z" stroke="currentColor" stroke-width="1.5"/><path d="m16.5 11.1 1.1.8-1.5 2.6-1.3-.5a6.8 6.8 0 0 1-1.5.9l-.2 1.4h-3l-.2-1.4a6.8 6.8 0 0 1-1.5-.9l-1.3.5-1.5-2.6 1.1-.8a6.6 6.6 0 0 1 0-1.8l-1.1-.8 1.5-2.6 1.3.5a6.8 6.8 0 0 1 1.5-.9l.2-1.4h3l.2 1.4a6.8 6.8 0 0 1 1.5.9l1.3-.5 1.5 2.6-1.1.8c.1.6.1 1.2 0 1.8Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                  <span class="account-menu-action-label">{{ $t('topbar.settings') }}</span>
                  <svg class="account-menu-action-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
                </NuxtLink>
              </div>

              <div class="account-menu-divider" />

              <button class="account-menu-action account-signout" type="button" :disabled="signingOut" @click="signOut">
                <span class="account-menu-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M8 3.5H5.3A1.3 1.3 0 0 0 4 4.8v10.4a1.3 1.3 0 0 0 1.3 1.3H8M12.5 13l3-3-3-3m3 3H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </span>
                <span class="account-menu-action-label">{{ signingOut ? $t('account.signingOut') : $t('account.signOut') }}</span>
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
const workspaceMenuOpen = ref(false)
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
const workspaceOptions = computed(() => workspaces.value.map(workspace => ({ value: workspace.id, label: workspace.name })))
const activeWorkspaceOption = computed(() => workspaceOptions.value.find(option => option.value === accountSession.value?.activeWorkspaceId) || null)

function closeAccountMenu() {
  accountMenuOpen.value = false
  workspaceMenuOpen.value = false
}

function setBrandMenuOpen(open: boolean) {
  brandMenuOpen.value = open
  if (open) closeAccountMenu()
}

function setAccountMenuOpen(open: boolean) {
  accountMenuOpen.value = open
  if (!open) workspaceMenuOpen.value = false
  if (open) brandMenuOpen.value = false
}

function setWorkspaceMenuOpen(open: boolean) {
  workspaceMenuOpen.value = open
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

async function switchWorkspace(option: { value: string } | null | undefined) {
  if (!option?.value || switchingWorkspace.value) return
  workspaceMenuOpen.value = false
  if (option.value === accountSession.value?.activeWorkspaceId) return
  switchingWorkspace.value = true
  workspaceError.value = ''
  try {
    const response = await $fetch<{ activeWorkspaceId: string }>('/api/account/workspaces/active', {
      method: 'PATCH',
      body: { workspaceId: option.value },
    })
    if (accountSession.value) accountSession.value.activeWorkspaceId = response.activeWorkspaceId
    closeAccountMenu()
    window.location.reload()
  } catch {
    workspaceError.value = $t('account.workspaceSwitchError')
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
