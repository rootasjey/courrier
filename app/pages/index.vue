<script setup lang="ts">
type Folder = 'Screener' | 'Imbox' | 'The Feed' | 'Paper Trail'
type MailboxFolder = Exclude<Folder, 'Screener'>

type InboxMessage = {
  id: string
  sender: string
  address: string
  subject: string
  preview: string
  date: string
  folder: Folder
  hasSenderRule: boolean
  isRead: boolean
  initials: string
  color: string
  body: string
  attachments: { id: string, filename: string, mimeType: string, sizeBytes: number }[]
}

const folders: { name: Folder, description: string }[] = [
  { name: 'Screener', description: 'Nouveaux expéditeurs' },
  { name: 'Imbox', description: 'À lire et à traiter' },
  { name: 'The Feed', description: 'Newsletters et lectures' },
  { name: 'Paper Trail', description: 'Reçus et confirmations' },
]

const activeFolder = useState<Folder>('courrier-active-folder', () => 'Imbox')
const search = useState('courrier-search', () => '')
const selectedId = ref('')
const isReadingMessage = ref(false)
const classificationTarget = ref<InboxMessage | null>(null)
const classificationScope = ref<'sender' | 'message'>('sender')
const classificationFolder = ref<MailboxFolder>('Imbox')
const isSavingClassification = ref(false)
const isUndoingClassification = ref(false)
const undoClassificationId = ref('')
const classificationError = ref('')
const classificationFeedback = ref('')
const classificationActionError = ref('')
const messageReadError = ref('')
const isRefreshingInbox = ref(false)
const isDevelopment = import.meta.dev
const isImportingFixture = ref(false)
const fixtureError = ref('')
let undoTimer: ReturnType<typeof setTimeout> | undefined

const { data: inboxMessages, refresh: refreshMessages, error: inboxMessagesError } = await useFetch<InboxMessage[]>('/api/messages', {
  default: () => [],
})

const visibleMessages = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  return (inboxMessages.value ?? []).filter((message) => {
    const matchesFolder = message.folder === activeFolder.value
    const matchesSearch = !query || `${message.sender} ${message.subject} ${message.preview}`.toLocaleLowerCase('fr').includes(query)
    return matchesFolder && matchesSearch
  })
})

const newMessages = computed(() => visibleMessages.value.filter(message => !message.isRead))
const previouslySeenMessages = computed(() => visibleMessages.value.filter(message => message.isRead))

const allScreenerSenders = computed(() => {
  const senders = new Map<string, { address: string, latest: InboxMessage, count: number }>()

  for (const message of (inboxMessages.value ?? []).filter(message => message.folder === 'Screener')) {
    const address = message.address.trim().toLocaleLowerCase('en-US')
    const existing = senders.get(address)
    if (existing) existing.count += 1
    else senders.set(address, { address: message.address, latest: message, count: 1 })
  }

  return [...senders.values()]
})

const screenerSenders = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  if (!query) return allScreenerSenders.value

  return allScreenerSenders.value.filter(({ address, latest }) =>
    `${address} ${latest.sender} ${latest.subject} ${latest.preview}`.toLocaleLowerCase('fr').includes(query),
  )
})

const selectedMessage = computed(() => visibleMessages.value.find(message => message.id === selectedId.value))

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

function openMessage(message: InboxMessage) {
  selectedId.value = message.id
  isReadingMessage.value = true
  messageReadError.value = ''

  if (message.isRead) return

  message.isRead = true
  void $fetch(`/api/messages/${encodeURIComponent(message.id)}/read`, {
    method: 'PATCH',
    body: { isRead: true },
  }).catch(() => {
    message.isRead = false
    messageReadError.value = 'Le message est ouvert, mais son état de lecture n’a pas été enregistré.'
  })
}

async function retryMarkRead() {
  const message = selectedMessage.value
  if (!message || message.isRead) return

  messageReadError.value = ''
  try {
    await $fetch(`/api/messages/${encodeURIComponent(message.id)}/read`, {
      method: 'PATCH',
      body: { isRead: true },
    })
    message.isRead = true
  } catch {
    messageReadError.value = 'Impossible d’enregistrer la lecture. Vérifie ta connexion et réessaie.'
  }
}

async function retryInboxLoad() {
  isRefreshingInbox.value = true
  try {
    await refreshMessages()
  } catch {
    // useFetch exposes the request failure through inboxMessagesError.
  } finally {
    isRefreshingInbox.value = false
  }
}

function closeMessage() {
  isReadingMessage.value = false
  selectedId.value = ''
}

function openClassification(message: InboxMessage, scope: 'sender' | 'message' = 'sender') {
  classificationTarget.value = message
  classificationScope.value = scope
  classificationFolder.value = message.folder === 'Screener' ? 'Imbox' : message.folder
  classificationError.value = ''
}

function showClassificationFeedback(message: string, undoId = '') {
  classificationFeedback.value = message
  classificationActionError.value = ''
  undoClassificationId.value = undoId
  if (undoTimer) clearTimeout(undoTimer)

  if (undoId) {
    undoTimer = setTimeout(() => {
      undoClassificationId.value = ''
      undoTimer = undefined
    }, 20_000)
  }
}

async function undoSenderRule() {
  const changeId = undoClassificationId.value
  if (!changeId || isUndoingClassification.value) return

  isUndoingClassification.value = true
  classificationActionError.value = ''
  try {
    const result = await $fetch<{ restoredMessages: number }>(`/api/sender-rule-changes/${encodeURIComponent(changeId)}/undo`, {
      method: 'POST',
    })
    undoClassificationId.value = ''
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = undefined
    showClassificationFeedback(`Règle annulée : ${result.restoredMessages} message${result.restoredMessages > 1 ? 's' : ''} restauré${result.restoredMessages > 1 ? 's' : ''} dans son emplacement précédent${result.restoredMessages > 1 ? ' respectif' : ''}.`)
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = 'Règle annulée, mais la boîte n’a pas pu se recharger. Utilise Réessayer.'
    }
  } catch {
    classificationActionError.value = 'L’annulation n’a pas abouti. Recharge la boîte et vérifie le classement avant de réessayer.'
  } finally {
    isUndoingClassification.value = false
  }
}

async function saveClassification() {
  const message = classificationTarget.value
  if (!message || isSavingClassification.value) return

  isSavingClassification.value = true
  classificationError.value = ''
  classificationActionError.value = ''

  try {
    if (classificationScope.value === 'sender') {
      const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(message.id)}/sender-rule`, {
        method: 'PUT',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback(`${result.affectedMessages} message${result.affectedMessages > 1 ? 's' : ''} classé${result.affectedMessages > 1 ? 's' : ''} dans ${result.folder}.`, result.undoId)
    } else {
      const result = await $fetch<{ folder: MailboxFolder }>(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
        method: 'PATCH',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback(`Message déplacé dans ${result.folder}. La règle de l’expéditeur reste inchangée.`)
    }

    classificationTarget.value = null
    closeMessage()
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = 'Classement enregistré, mais la boîte n’a pas pu se recharger. Utilise Réessayer.'
    }
  } catch {
    classificationError.value = 'Le classement n’a pas pu être enregistré. Vérifie ta connexion et réessaie.'
  } finally {
    isSavingClassification.value = false
  }
}

onUnmounted(() => {
  if (undoTimer) clearTimeout(undoTimer)
})

useSeoMeta({
  title: 'Courrier — votre boîte, à votre façon',
  description: 'Une boîte de réception personnelle pour vos domaines.',
})
</script>

<template>
  <main class="mail-page">
    <section v-if="!isReadingMessage" class="mailbox-view" aria-label="Boîte de réception">
      <header class="inbox-heading">
        <div class="heading-actions">
          <button
            v-if="allScreenerSenders.length"
            class="screener-callout"
            type="button"
            @click="activeFolder = 'Screener'"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm16 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-1.2A4.8 4.8 0 0 1 6.8 14h.4A4.8 4.8 0 0 1 12 18.8V20m0-1.2a4.8 4.8 0 0 1 4.8-4.8h.4a4.8 4.8 0 0 1 4.8 4.8V20" /></svg>
            <span>{{ allScreenerSenders.length }} expéditeur{{ allScreenerSenders.length > 1 ? 's' : '' }} à examiner</span>
          </button>
          <span v-else class="screener-spacer" aria-hidden="true" />
          <button class="compose-button" type="button" disabled title="L’envoi sera ajouté après stabilisation de la réception">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span>Écrire</span>
          </button>
        </div>
        <h1>{{ activeFolder }}</h1>
        <p v-if="activeFolder === 'Screener'" class="screener-intro">
          Choisis où ranger chaque expéditeur. La règle s’appliquera à ses anciens et à ses futurs messages.
        </p>
      </header>

      <div v-if="classificationFeedback || undoClassificationId || classificationActionError" class="action-feedback">
        <p v-if="classificationFeedback" class="classification-feedback" role="status">{{ classificationFeedback }}</p>
        <button v-if="undoClassificationId" class="undo-action" type="button" :disabled="isUndoingClassification" @click="undoSenderRule">
          {{ isUndoingClassification ? 'Annulation…' : 'Annuler' }}
        </button>
        <p v-if="classificationActionError" class="action-feedback-error" role="alert">{{ classificationActionError }}</p>
      </div>

      <div v-if="inboxMessagesError" class="empty-list error-state" role="alert">
        <strong>La boîte n’a pas pu se charger.</strong>
        <span>Vérifie ta connexion, puis réessaie.</span>
        <button class="fixture-button" type="button" :disabled="isRefreshingInbox" @click="retryInboxLoad">
          {{ isRefreshingInbox ? 'Chargement…' : 'Réessayer' }}
        </button>
      </div>

      <div v-else-if="activeFolder === 'Screener' && screenerSenders.length" class="thread-list screener-list" role="list" aria-label="Expéditeurs à classer">
        <article v-for="sender in screenerSenders" :key="sender.address" class="screener-row" role="listitem">
          <button class="thread-row screener-message" type="button" :aria-label="`Lire le dernier message de ${sender.address}`" @click="openMessage(sender.latest)">
            <span class="sender-avatar" :class="`avatar-${sender.latest.color}`">{{ sender.latest.initials }}</span>
            <span class="thread-content">
              <span class="thread-topline"><strong>{{ sender.latest.sender }}</strong><time>{{ sender.latest.date }}</time></span>
              <span class="thread-address">{{ sender.address }}</span>
              <span class="thread-subject">{{ sender.latest.subject }}</span>
              <span class="thread-preview">{{ sender.latest.preview }}</span>
            </span>
            <span v-if="sender.count > 1" class="sender-message-count">{{ sender.count }}</span>
          </button>
          <button class="sender-classify" type="button" @click="openClassification(sender.latest, 'sender')">Choisir une boîte</button>
        </article>
      </div>

      <template v-else-if="activeFolder === 'Imbox' && visibleMessages.length">
        <section v-if="newMessages.length" class="message-group message-group-new" aria-labelledby="new-messages-heading">
          <header class="group-heading">
            <h2 id="new-messages-heading">Nouveaux messages</h2>
            <span aria-hidden="true" />
          </header>
          <div class="thread-list" role="list">
            <div v-for="message in newMessages" :key="message.id" role="listitem">
              <button class="thread-row" type="button" @click="openMessage(message)">
                <span class="unread-indicator" aria-label="Non lu" />
                <span class="sender-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
                <span class="thread-content">
                  <span class="thread-subject">{{ message.subject }}</span>
                  <span class="thread-preview"><strong>{{ message.sender }}</strong><span aria-hidden="true"> · </span>{{ message.preview }}</span>
                </span>
                <time class="thread-date">{{ message.date }}</time>
              </button>
            </div>
          </div>
        </section>

        <section v-if="previouslySeenMessages.length" class="message-group message-group-seen" aria-labelledby="seen-messages-heading">
          <header class="group-heading">
            <h2 id="seen-messages-heading">Déjà consultés</h2>
            <span aria-hidden="true" />
          </header>
          <div class="thread-list" role="list">
            <div v-for="message in previouslySeenMessages" :key="message.id" role="listitem">
              <button class="thread-row" type="button" @click="openMessage(message)">
                <span class="sender-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
                <span class="thread-content">
                  <span class="thread-subject">{{ message.subject }}</span>
                  <span class="thread-preview"><strong>{{ message.sender }}</strong><span aria-hidden="true"> · </span>{{ message.preview }}</span>
                </span>
                <time class="thread-date">{{ message.date }}</time>
              </button>
            </div>
          </div>
        </section>
      </template>

      <div v-else-if="activeFolder !== 'Screener' && visibleMessages.length" class="thread-list other-folder-list" role="list">
        <div v-for="message in visibleMessages" :key="message.id" role="listitem">
          <button class="thread-row" type="button" @click="openMessage(message)">
            <span v-if="!message.isRead" class="unread-indicator" aria-label="Non lu" />
            <span class="sender-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
            <span class="thread-content">
              <span class="thread-subject">{{ message.subject }}</span>
              <span class="thread-preview"><strong>{{ message.sender }}</strong><span aria-hidden="true"> · </span>{{ message.preview }}</span>
            </span>
            <time class="thread-date">{{ message.date }}</time>
          </button>
        </div>
      </div>

      <div v-else class="empty-list">
        <svg class="empty-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8.5" /><path d="m20 20 6 6" /></svg>
        <strong>{{ activeFolder === 'Screener' ? 'Aucun expéditeur en attente' : 'Aucun message ici' }}</strong>
        <span>{{ search ? 'Essaie avec un autre mot.' : activeFolder === 'Screener' ? 'Les nouveaux expéditeurs apparaîtront ici.' : 'Ce dossier attend ses premiers messages.' }}</span>
        <button v-if="isDevelopment && activeFolder === 'Imbox' && !search" class="fixture-button" type="button" :disabled="isImportingFixture" @click="importFixture">
          {{ isImportingFixture ? 'Import en cours…' : 'Charger un message de test' }}
        </button>
        <span v-if="fixtureError" class="fixture-error" role="alert">{{ fixtureError }}</span>
      </div>
    </section>

    <section v-else-if="selectedMessage" class="reading-column" aria-label="Message sélectionné">
      <div class="reading-toolbar">
        <button class="back-to-list" type="button" @click="closeMessage">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" /></svg>
          <span>Retour à {{ activeFolder }}</span>
        </button>
        <button class="message-classify" type="button" @click="openClassification(selectedMessage)">
          Classer ce message
        </button>
      </div>
      <div v-if="messageReadError" class="message-read-error" role="alert">
        <span>{{ messageReadError }}</span>
        <button v-if="!selectedMessage.isRead" type="button" @click="retryMarkRead">Réessayer</button>
      </div>

      <article class="message-paper">
        <h1 class="message-subject">{{ selectedMessage.subject }}</h1>
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
      </article>

      <div class="reply-placeholder">
        <span class="reply-icon" aria-hidden="true">↩</span>
        <span>L’envoi sera ajouté après stabilisation de la réception.</span>
        <span class="reply-shortcut">R</span>
      </div>
    </section>

    <NDialog
      :open="Boolean(classificationTarget)"
      :title="'Où ranger ses messages ?'"
      :description="classificationTarget ? `${classificationTarget.sender} — ${classificationTarget.address}` : undefined"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog' }"
      @update:open="(open: boolean) => { if (!open && !isSavingClassification) classificationTarget = null }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">{{ classificationTarget?.folder === 'Screener' ? 'Nouvel expéditeur' : 'Classement' }}</p>
          <NDialogTitle class="dialog-title">Où ranger ses messages ?</NDialogTitle>
          <NDialogDescription class="sr-only">Choisissez une boîte pour cet expéditeur, ou déplacez uniquement le message sélectionné.</NDialogDescription>
          <p class="dialog-sender">{{ classificationTarget?.sender }} <span>{{ classificationTarget?.address }}</span></p>
        </header>

        <fieldset class="classification-scope">
          <legend>Portée</legend>
          <label class="scope-option">
            <input v-model="classificationScope" type="radio" value="sender">
            <span><strong>Cet expéditeur</strong><small>Ses messages déjà reçus et les prochains.</small></span>
          </label>
          <label class="scope-option">
            <input v-model="classificationScope" type="radio" value="message">
            <span><strong>Ce message seulement</strong><small>{{ classificationTarget?.hasSenderRule ? 'Les prochains suivront la règle actuelle.' : 'Les autres et les prochains resteront au Screener.' }}</small></span>
          </label>
        </fieldset>

        <fieldset class="classification-destinations">
          <legend>Destination</legend>
          <label v-for="folder in folders.filter(item => item.name !== 'Screener')" :key="folder.name" class="destination-option" :class="{ 'is-picked': classificationFolder === folder.name }">
            <input v-model="classificationFolder" type="radio" :value="folder.name">
            <span><strong>{{ folder.name }}</strong><small>{{ folder.description }}</small></span>
          </label>
        </fieldset>

        <p v-if="classificationError" class="dialog-error" role="alert">{{ classificationError }}</p>
        <footer class="dialog-actions">
          <NDialogClose as-child>
            <button class="dialog-cancel" type="button" :disabled="isSavingClassification">Annuler</button>
          </NDialogClose>
          <button class="dialog-save" type="button" :disabled="isSavingClassification" @click="saveClassification">
            {{ isSavingClassification ? 'Enregistrement…' : classificationScope === 'sender' ? 'Classer l’expéditeur' : 'Déplacer ce message' }}
          </button>
        </footer>
      </template>
    </NDialog>
  </main>
</template>
