<template>
  <header class="topbar">
    <div class="topbar-content">
      <div class="topbar-start">
        <NTooltip v-if="showBackLink" :content="$t('topbar.back')" :una="{ tooltipContent: 'compose-tooltip-content z-[130]' }">
          <NuxtLink class="topbar-back" :to="backTo" :aria-label="$t('topbar.back')">
            <span class="i-tabler-arrow-left" aria-hidden="true" />
          </NuxtLink>
        </NTooltip>
        <div class="brand-switcher">
          <NuxtLink class="brand-home" to="/" :aria-label="$t('topbar.home')" @click="brandMenuOpen = false">
            <BrandMark class="brand-mark" />
            <span class="brand-name">Courrier</span>
          </NuxtLink>
          <NPopover
            :open="brandMenuOpen"
            :modal="false"
            :_popover-content="{ side: 'bottom', align: 'start', sideOffset: 12, avoidCollisions: true, 'aria-label': $t('topbar.menu') }"
            :una="{ popoverContent: 'brand-menu-panel topbar-popover-surface' }"
            @update:open="setBrandMenuOpen"
          >
            <template #trigger>
              <button class="brand-menu-trigger" type="button" :aria-label="$t('topbar.openMenu')" :aria-expanded="brandMenuOpen">
                <svg class="brand-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
              </button>
            </template>
            <template #default>
              <nav class="brand-menu-content" :aria-label="$t('topbar.menu')">
                <p class="menu-heading">{{ $t('topbar.mailboxes') }}</p>
                <div class="brand-menu-grid">
                  <button
                    v-for="folder in folders"
                    :key="folder.name"
                    class="menu-folder"
                    :class="{ 'is-current': activeFolder === folder.name }"
                    type="button"
                    :aria-current="activeFolder === folder.name ? 'page' : undefined"
                    @click="chooseFolder(folder.name)"
                  >
                    <span class="menu-folder-icon" :class="folderIcons[folder.name]" aria-hidden="true" />
                    <span class="menu-folder-label">{{ folder.label }}</span>
                  </button>
                  <NuxtLink
                    class="menu-folder"
                    :class="{ 'is-current': isFilesPage }"
                    to="/mail/files"
                    :aria-current="isFilesPage ? 'page' : undefined"
                    @click="brandMenuOpen = false"
                  >
                    <span class="menu-folder-icon i-tabler-paperclip" aria-hidden="true" />
                    <span class="menu-folder-label">{{ $t('files.title') }}</span>
                  </NuxtLink>
                  <NuxtLink
                    class="menu-folder"
                    :class="{ 'is-current': isContactsPage }"
                    to="/mail/contacts"
                    :aria-current="isContactsPage ? 'page' : undefined"
                    @click="brandMenuOpen = false"
                  >
                    <span class="menu-folder-icon i-tabler-address-book" aria-hidden="true" />
                    <span class="menu-folder-label">{{ $t('contacts.title') }}</span>
                  </NuxtLink>
                  <NuxtLink
                    class="menu-folder"
                    :class="{ 'is-current': isTagsPage }"
                    to="/mail/tags"
                    :aria-current="isTagsPage ? 'page' : undefined"
                    @click="brandMenuOpen = false"
                  >
                    <span class="menu-folder-icon i-tabler-tag" aria-hidden="true" />
                    <span class="menu-folder-label">{{ $t('tags.title') }}</span>
                  </NuxtLink>
                </div>
                <div class="menu-divider" />
                <NuxtLink class="menu-settings" to="/settings" @click="brandMenuOpen = false">
                  <span class="menu-settings-icon i-tabler-settings" aria-hidden="true" />
                  <span>{{ $t('topbar.settings') }}</span>
                </NuxtLink>
              </nav>
            </template>
          </NPopover>
        </div>
      </div>

      <div class="topbar-end">
        <ActivityHistoryMenu v-if="accountSession?.activeWorkspaceId" />
        <NPopover
          :open="accountMenuOpen"
          :modal="false"
          :_popover-content="{ side: 'bottom', align: 'end', sideOffset: 20, avoidCollisions: true, 'aria-label': $t('account.openMenu') }"
          :una="{ popoverContent: 'account-menu-panel topbar-popover-surface' }"
          @update:open="setAccountMenuOpen"
        >
          <template #trigger>
            <button class="profile-button" :class="{ 'is-square-avatar': showTroncheAvatar && avatarConfig?.square }" type="button" :aria-label="$t('account.openMenu')" :aria-expanded="accountMenuOpen">
              <img v-if="showPhotoAvatar" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
              <Avatar v-else-if="showTroncheAvatar && avatarConfig" :name="avatarConfig.name" :variant="avatarConfig.variant" :colors="avatarConfig.colors" :square="avatarConfig.square" :size="38" aria-hidden="true" />
              <Avatar v-else :name="avatarName" variant="beam" :size="38" aria-hidden="true" />
            </button>
          </template>
          <template #default>
            <div class="account-menu-content">
              <div class="account-menu-identity">
                <span class="account-menu-avatar" :class="{ 'is-square-avatar': showTroncheAvatar && avatarConfig?.square }" aria-hidden="true">
                  <img v-if="showPhotoAvatar" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
                  <Avatar v-else-if="showTroncheAvatar && avatarConfig" :name="avatarConfig.name" :variant="avatarConfig.variant" :colors="avatarConfig.colors" :square="avatarConfig.square" :size="36" aria-hidden="true" />
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
                    <span class="account-menu-action-symbol i-tabler-building-lighthouse" />
                  </span>
                  <span class="account-menu-action-label">{{ $t('account.adminConsole') }}</span>
                  <svg class="account-menu-action-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
                </NuxtLink>
                <NuxtLink v-if="accountSession?.activeWorkspaceRole === 'owner' || accountSession?.activeWorkspaceRole === 'admin'" class="account-menu-action" to="/workspace" @click="closeAccountMenu">
                  <span class="account-menu-action-icon" aria-hidden="true">
                    <span class="account-menu-action-symbol i-tabler-users-group" />
                  </span>
                  <span class="account-menu-action-label">{{ $t('account.manageWorkspace') }}</span>
                  <svg class="account-menu-action-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
                </NuxtLink>
                <NuxtLink class="account-menu-action" to="/settings" @click="closeAccountMenu">
                  <span class="account-menu-action-icon" aria-hidden="true">
                    <span class="account-menu-action-symbol i-tabler-settings" />
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
    <svg class="topbar-divider" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="topbar-divider-wave" width="40" height="12" patternUnits="userSpaceOnUse">
          <path d="M 0 0 H 40 V 6 C 28.954 6 31.046 9 20 9 C 8.954 9 11.046 6 0 6 Z" fill="var(--paper)" />
        </pattern>
      </defs>
      <rect width="100%" height="12" fill="var(--canvas)" />
      <rect width="100%" height="12" fill="url(#topbar-divider-wave)" />
    </svg>
  </header>
</template>

<script setup lang="ts">
import type { MailboxKey } from '~/utils/mailbox-routing'
import type { TroncheAvatarConfig } from '#shared/utils/tronche-avatar'
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
const folderIcons: Record<MailboxKey, string> = {
  Screener: 'i-tabler-eyeglass-2-filled',
  Imbox: 'i-tabler-mailbox',
  'The Feed': 'i-tabler-egg-fried',
  'Paper Trail': 'i-tabler-toilet-paper',
  'Reply Later': 'i-tabler-message-reply',
  'Set Aside': 'i-tabler-eggs',
  Trash: 'i-icon-park-outline-delete-themes',
}
const accountMenuOpen = ref(false)
const workspaceMenuOpen = ref(false)
const { $t } = useI18n()
const route = useRoute()
const isFilesPage = computed(() => route.path === '/mail/files')
const isContactsPage = computed(() => route.path === '/mail/contacts')
const isTagsPage = computed(() => route.path === '/mail/tags')
const avatarVersion = useState('courrier-avatar-version', () => 0)
const avatarAvailable = useState('courrier-avatar-available', () => false)
type WorkspaceSummary = { id: string, name: string, role: string }
type AccountSession = { user: { id: string, email: string, displayName: string, avatarMode: 'default' | 'photo' | 'tronche' | null, avatarConfig: TroncheAvatarConfig | null }, activeWorkspaceId: string | null, activeWorkspaceRole: 'owner' | 'admin' | 'member' | 'viewer' | null, isPlatformAdmin: boolean }
const accountSession = useState<AccountSession | null>('courrier-account-session', () => null)
const workspaces = ref<WorkspaceSummary[]>([])
const signingOut = ref(false)
const switchingWorkspace = ref(false)
const workspaceError = ref('')
const signOutError = ref('')
const avatarName = computed(() => accountSession.value?.user.displayName || accountSession.value?.user.email || 'Courrier')
const avatarMode = computed(() => accountSession.value?.user.avatarMode ?? (avatarAvailable.value ? 'photo' : 'default'))
const avatarConfig = computed(() => accountSession.value?.user.avatarConfig ?? null)
const showPhotoAvatar = computed(() => avatarAvailable.value && avatarMode.value === 'photo')
const showTroncheAvatar = computed(() => avatarMode.value === 'tronche')
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
