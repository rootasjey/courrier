<template>
  <header class="topbar">
    <div class="topbar-start">
      <div v-if="showSearch" class="topbar-search" :class="{ 'is-open': isSearchOpen }">
        <button class="mobile-search-toggle" type="button" :aria-label="$t('topbar.search')" @click="openMobileSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
        </button>
        <span class="sr-only">{{ $t('topbar.searchMessages') }}</span>
        <input ref="searchInput" id="mail-search" v-model="searchValue" type="search" :placeholder="$t('topbar.search')" autocomplete="off">
        <NTooltip v-if="searchExceedsLimit" :content="$t('topbar.searchLimit')">
          <button class="search-warning" type="button" :aria-label="$t('topbar.searchLimit')">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8.8 3.3a1.4 1.4 0 0 1 2.4 0l6.1 10.6a1.4 1.4 0 0 1-1.2 2.1H3.9a1.4 1.4 0 0 1-1.2-2.1z" />
              <path d="M10 7v4" />
              <circle cx="10" cy="13.7" r=".6" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </NTooltip>
      </div>
      <NuxtLink v-else class="topbar-back" :to="backTo">{{ $t('topbar.back') }}</NuxtLink>
    </div>

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

    <div class="topbar-end">
      <NuxtLink class="profile-button" to="/settings" :aria-label="$t('topbar.profile')">
        <img v-if="avatarAvailable" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
        <Avatar v-else name="Courrier profile" variant="beam" :size="38" />
      </NuxtLink>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Avatar } from 'tronche/vue'
import type { MailboxKey } from '~/utils/mailbox-routing'
import { useI18n } from '#imports'

const props = defineProps<{
  folders: { name: MailboxKey, label: string, slug: string, description: string }[]
  activeFolder: MailboxKey
  search: string
  showSearch: boolean
  backTo: string
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'select-folder': [folder: MailboxKey]
}>()

const menu = ref<HTMLDetailsElement | null>(null)
const { $t } = useI18n()
const avatarVersion = useState('courrier-avatar-version', () => 0)
const avatarAvailable = useState('courrier-avatar-available', () => false)
const isSearchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const searchValue = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value),
})
const searchExceedsLimit = computed(() => searchValue.value.trim().length > 200)
function chooseFolder(folder: MailboxKey) {
  emit('select-folder', folder)
  if (menu.value) menu.value.open = false
}

function openMobileSearch() {
  isSearchOpen.value = true
  nextTick(() => searchInput.value?.focus())
}

function closeMenuOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && menu.value?.open) {
    event.preventDefault()
    event.stopImmediatePropagation()
    menu.value.open = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', closeMenuOnEscape)
  const response = await $fetch.raw('/api/profile/avatar', { ignoreResponseError: true }).catch(() => null)
  avatarAvailable.value = response?.status === 200
})
onUnmounted(() => window.removeEventListener('keydown', closeMenuOnEscape))
</script>
