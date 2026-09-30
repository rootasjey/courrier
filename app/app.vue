<script setup lang="ts">
type Folder = 'Imbox' | 'The Feed' | 'Paper Trail'

type InboxMessage = {
  id: string
  sender: string
  address: string
  subject: string
  preview: string
  date: string
  folder: Folder
  initials: string
  color: string
  body: string
  attachments: { id: string, filename: string, mimeType: string, sizeBytes: number }[]
}

const folders: { name: Folder, description: string }[] = [
  { name: 'Imbox', description: 'À lire et à traiter' },
  { name: 'The Feed', description: 'Newsletters et lectures' },
  { name: 'Paper Trail', description: 'Reçus et confirmations' },
]

const activeFolder = ref<Folder>('Imbox')
const selectedId = ref('')
const search = ref('')
const mobileMessageOpen = ref(false)
const theme = ref<'system' | 'light' | 'dark'>('system')
const isDevelopment = import.meta.dev
const isImportingFixture = ref(false)
const fixtureError = ref('')
const dateLabel = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
}).format(new Date()).replace(' ', ' · ').toLocaleUpperCase('fr')

const { data: inboxMessages, refresh: refreshMessages } = await useFetch<InboxMessage[]>('/api/messages', {
  default: () => [],
})

function applyTheme(preference: 'system' | 'light' | 'dark') {
  const resolvedTheme = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference

  document.documentElement.dataset.theme = resolvedTheme
}

onMounted(() => {
  const savedTheme = window.localStorage.getItem('courrier-theme')
  if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
    theme.value = savedTheme
  }

  applyTheme(theme.value)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') applyTheme('system')
  })
})

watch(theme, (value) => {
  if (!import.meta.client) return

  applyTheme(value)
  window.localStorage.setItem('courrier-theme', value)
})

const visibleMessages = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  return (inboxMessages.value ?? []).filter((message) => {
    const matchesFolder = message.folder === activeFolder.value
    const matchesSearch = !query || `${message.sender} ${message.subject} ${message.preview}`.toLocaleLowerCase('fr').includes(query)
    return matchesFolder && matchesSearch
  })
})

const selectedMessage = computed(() => visibleMessages.value.find(message => message.id === selectedId.value) ?? visibleMessages.value[0])

async function importFixture() {
  isImportingFixture.value = true
  fixtureError.value = ''

  try {
    const fixture = await fetch('/fixtures/courrier-test.eml')
    if (!fixture.ok) throw new Error('Le message de démonstration est introuvable.')

    const result = await $fetch<{ id: string }>('/api/dev/ingest', {
      method: 'POST',
      body: await fixture.text(),
      headers: { 'content-type': 'message/rfc822' },
    })

    await refreshMessages()
    selectedId.value = result.id
  } catch (error) {
    fixtureError.value = error instanceof Error ? error.message : 'Impossible d’importer le message de test.'
  } finally {
    isImportingFixture.value = false
  }
}

function selectFolder(folder: Folder) {
  activeFolder.value = folder
  selectedId.value = inboxMessages.value?.find(message => message.folder === folder)?.id ?? ''
  mobileMessageOpen.value = false
}

useSeoMeta({
  title: 'courrier — votre boîte, à votre façon',
  description: 'Prototype personnel de boîte de réception pour vos domaines.',
})
</script>

<template>
  <main class="mail-app" :class="{ 'show-mobile-message': mobileMessageOpen }">
    <aside class="sidebar" aria-label="Navigation principale">
      <a class="wordmark" href="#inbox" aria-label="courrier, accueil">
        <span class="wordmark-stamp" aria-hidden="true"><span>c</span></span>
        <span>courrier</span>
      </a>

      <button class="account-switcher" type="button" aria-label="Boîte verbatims.cc" disabled>
        <span class="account-icon" aria-hidden="true">v.</span>
        <span class="account-copy">
          <span class="account-name">verbatims.cc</span>
          <span class="account-address">courrier-test@verbatims.cc</span>
        </span>
        <span class="chevron" aria-hidden="true">⌄</span>
      </button>

      <div class="nav-label">VOTRE COURRIER</div>
      <nav class="folder-nav" aria-label="Dossiers">
        <button
          v-for="folder in folders"
          :key="folder.name"
          class="folder-link"
          :class="{ 'is-active': activeFolder === folder.name }"
          type="button"
          :aria-current="activeFolder === folder.name ? 'page' : undefined"
          @click="selectFolder(folder.name)"
        >
          <span class="folder-symbol" aria-hidden="true">{{ folder.name === 'Imbox' ? '◈' : folder.name === 'The Feed' ? '≋' : '⌑' }}</span>
          <span class="folder-copy">
            <span class="folder-name">{{ folder.name }}</span>
            <span class="folder-description">{{ folder.description }}</span>
          </span>
          <span v-if="folder.name === 'Imbox' && inboxMessages?.length" class="folder-count">{{ inboxMessages.length }}</span>
        </button>
      </nav>

      <div class="sidebar-bottom">
        <div class="storage-note">
          <span class="storage-dot" aria-hidden="true" />
          <span v-if="isDevelopment">Prototype local<br><strong>stockage de test</strong></span>
          <span v-else>Réception pilote<br><strong>Cloudflare · relais HEY</strong></span>
        </div>
        <button class="settings-link" type="button" disabled>
          <span aria-hidden="true">⚙</span>
          <span>Réglages</span>
        </button>
        <div class="profile-row">
          <span class="profile-avatar">R</span>
          <span class="profile-name">Votre espace</span>
          <span class="profile-more" aria-hidden="true">···</span>
        </div>
      </div>
    </aside>

    <section class="message-column" aria-label="Liste des conversations">
      <header class="column-header">
        <div class="eyebrow">{{ dateLabel }}</div>
        <div class="heading-row">
          <h1>{{ activeFolder }}</h1>
          <button class="compose-button" type="button" disabled title="L’envoi sera ajouté après stabilisation de la réception">
            <span aria-hidden="true">＋</span> Écrire
          </button>
        </div>
        <div class="search-field">
          <span class="search-symbol" aria-hidden="true">⌕</span>
          <label class="sr-only" for="mail-search">Rechercher dans la boîte</label>
          <input id="mail-search" v-model="search" type="search" placeholder="Rechercher dans la boîte" autocomplete="off">
          <kbd>⌘ K</kbd>
        </div>
        <label class="theme-control">
          <span>Apparence</span>
          <select v-model="theme" aria-label="Choisir le thème">
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
      </header>

      <nav class="mobile-folder-nav" aria-label="Dossiers">
        <button
          v-for="folder in folders"
          :key="folder.name"
          type="button"
          :class="{ 'is-active': activeFolder === folder.name }"
          :aria-current="activeFolder === folder.name ? 'page' : undefined"
          @click="selectFolder(folder.name)"
        >{{ folder.name }}</button>
      </nav>

      <div class="list-caption">
        <span>{{ visibleMessages.length }} message{{ visibleMessages.length > 1 ? 's' : '' }}</span>
          <button type="button" class="sort-button" disabled>Plus récent <span aria-hidden="true">⌄</span></button>
      </div>

      <div v-if="visibleMessages.length" class="thread-list" role="list">
        <div
          v-for="message in visibleMessages"
          :key="message.id"
          role="listitem"
        >
          <button
            class="thread-row"
            :class="{ 'is-selected': selectedMessage?.id === message.id }"
            type="button"
            :aria-pressed="selectedMessage?.id === message.id"
          @click="selectedId = message.id; mobileMessageOpen = true"
          >
            <span class="sender-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
            <span class="thread-content">
              <span class="thread-topline"><strong>{{ message.sender }}</strong><time>{{ message.date }}</time></span>
              <span class="thread-subject">{{ message.subject }}</span>
              <span class="thread-preview">{{ message.preview }}</span>
            </span>
            <span class="thread-star" aria-hidden="true">☆</span>
          </button>
        </div>
      </div>
      <div v-else class="empty-list">
        <span class="empty-mark" aria-hidden="true">⌕</span>
        <strong>Aucun message ici</strong>
        <span>{{ search ? 'Essaie avec un autre mot.' : 'Ce dossier attend ses premiers messages.' }}</span>
        <button v-if="isDevelopment && activeFolder === 'Imbox' && !search" class="fixture-button" type="button" :disabled="isImportingFixture" @click="importFixture">
          {{ isImportingFixture ? 'Import en cours…' : 'Charger un email fictif' }}
        </button>
        <span v-if="fixtureError" class="fixture-error" role="alert">{{ fixtureError }}</span>
      </div>

      <div class="demo-note"><span class="demo-dot" />
        {{ isDevelopment ? 'Données de test locales' : 'Réception réelle · copie relayée vers HEY' }}
      </div>
    </section>

    <section class="reading-column" aria-label="Message sélectionné">
      <div v-if="selectedMessage" class="reading-content">
        <div class="reading-toolbar">
          <span class="breadcrumb">{{ activeFolder }} <span aria-hidden="true">/</span> conversation</span>
          <div class="toolbar-actions">
            <button class="mobile-back" type="button" aria-label="Retour à la liste" @click="mobileMessageOpen = false">←</button>
            <button type="button" aria-label="Archiver" title="Archiver" disabled>⌑</button>
            <button type="button" aria-label="Mettre à la corbeille" title="Mettre à la corbeille" disabled>⌫</button>
            <span class="toolbar-divider" />
            <button type="button" aria-label="Plus d’actions" title="Plus d’actions" disabled>···</button>
          </div>
        </div>

        <div class="message-paper">
          <div class="paper-kicker"><span class="paper-line" /> MESSAGE REÇU <span class="paper-line" /></div>
          <h2>{{ selectedMessage.subject }}</h2>

          <div class="message-meta">
            <span class="sender-avatar meta-avatar" :class="`avatar-${selectedMessage.color}`">{{ selectedMessage.initials }}</span>
            <span class="meta-copy">
              <strong>{{ selectedMessage.sender }}</strong>
              <span>{{ selectedMessage.address }}</span>
            </span>
            <time>{{ selectedMessage.date }}</time>
          </div>

          <div class="message-rule" />
          <p v-for="(paragraph, index) in selectedMessage.body.split('\n\n')" :key="index">{{ paragraph }}</p>
          <div v-if="selectedMessage.attachments.length" class="attachment-list" aria-label="Pièces jointes">
            <span class="attachment-heading">{{ selectedMessage.attachments.length }} pièce{{ selectedMessage.attachments.length > 1 ? 's' : '' }} jointe{{ selectedMessage.attachments.length > 1 ? 's' : '' }}</span>
            <a
              v-for="attachment in selectedMessage.attachments"
              :key="attachment.id"
              class="attachment-item"
              :href="`/api/attachments/${attachment.id}`"
              :download="attachment.filename"
              :aria-label="`Télécharger ${attachment.filename}`"
            >
              <span aria-hidden="true">↳</span>
              <strong>{{ attachment.filename }}</strong>
              <span>{{ Math.max(1, Math.round(attachment.sizeBytes / 1024)) }} Ko</span>
            </a>
          </div>
          <div class="signature">
            {{ isDevelopment ? 'Message conservé dans le stockage de test local.' : 'Message et pièces jointes conservés dans Cloudflare.' }}
          </div>
        </div>

        <div class="reply-placeholder">
          <span class="reply-icon" aria-hidden="true">↩</span>
          <span>L’envoi sera ajouté après stabilisation de la réception.</span>
          <span class="reply-shortcut">R</span>
        </div>
      </div>

      <div v-else class="reading-empty">
        <div class="envelope-art" aria-hidden="true"><span /></div>
        <h2>Votre courrier prendra place ici.</h2>
        <p>Les messages reçus à courrier-test@verbatims.cc apparaîtront ici.</p>
        <span class="postmark">EN ATTENTE<br><strong>VERBATIMS.CC</strong></span>
      </div>
    </section>
  </main>
</template>
