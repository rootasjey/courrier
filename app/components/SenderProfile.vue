<template>
  <main class="sender-profile-page">
    <div class="sender-profile-shell">
      <NuxtLink class="sender-profile-back" :to="returnTo">← {{ returnLabel }}</NuxtLink>

      <section v-if="error || profileError" class="sender-profile-state" role="alert">
        <strong>{{ $t('sender.loadErrorTitle') }}</strong>
        <span>{{ $t('sender.loadErrorDescription') }}</span>
        <button type="button" :disabled="pending || profilePending" @click="retry()">{{ pending || profilePending ? $t('sender.loading') : $t('common.retry') }}</button>
      </section>
      <section v-else-if="!messages.length" class="sender-profile-state">
        <strong>{{ $t('sender.emptyTitle') }}</strong>
        <span>{{ $t('sender.emptyDescription') }}</span>
      </section>
      <template v-else>
        <header class="sender-profile-heading">
          <span class="sender-profile-avatar" :class="`avatar-${latestMessage.color}`">{{ contactInitials }}</span>
          <div class="sender-profile-identity">
            <h1>{{ contactName }}</h1>
            <p class="sender-profile-address">{{ primaryAddress }}</p>
            <div v-if="secondaryAddresses.length" class="sender-profile-aliases" :aria-label="$t('contactProfile.otherAddresses')">
              <span v-for="item in secondaryAddresses" :key="item.address">{{ item.address }}</span>
            </div>
          </div>
          <nav class="sender-profile-actions" :aria-label="$t('contactProfile.contactActions')">
            <NuxtLink :to="`${contactPath}/edit`">{{ $t('contactProfile.editContact') }}</NuxtLink>
            <NuxtLink :to="`${contactPath}/note`">{{ profile?.contact?.note ? $t('contactProfile.editNote') : $t('contactProfile.addNote') }}</NuxtLink>
          </nav>
        </header>

        <section v-if="profile?.contact?.note" class="sender-contact-note" aria-labelledby="sender-note-title">
          <div class="sender-contact-note-heading">
            <h2 id="sender-note-title">{{ $t('contactProfile.sharedNote') }}</h2>
            <NuxtLink :to="`${contactPath}/note`">{{ $t('contactProfile.editNote') }}</NuxtLink>
          </div>
          <p>{{ profile.contact.note.body }}</p>
          <span v-if="profile.contact.note.updatedBy || profile.contact.note.updatedAt">
            {{ $t('contactProfile.noteUpdated', { name: profile.contact.note.updatedBy || contactName, date: formatDate(profile.contact.note.updatedAt || profile.contact.note.createdAt || '') }) }}
          </span>
        </section>

        <section class="sender-profile-history" aria-labelledby="sender-history-title">
          <div class="sender-profile-section-heading">
            <h2 id="sender-history-title">{{ $t('contactProfile.conversations') }}</h2>
            <span>{{ conversations.length }}</span>
          </div>

          <div class="sender-history-list" role="list" :aria-label="$t('contactProfile.conversationsWith', { name: contactName })">
            <NuxtLink v-for="conversation in conversations" :key="conversation.key" class="sender-history-row" role="listitem" :to="messagePath(conversation.latest)">
              <span class="sender-history-copy">
                <strong>{{ conversation.subject || '(sans objet)' }}</strong>
                <span class="sender-history-preview">
                  <span class="sender-history-direction">{{ $t(`contactProfile.${conversation.direction}`) }}</span>
                  <span>{{ conversation.latest.preview || $t('sender.noPreview') }}</span>
                </span>
              </span>
              <span class="sender-history-meta">
                <span class="sender-history-count">{{ $t(conversation.count === 1 ? 'contactProfile.messageCountOne' : 'contactProfile.messageCount', { count: conversation.count }) }}</span>
                <span v-if="conversation.attachmentCount" class="sender-history-attachment">{{ $t('contactProfile.attachmentsCount', { count: conversation.attachmentCount }) }}</span>
                <span v-if="!conversation.latest.isOutgoing" class="sender-folder-label" :class="{ 'is-queue': conversation.latest.isSetAside || conversation.latest.isReplyLater }">{{ folderLabel(conversation.latest) }}</span>
                <time :datetime="conversation.latest.timestamp" :title="formatDate(conversation.latest.timestamp)">{{ formatRelativeDate(conversation.latest.timestamp) }}</time>
              </span>
            </NuxtLink>
          </div>
        </section>

        <section v-if="mailboxGroups.length" class="sender-rules" aria-labelledby="sender-rules-title">
          <div class="sender-profile-section-heading">
            <h2 id="sender-rules-title">{{ $t('contactProfile.filingRules') }}</h2>
          </div>
          <article v-for="group in mailboxGroups" :key="group.id" class="sender-mailbox-group">
            <header class="sender-rule-panel">
              <div class="sender-rule-description">
                <span class="sender-rule-domain">{{ group.address }} · {{ group.domain }}</span>
                <span v-if="group.blocked" class="sender-blocked-status">{{ $t('sender.blockedStatus') }}</span>
                <span v-else class="sender-rule-status">{{ $t(group.rule ? 'sender.automaticRule' : 'sender.noRule') }}</span>
                <span class="sender-rule-hint">{{ $t(group.blocked ? 'sender.blockedHint' : 'sender.ruleHint') }}</span>
              </div>
              <form class="sender-rule-form" @submit.prevent="applyRule(group)">
                <label class="sr-only" :for="`sender-folder-${group.id}`">{{ $t('sender.mailboxFor', { address: group.address, domain: group.domain }) }}</label>
                <select :id="`sender-folder-${group.id}`" :value="selectedFolder(group)" :disabled="savingDomain === group.id" @change="selectFolder(group.id, $event)">
                  <option value="Imbox">Inbox</option>
                  <option value="The Feed">Feed</option>
                  <option value="Paper Trail">Paper</option>
                </select>
                <button type="submit" :disabled="savingDomain === group.id || selectedFolder(group) === group.rule">
                  {{ savingDomain === group.id ? $t('sender.saving') : $t('sender.refileMessages') }}
                </button>
              </form>
            </header>

            <p v-if="ruleNotice[group.id]" class="sender-rule-notice" role="status">{{ ruleNotice[group.id] }}</p>
            <p v-if="ruleErrors[group.id]" class="sender-rule-error" role="alert">{{ ruleErrors[group.id] }}</p>
            <button v-if="undoDomain === group.id && undoClassificationId" class="sender-rule-undo" type="button" :disabled="isUndoingRule" @click="undoRule(group)">
              {{ isUndoingRule ? $t('sender.undoing') : $t('common.undo') }}
            </button>
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
  threadSubject: string | null
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
type ContactView = {
  id: string
  displayName: string
  addresses: { address: string, isPrimary: boolean }[]
  note: { body: string, createdBy: string, updatedBy: string, createdAt: string | null, updatedAt: string | null } | null
}
type ContactProfile = { contact: ContactView | null, suggestedName: string }
type SenderMailboxGroup = { id: string, address: string, domain: string, messages: SenderMessage[], rule: MailboxFolder | null, blocked: boolean }
type SenderConversation = { key: string, threadId: string, latest: SenderMessage, subject: string, count: number, attachmentCount: number, direction: 'received' | 'sent' | 'correspondence' }

const route = useRoute()
const router = useRouter()
const { $t } = useI18n()
const { locale } = useI18nLocale()
const returnTo = ref(mailboxPath('Imbox'))
onMounted(() => {
  const back = router.options.history.state.back
  if (typeof back === 'string' && back.startsWith('/mail/') && !back.startsWith('/mail/senders/')) returnTo.value = back
})
const returnLabel = computed(() => $t(returnTo.value === mailboxPath('Imbox') ? 'sender.backInbox' : 'sender.backMessage'))
const rawAddress = Array.isArray(route.params.address) ? route.params.address[0] : route.params.address
const address = computed(() => {
  try { return decodeURIComponent(String(rawAddress ?? '')).trim().toLocaleLowerCase('en-US') }
  catch { return String(rawAddress ?? '').trim().toLocaleLowerCase('en-US') }
})
const profilePath = computed(() => `/mail/senders/${encodeURIComponent(address.value)}`)
const { data, pending, error, refresh } = await useFetch<SenderMessage[]>('/api/messages', { default: () => [] })
const { data: profileData, pending: profilePending, error: profileError, refresh: refreshProfile } = await useFetch<ContactProfile>('/api/contacts/profile', {
  query: computed(() => ({ address: address.value })),
  default: () => ({ contact: null, suggestedName: '' }),
})
const profile = computed(() => profileData.value)
const ruleSelections = reactive<Record<string, MailboxFolder>>({})
const ruleNotice = reactive<Record<string, string>>({})
const ruleErrors = reactive<Record<string, string>>({})
const savingDomain = ref('')
const undoClassificationId = useState('courrier-undo-classification-id', () => '')
const classificationFeedback = useState('courrier-classification-feedback', () => '')
const undoDomain = useState('courrier-undo-classification-domain', () => '')
const isUndoingRule = ref(false)
let undoTimer: ReturnType<typeof setTimeout> | undefined

const contactAddressSet = computed(() => new Set([
  address.value,
  ...(profile.value?.contact?.addresses.map(item => item.address.toLocaleLowerCase('en-US')) || []),
]))
const messages = computed(() => (data.value ?? [])
  .filter((message) => {
    if (!message.isOutgoing) return contactAddressSet.value.has(message.address.trim().toLocaleLowerCase('en-US'))
    return extractEmails(message.recipient).some(item => contactAddressSet.value.has(item))
  })
  .sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
const latestMessage = computed(() => messages.value[0]!)
const primaryAddress = computed(() => profile.value?.contact?.addresses.find(item => item.isPrimary)?.address || address.value)
const contactPath = computed(() => `/mail/contacts/${encodeURIComponent(primaryAddress.value)}`)
const secondaryAddresses = computed(() => profile.value?.contact?.addresses.filter(item => !item.isPrimary) || [])
const contactName = computed(() => profile.value?.contact?.displayName
  || (latestMessage.value?.isOutgoing ? '' : latestMessage.value?.sender)
  || profile.value?.suggestedName
  || address.value)
const contactInitials = computed(() => {
  if (latestMessage.value && !latestMessage.value.isOutgoing && !profile.value?.contact?.displayName) return latestMessage.value.initials
  return contactName.value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase(locale.value)).join('') || '??'
})
const conversations = computed<SenderConversation[]>(() => {
  const grouped = new Map<string, SenderMessage[]>()
  for (const message of messages.value) {
    const key = `${message.mailboxDomain}\u0000${message.threadId}`
    const rows = grouped.get(key) || []
    rows.push(message)
    grouped.set(key, rows)
  }
  return [...grouped.entries()].map(([key, rows]) => {
    rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const latest = rows[0]!
    const hasSent = rows.some(item => item.isOutgoing)
    const hasReceived = rows.some(item => !item.isOutgoing)
    return {
      key,
      threadId: latest.threadId,
      latest,
      subject: latest.threadSubject || latest.subject,
      count: rows.length,
      attachmentCount: rows.reduce((total, item) => total + item.attachments.length, 0),
      direction: hasSent && hasReceived ? 'correspondence' : hasSent ? 'sent' : 'received',
    }
  }).sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp))
})
const mailboxGroups = computed<SenderMailboxGroup[]>(() => {
  const groups = new Map<string, SenderMailboxGroup>()
  for (const message of messages.value.filter(item => !item.isOutgoing)) {
    const senderAddress = message.address.trim().toLocaleLowerCase('en-US')
    const id = `${message.mailboxDomain}\u0000${senderAddress}`
    let group = groups.get(id)
    if (!group) {
      group = { id, address: senderAddress, domain: message.mailboxDomain, messages: [], rule: message.senderRuleFolder, blocked: message.isBlockedSender }
      groups.set(id, group)
    }
    group.messages.push(message)
    if (message.senderRuleFolder) group.rule = message.senderRuleFolder
    group.blocked ||= message.isBlockedSender
  }
  return [...groups.values()].sort((a, b) => a.domain.localeCompare(b.domain) || a.address.localeCompare(b.address))
})

function retry() {
  refresh()
  refreshProfile()
}

function selectedFolder(group: SenderMailboxGroup) {
  return ruleSelections[group.id] ?? group.rule ?? 'Imbox'
}

function selectFolder(id: string, event: Event) {
  ruleSelections[id] = (event.target as HTMLSelectElement).value as MailboxFolder
  ruleNotice[id] = ''
  ruleErrors[id] = ''
}

async function applyRule(group: SenderMailboxGroup) {
  const target = group.messages.find(message => !message.isSetAside && !message.isReplyLater) ?? group.messages[0]
  if (!target || savingDomain.value) return
  savingDomain.value = group.id
  ruleNotice[group.id] = ''
  ruleErrors[group.id] = ''
  try {
    const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(target.id)}/sender-rule`, {
      method: 'PUT',
      body: { folder: selectedFolder(group) },
    })
    ruleSelections[group.id] = result.folder
    ruleNotice[group.id] = $t(result.affectedMessages === 1 ? 'sender.refiledOne' : 'sender.refiledMany', { count: result.affectedMessages, folder: mailboxByName(result.folder).label })
    classificationFeedback.value = ruleNotice[group.id]
    undoClassificationId.value = result.undoId
    undoDomain.value = group.id
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
    ruleErrors[group.id] = statusMessage || $t('sender.saveError')
  } finally {
    savingDomain.value = ''
  }
}

async function undoRule(group: SenderMailboxGroup) {
  const changeId = undoClassificationId.value
  if (!changeId || isUndoingRule.value) return
  isUndoingRule.value = true
  ruleErrors[group.id] = ''
  try {
    const result = await $fetch<{ restoredMessages: number }>(`/api/sender-rule-changes/${encodeURIComponent(changeId)}/undo`, { method: 'POST' })
    undoClassificationId.value = ''
    undoDomain.value = ''
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = undefined
    delete ruleSelections[group.id]
    ruleNotice[group.id] = $t(result.restoredMessages === 1 ? 'sender.restoredOne' : 'sender.restoredMany', { count: result.restoredMessages })
    classificationFeedback.value = ruleNotice[group.id]
    await refresh()
  } catch (cause) {
    const statusMessage = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage
    ruleErrors[group.id] = statusMessage || $t('sender.undoError')
  } finally {
    isUndoingRule.value = false
  }
}

function folderLabel(message: SenderMessage) {
  if (message.isSetAside) return $t('mail.setAside')
  if (message.isReplyLater) return $t('mail.replyLater')
  return mailboxByName(message.folder).label
}

function messagePath(message: SenderMessage) {
  const mailbox: MailboxKey = message.isSetAside ? 'Set Aside'
    : message.isReplyLater ? 'Reply Later'
      : message.folder
  return threadPath(mailbox, message.threadId)
}

function extractEmails(text: string) {
  return (text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || [])
    .map(item => item.trim().toLocaleLowerCase('en-US'))
}

function formatDate(timestamp: string) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}

function formatRelativeDate(timestamp: string) {
  const date = new Date(timestamp).getTime()
  if (!Number.isFinite(date)) return timestamp
  const seconds = Math.round((date - Date.now()) / 1000)
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.345, 'week'], [12, 'month'], [Number.POSITIVE_INFINITY, 'year'],
  ]
  let value = seconds
  for (const [limit, unit] of units) {
    if (Math.abs(value) < limit) return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(Math.round(value), unit)
    value /= limit
  }
  return formatDate(timestamp)
}

useSeoMeta({
  title: computed(() => `${contactName.value} — Courrier`),
  description: computed(() => `Historique et coordonnées de ${contactName.value}.`),
})
</script>

<style scoped>
.sender-profile-page { min-height: calc(100vh - 76px); padding: 30px clamp(20px, 5vw, 76px) 64px; }
.sender-profile-shell { width: min(100%, 1120px); margin: 0 auto; }
.sender-profile-back { display: inline-flex; align-items: center; min-height: 40px; margin: 0 0 30px; color: var(--accent); font-size: 14px; font-weight: 620; text-decoration: none; }
.sender-profile-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.sender-profile-heading { display: flex; align-items: center; gap: 20px; margin: 0 0 34px; }
.sender-profile-avatar { display: grid; width: 68px; height: 68px; flex: 0 0 68px; place-items: center; border-radius: 50%; font-size: 20px; font-weight: 700; }
.avatar-terracotta { background: #f2e5dd; color: #714b3e; }
.avatar-blue { background: #e3eceb; color: #405e62; }
.avatar-green { background: #deebe4; color: #31574d; }
.avatar-gold { background: #f1ead8; color: #685a37; }
.sender-profile-identity { min-width: 0; flex: 1; }
.sender-profile-heading h1 { margin: 0; color: var(--ink); font-size: clamp(28px, 4vw, 38px); font-weight: 720; letter-spacing: -.8px; line-height: 1.12; overflow-wrap: anywhere; }
.sender-profile-address { margin: 7px 0 0; color: var(--muted); font-size: 15px; overflow-wrap: anywhere; }
.sender-profile-aliases { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 6px; color: var(--quiet); font-size: 12px; }
.sender-profile-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.sender-profile-actions a, .sender-contact-note-heading a { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; font-weight: 620; text-decoration: none; transition: background-color 140ms ease, border-color 140ms ease; }
.sender-profile-actions a:hover, .sender-contact-note-heading a:hover { border-color: var(--accent); background: var(--accent-wash); }
.sender-contact-note { margin: 0 0 26px; padding: 17px 19px; border-radius: 12px; background: var(--surface-soft); }
.sender-contact-note-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.sender-contact-note-heading h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 680; }
.sender-contact-note-heading a { min-height: 32px; padding: 0 11px; font-size: 12px; }
.sender-contact-note p { margin: 12px 0 6px; color: var(--ink); font-size: 14px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.sender-contact-note > span { color: var(--quiet); font-size: 11px; }
.sender-profile-history { border-top: 1px solid var(--line); }
.sender-profile-section-heading { display: flex; align-items: baseline; gap: 10px; padding: 19px 0 12px; }
.sender-profile-section-heading h2 { margin: 0; color: var(--ink); font-size: 19px; font-weight: 700; letter-spacing: -.25px; }
.sender-profile-section-heading > span { color: var(--quiet); font-size: 12px; font-variant-numeric: tabular-nums; }
.sender-history-list { margin-top: 3px; }
.sender-history-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 76px; padding: 13px 12px; border-bottom: 1px solid var(--line); border-radius: 8px; color: inherit; text-decoration: none; transition: background-color 130ms ease; }
.sender-history-row:hover { background: var(--accent-wash); }
.sender-history-copy { display: grid; min-width: 0; gap: 7px; }
.sender-history-copy > strong, .sender-history-preview > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sender-history-copy > strong { color: var(--ink); font-size: 15px; font-weight: 680; }
.sender-history-preview { display: flex; align-items: center; min-width: 0; gap: 8px; color: var(--muted); font-size: 12px; }
.sender-history-preview > span:last-child { min-width: 0; }
.sender-history-direction { flex: 0 0 auto; color: var(--quiet); }
.sender-history-meta { display: flex; align-items: center; justify-content: flex-end; gap: 13px; flex: 0 0 auto; }
.sender-history-count, .sender-history-attachment { color: var(--quiet); font-size: 11px; white-space: nowrap; }
.sender-folder-label { padding: 4px 9px; border-radius: 14px; background: var(--accent-wash); color: var(--accent); font-size: 11px; font-weight: 650; white-space: nowrap; }
.sender-folder-label.is-queue { background: #edf0fb; color: #4268cf; }
.sender-history-meta time { color: var(--quiet); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sender-rules { margin-top: 32px; border-top: 1px solid var(--line); }
.sender-mailbox-group + .sender-mailbox-group { margin-top: 13px; }
.sender-rule-panel { display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 17px 19px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); }
.sender-rule-description { display: grid; min-width: 0; gap: 5px; }
.sender-rule-domain { overflow: hidden; color: var(--ink); font-size: 14px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.sender-rule-status, .sender-blocked-status { color: var(--muted); font-size: 12px; line-height: 1.4; }
.sender-rule-hint { max-width: 540px; color: var(--quiet); font-size: 11px; line-height: 1.45; }
.sender-blocked-status { color: var(--error); }
.sender-rule-form { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
.sender-rule-form select { min-width: 122px; min-height: 38px; padding: 0 30px 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; }
.sender-rule-form button, .sender-profile-state button { min-height: 38px; padding: 0 14px; border: 0; border-radius: 20px; background: var(--accent); color: white; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; transition: background-color 140ms ease, opacity 140ms ease; }
.sender-rule-form button:hover:not(:disabled), .sender-profile-state button:hover:not(:disabled) { background: var(--accent-hover); }
.sender-rule-form button:disabled, .sender-profile-state button:disabled { border: 1px solid var(--line); background: var(--accent-wash); color: var(--accent); cursor: not-allowed; }
:root[data-theme="dark"] .sender-rule-form button:not(:disabled), :root[data-theme="dark"] .sender-profile-state button:not(:disabled) { color: var(--accent-ink); }
.sender-rule-undo { min-height: 32px; margin: 9px 0 0 3px; padding: 0 12px; border: 1px solid var(--line); border-radius: 17px; background: var(--paper); color: var(--accent); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.sender-rule-undo:hover:not(:disabled) { background: var(--accent-wash); }
.sender-rule-undo:disabled { background: var(--surface-soft); color: var(--muted); cursor: wait; }
.sender-rule-notice, .sender-rule-error { margin: 10px 3px 0; font-size: 12px; }
.sender-rule-notice { color: #286f5b; }
.sender-rule-error { color: var(--error); }
.sender-profile-state { display: grid; justify-items: start; gap: 9px; padding: 24px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); }
.sender-profile-state strong { color: var(--ink); font-size: 16px; }
.sender-profile-state span { font-size: 13px; }
.sender-profile-actions a:focus-visible, .sender-contact-note-heading a:focus-visible, .sender-history-row:focus-visible, .sender-profile-back:focus-visible, .sender-rule-form :focus-visible, .sender-profile-state button:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
@media (max-width: 760px) {
  .sender-profile-heading { align-items: flex-start; flex-wrap: wrap; gap: 15px; margin-bottom: 26px; }
  .sender-profile-avatar { width: 54px; height: 54px; flex-basis: 54px; font-size: 17px; }
  .sender-profile-identity { width: calc(100% - 72px); flex: 1 1 calc(100% - 72px); }
  .sender-profile-actions { width: 100%; margin-left: 69px; }
  .sender-rule-panel { align-items: flex-start; flex-direction: column; gap: 13px; padding: 14px; }
  .sender-rule-form { width: 100%; }
  .sender-rule-form select { min-width: 0; flex: 1; }
  .sender-rule-form button { padding-inline: 12px; }
  .sender-history-row { align-items: flex-start; flex-direction: column; gap: 9px; padding: 13px 10px; }
  .sender-history-meta { width: 100%; justify-content: flex-start; flex-wrap: wrap; gap: 8px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .sender-profile-actions a, .sender-contact-note-heading a, .sender-history-row, .sender-rule-form button { transition: none; }
}
</style>
