<template>
  <header class="topbar">
    <div class="topbar-start">
      <div v-if="showSearch" class="topbar-search" :class="{ 'is-open': isSearchOpen }">
        <button class="mobile-search-toggle" type="button" aria-label="Rechercher" @click="openMobileSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
        </button>
        <span class="sr-only">Rechercher dans les messages</span>
        <input ref="searchInput" id="mail-search" v-model="searchValue" type="search" placeholder="Rechercher" autocomplete="off">
        <NTooltip v-if="searchExceedsLimit" :content="searchWarningMessage">
          <button class="search-warning" type="button" :aria-label="searchWarningMessage">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8.8 3.3a1.4 1.4 0 0 1 2.4 0l6.1 10.6a1.4 1.4 0 0 1-1.2 2.1H3.9a1.4 1.4 0 0 1-1.2-2.1z" />
              <path d="M10 7v4" />
              <circle cx="10" cy="13.7" r=".6" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </NTooltip>
      </div>
      <NuxtLink v-else class="topbar-back" :to="backTo">Retour à la boîte</NuxtLink>
    </div>

    <details ref="menu" class="brand-menu">
      <summary class="brand-trigger" aria-label="Ouvrir le menu Courrier">
        <span class="brand-mark" aria-hidden="true">C</span>
        <span class="brand-name">Courrier</span>
        <svg class="brand-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
      </summary>
      <nav class="brand-menu-panel" aria-label="Menu Courrier">
        <p class="menu-heading">Vos boîtes</p>
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
          <span v-if="folder.name === 'Screener'" class="menu-folder-note">{{ folder.description }}</span>
        </button>
        <div class="menu-divider" />
        <NuxtLink class="menu-settings" to="/settings" @click="menu && (menu.open = false)">Réglages</NuxtLink>
      </nav>
    </details>

    <div class="topbar-end">
      <button class="profile-button" type="button" aria-label="Votre espace">
        <span>R</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { MailboxKey } from '~/utils/mailbox-routing'

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
const isSearchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const searchValue = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value),
})
const searchExceedsLimit = computed(() => searchValue.value.trim().length > 200)
const searchWarningMessage = 'La recherche est limitée aux 200 premiers caractères. La suite est ignorée.'

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
    menu.value.open = false
  }
}

onMounted(() => window.addEventListener('keydown', closeMenuOnEscape))
onUnmounted(() => window.removeEventListener('keydown', closeMenuOnEscape))
</script>
