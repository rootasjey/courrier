<template>
  <main class="sender-profile-page">
    <div class="sender-profile-shell">
      <NuxtLink class="sender-profile-back" :to="returnTo">← {{ returnLabel }}</NuxtLink>

      <section v-if="error" class="sender-profile-state" role="alert">
        <strong>Cette fiche n’a pas pu être chargée.</strong>
        <span>Vérifie ta connexion, puis réessaie.</span>
        <button type="button" :disabled="pending" @click="refresh()">{{ pending ? 'Chargement…' : 'Réessayer' }}</button>
      </section>
      <section v-else-if="!messages.length" class="sender-profile-state">
        <strong>Aucun message trouvé pour cette adresse.</strong>
        <span>Elle a peut-être été supprimée ou n’est plus disponible.</span>
      </section>
      <template v-else>
        <header class="sender-profile-heading">
          <span class="sender-profile-avatar" :class="`avatar-${latestMessage.color}`">{{ latestMessage.initials }}</span>
          <div>
            <p class="sender-profile-kicker">Expéditeur</p>
            <h1>{{ latestMessage.sender }}</h1>
            <p class="sender-profile-address">{{ address }}</p>
          </div>
        </header>

        <section class="sender-profile-history" aria-labelledby="sender-history-title">
          <div class="sender-profile-section-heading">
            <h2 id="sender-history-title">Messages reçus</h2>
            <span>{{ messages.length }}</span>
          </div>

          <article v-for="group in mailboxGroups" :key="group.domain" class="sender-mailbox-group">
            <header class="sender-rule-panel">
              <div class="sender-rule-description">
                <span class="sender-rule-domain">{{ group.domain }}</span>
                <span v-if="group.blocked" class="sender-blocked-status">Adresse bloquée · les prochains messages sont rejetés</span>
                <span v-else class="sender-rule-status">{{ group.rule ? 'Classement automatique' : 'Aucune règle enregistrée' }}</span>
                <span class="sender-rule-hint">{{ group.blocked ? 'Le choix reclasse l’historique ; les nouveaux messages resteront rejetés tant que l’adresse est bloquée.' : 'Le choix s’applique aux prochains messages et reclasse l’historique. Set Aside et Reply Later restent intactes.' }}</span>
              </div>
              <form class="sender-rule-form" @submit.prevent="applyRule(group)">
                <label class="sr-only" :for="`sender-folder-${group.domain}`">Boîte pour {{ address }} sur {{ group.domain }}</label>
                <select :id="`sender-folder-${group.domain}`" :value="selectedFolder(group)" :disabled="savingDomain === group.domain" @change="selectFolder(group.domain, $event)">
                  <option value="Imbox">Inbox</option>
                  <option value="The Feed">Feed</option>
                  <option value="Paper Trail">Paper</option>
                </select>
                <button type="submit" :disabled="savingDomain === group.domain || selectedFolder(group) === group.rule">
                  {{ savingDomain === group.domain ? 'Enregistrement…' : 'Reclasser les messages' }}
                </button>
              </form>
            </header>

            <p v-if="ruleNotice[group.domain]" class="sender-rule-notice" role="status">{{ ruleNotice[group.domain] }}</p>
            <p v-if="ruleErrors[group.domain]" class="sender-rule-error" role="alert">{{ ruleErrors[group.domain] }}</p>
            <button v-if="undoDomain === group.domain && undoClassificationId" class="sender-rule-undo" type="button" :disabled="isUndoingRule" @click="undoRule(group)">
              {{ isUndoingRule ? 'Annulation…' : 'Annuler' }}
            </button>

            <div class="sender-history-list" role="list" :aria-label="`Messages de ${address} reçus par ${group.domain}`">
              <NuxtLink v-for="message in group.messages" :key="message.id" class="sender-history-row" role="listitem" :to="messagePath(message)">
                <span class="sender-history-copy">
                  <strong>{{ message.subject || '(sans objet)' }}</strong>
                  <span>{{ message.preview || 'Aucun aperçu disponible.' }}</span>
                </span>
                <span class="sender-history-meta">
                  <span class="sender-folder-label" :class="{ 'is-queue': message.isSetAside || message.isReplyLater }">{{ folderLabel(message) }}</span>
                  <time :datetime="message.timestamp">{{ formatDate(message.timestamp) }}</time>
                </span>
              </NuxtLink>
            </div>
          </article>
        </section>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { mailboxByName, mailboxPath, threadPath, type MailboxKey } from '~/utils/mailbox-routing'

type MailboxFolder = 'Imbox' | 'The Feed' | 'Paper Trail'
type MessageFolder = MailboxFolder | 'Screener' | 'Trash'
type SenderMessage = {
  id: string
  threadId: string
  manualMergeIds: string[]
  sender: string
  address: string
  subject: string
  preview: string
  date: string
  timestamp: string
  folder: MessageFolder
  mailboxDomain: string
  screenerState: 'pending' | 'cleared' | 'blocked'
  hasSenderRule: boolean
  senderRuleFolder: MailboxFolder | null
  isBlockedSender: boolean
  isRead: boolean
  isSetAside: boolean
  isReplyLater: boolean
  isOutgoing: boolean
  recipient: string
  initials: string
  color: string
  body: string
  attachments: { id: string, filename: string, mimeType: string, sizeBytes: number }[]
}
type SenderMailboxGroup = { domain: string, messages: SenderMessage[], rule: MailboxFolder | null, blocked: boolean }

const route = useRoute()
const router = useRouter()
const returnTo = ref(mailboxPath('Imbox'))
onMounted(() => {
  const back = router.options.history.state.back
  if (typeof back === 'string' && back.startsWith('/mail/') && !back.startsWith('/mail/senders/')) {
    returnTo.value = back
  }
})
const returnLabel = computed(() => returnTo.value === mailboxPath('Imbox') ? 'Retour à Inbox' : 'Retour au message')
const rawAddress = Array.isArray(route.params.address) ? route.params.address[0] : route.params.address
const address = computed(() => {
  try {
    return decodeURIComponent(String(rawAddress ?? '')).trim().toLocaleLowerCase('en-US')
  } catch {
    return String(rawAddress ?? '').trim().toLocaleLowerCase('en-US')
  }
})
const { data, pending, error, refresh } = await useFetch<SenderMessage[]>('/api/messages', { default: () => [] })
const ruleSelections = reactive<Record<string, MailboxFolder>>({})
const ruleNotice = reactive<Record<string, string>>({})
const ruleErrors = reactive<Record<string, string>>({})
const savingDomain = ref('')
const undoClassificationId = useState('courrier-undo-classification-id', () => '')
const classificationFeedback = useState('courrier-classification-feedback', () => '')
const undoDomain = useState('courrier-undo-classification-domain', () => '')
const isUndoingRule = ref(false)
let undoTimer: ReturnType<typeof setTimeout> | undefined

const messages = computed(() => (data.value ?? [])
  .filter(message => !message.isOutgoing && message.address.trim().toLocaleLowerCase('en-US') === address.value)
  .sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
const latestMessage = computed(() => messages.value[0]!)
const mailboxGroups = computed<SenderMailboxGroup[]>(() => {
  const groups = new Map<string, SenderMailboxGroup>()
  for (const message of messages.value) {
    let group = groups.get(message.mailboxDomain)
    if (!group) {
      group = { domain: message.mailboxDomain, messages: [], rule: message.senderRuleFolder, blocked: message.isBlockedSender }
      groups.set(message.mailboxDomain, group)
    }
    group.messages.push(message)
    if (message.senderRuleFolder) group.rule = message.senderRuleFolder
    group.blocked ||= message.isBlockedSender
  }
  return [...groups.values()].sort((a, b) => a.domain.localeCompare(b.domain))
})

function selectedFolder(group: SenderMailboxGroup) {
  return ruleSelections[group.domain] ?? group.rule ?? 'Imbox'
}

function selectFolder(domain: string, event: Event) {
  ruleSelections[domain] = (event.target as HTMLSelectElement).value as MailboxFolder
  ruleNotice[domain] = ''
  ruleErrors[domain] = ''
}

async function applyRule(group: SenderMailboxGroup) {
  const target = group.messages.find(message => !message.isSetAside && !message.isReplyLater) ?? group.messages[0]
  if (!target || savingDomain.value) return
  savingDomain.value = group.domain
  ruleNotice[group.domain] = ''
  ruleErrors[group.domain] = ''
  try {
    const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(target.id)}/sender-rule`, {
      method: 'PUT',
      body: { folder: selectedFolder(group) },
    })
    ruleSelections[group.domain] = result.folder
    ruleNotice[group.domain] = `${result.affectedMessages} message${result.affectedMessages === 1 ? '' : 's'} classé${result.affectedMessages === 1 ? '' : 's'} dans ${mailboxByName(result.folder).label}.`
    classificationFeedback.value = ruleNotice[group.domain]
    undoClassificationId.value = result.undoId
    undoDomain.value = group.domain
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = setTimeout(() => {
      if (undoClassificationId.value === result.undoId) {
        undoClassificationId.value = ''
        undoDomain.value = ''
      }
      undoTimer = undefined
    }, 20_000)
    await refresh()
  } catch (cause) {
    const statusMessage = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
    ruleErrors[group.domain] = statusMessage || 'Le classement n’a pas pu être enregistré. Réessaie.'
  } finally {
    savingDomain.value = ''
  }
}

async function undoRule(group: SenderMailboxGroup) {
  const changeId = undoClassificationId.value
  if (!changeId || isUndoingRule.value) return
  isUndoingRule.value = true
  ruleErrors[group.domain] = ''
  try {
    const result = await $fetch<{ restoredMessages: number }>(`/api/sender-rule-changes/${encodeURIComponent(changeId)}/undo`, { method: 'POST' })
    undoClassificationId.value = ''
    undoDomain.value = ''
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = undefined
    delete ruleSelections[group.domain]
    const restored = result.restoredMessages
    ruleNotice[group.domain] = restored === 1
      ? 'Règle annulée : 1 message restauré à son emplacement précédent.'
      : `Règle annulée : ${restored} messages restaurés à leurs emplacements précédents.`
    classificationFeedback.value = ruleNotice[group.domain]
    await refresh()
  } catch (cause) {
    const statusMessage = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
    ruleErrors[group.domain] = statusMessage || 'L’annulation n’a pas abouti. Recharge la fiche et vérifie le classement.'
  } finally {
    isUndoingRule.value = false
  }
}

function folderLabel(message: SenderMessage) {
  if (message.isSetAside) return 'Set Aside'
  if (message.isReplyLater) return 'Reply Later'
  return mailboxByName(message.folder).label
}

function messagePath(message: SenderMessage) {
  const mailbox: MailboxKey = message.isSetAside ? 'Set Aside'
    : message.isReplyLater ? 'Reply Later'
      : message.folder
  return threadPath(mailbox, message.threadId)
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}

useSeoMeta({
  title: computed(() => `${latestMessage.value?.sender ?? address.value} — Courrier`),
  description: computed(() => `Historique et classement des messages de ${address.value}.`),
})
</script>

<style scoped>
.sender-profile-page { min-height: calc(100vh - 76px); padding: 32px clamp(20px, 5vw, 76px) 64px; }
.sender-profile-shell { width: min(100%, 1120px); margin: 0 auto; }
.sender-profile-back { display: inline-flex; align-items: center; min-height: 40px; margin: 0 0 32px; color: var(--violet); font-size: 14px; font-weight: 620; text-decoration: none; }
.sender-profile-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.sender-profile-heading { display: flex; align-items: center; gap: 20px; margin: 0 0 42px; }
.sender-profile-avatar { display: grid; width: 68px; height: 68px; flex: 0 0 68px; place-items: center; border-radius: 50%; font-size: 20px; font-weight: 700; }
.avatar-terracotta { background: #f5ded7; color: #865044; }
.avatar-blue { background: #cfeeff; color: #315f7a; }
.avatar-green { background: #b5f2e3; color: #285f54; }
.avatar-gold { background: #ffedbe; color: #76602a; }
.sender-profile-kicker { margin: 0 0 4px; color: var(--quiet); font-size: 12px; font-weight: 650; }
.sender-profile-heading h1 { margin: 0; color: var(--ink); font-size: clamp(28px, 4vw, 40px); font-weight: 730; letter-spacing: -1.25px; line-height: 1.12; overflow-wrap: anywhere; }
.sender-profile-address { margin: 6px 0 0; color: var(--muted); font-size: 15px; overflow-wrap: anywhere; }
.sender-profile-history { border-top: 1px solid var(--line); }
.sender-profile-section-heading { display: flex; align-items: baseline; gap: 10px; padding: 20px 0 13px; }
.sender-profile-section-heading h2 { margin: 0; color: var(--ink); font-size: 19px; font-weight: 700; letter-spacing: -.3px; }
.sender-profile-section-heading > span { color: var(--quiet); font-size: 12px; font-variant-numeric: tabular-nums; }
.sender-mailbox-group + .sender-mailbox-group { margin-top: 30px; }
.sender-rule-panel { display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 17px 19px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); }
.sender-rule-description { display: grid; min-width: 0; gap: 5px; }
.sender-rule-domain { overflow: hidden; color: var(--ink); font-size: 14px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.sender-rule-status, .sender-blocked-status { color: var(--muted); font-size: 12px; line-height: 1.4; }
.sender-rule-hint { max-width: 540px; color: var(--quiet); font-size: 11px; line-height: 1.45; }
.sender-blocked-status { color: var(--error); }
.sender-rule-form { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
.sender-rule-form select { min-width: 122px; min-height: 38px; padding: 0 30px 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; }
.sender-rule-form button, .sender-profile-state button { min-height: 38px; padding: 0 14px; border: 0; border-radius: 20px; background: var(--violet); color: white; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; transition: background-color 140ms ease, opacity 140ms ease; }
.sender-rule-form button:hover:not(:disabled), .sender-profile-state button:hover:not(:disabled) { background: var(--violet-hover); }
.sender-rule-form button:disabled, .sender-profile-state button:disabled { cursor: not-allowed; opacity: .5; }
.sender-rule-undo { min-height: 32px; margin: 9px 0 0 3px; padding: 0 12px; border: 1px solid var(--line); border-radius: 17px; background: var(--paper); color: var(--violet); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.sender-rule-undo:hover:not(:disabled) { background: var(--violet-wash); }
.sender-rule-undo:disabled { cursor: wait; opacity: .6; }
.sender-rule-notice, .sender-rule-error { margin: 10px 3px 0; font-size: 12px; }
.sender-rule-notice { color: #286f5b; }
.sender-rule-error { color: var(--error); }
.sender-history-list { margin-top: 9px; }
.sender-history-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 76px; padding: 13px 10px; border-bottom: 1px solid var(--line); color: inherit; text-decoration: none; transition: background-color 130ms ease; }
.sender-history-row:hover { background: var(--violet-wash); }
.sender-history-row:focus-visible, .sender-profile-back:focus-visible { outline: 3px solid color-mix(in srgb, var(--violet) 58%, white); outline-offset: 3px; }
.sender-history-copy { display: grid; min-width: 0; gap: 5px; }
.sender-history-copy strong, .sender-history-copy > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sender-history-copy strong { color: var(--ink); font-size: 14px; font-weight: 650; }
.sender-history-copy > span { color: var(--muted); font-size: 12px; }
.sender-history-meta { display: flex; align-items: center; justify-content: flex-end; gap: 16px; flex: 0 0 auto; }
.sender-folder-label { padding: 4px 9px; border-radius: 14px; background: var(--violet-wash); color: var(--violet); font-size: 11px; font-weight: 650; white-space: nowrap; }
.sender-folder-label.is-queue { background: #edf0fb; color: #4268cf; }
.sender-history-meta time { color: var(--quiet); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sender-profile-state { display: grid; justify-items: start; gap: 9px; padding: 24px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); }
.sender-profile-state strong { color: var(--ink); font-size: 16px; }
.sender-profile-state span { font-size: 13px; }
@media (max-width: 650px) {
  .sender-profile-heading { align-items: flex-start; gap: 14px; margin-bottom: 30px; }
  .sender-profile-avatar { width: 54px; height: 54px; flex-basis: 54px; font-size: 17px; }
  .sender-rule-panel { align-items: flex-start; flex-direction: column; gap: 13px; padding: 14px; }
  .sender-rule-form { width: 100%; }
  .sender-rule-form select { min-width: 0; flex: 1; }
  .sender-rule-form button { padding-inline: 12px; }
  .sender-history-row { align-items: flex-start; flex-direction: column; gap: 9px; }
  .sender-history-meta { width: 100%; justify-content: space-between; }
}
@media (prefers-reduced-motion: reduce) {
  .sender-rule-form button, .sender-history-row { transition: none; }
}
</style>
