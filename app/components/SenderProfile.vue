<template>
  <main class="sender-profile-page">
    <div class="sender-profile-shell">
      <NuxtLink class="sender-profile-back" :to="returnTo">← {{ returnLabel }}</NuxtLink>

      <section v-if="error || profileError" class="sender-profile-state" role="alert">
        <strong>{{ $t('sender.loadErrorTitle') }}</strong>
        <span>{{ $t('sender.loadErrorDescription') }}</span>
        <button type="button" :disabled="pending || profilePending" @click="retry()">{{ pending || profilePending ? $t('sender.loading') : $t('common.retry') }}</button>
      </section>
      <section v-else-if="!messages.length && !profile?.contact" class="sender-profile-state">
        <strong>{{ $t('sender.emptyTitle') }}</strong>
        <span>{{ $t('sender.emptyDescription') }}</span>
      </section>
      <template v-else>
        <header class="sender-profile-heading">
          <img v-if="profile?.contact?.avatarUrl" class="sender-profile-avatar sender-profile-avatar-photo" :src="profile.contact.avatarUrl" :alt="$t('contactProfile.photoOf', { name: contactName })">
          <img v-else-if="profile?.logoUrl && !logoFailed" class="sender-profile-avatar sender-profile-avatar-logo" :src="profile.logoUrl" alt="" aria-hidden="true" referrerpolicy="no-referrer" @error="logoFailed = true">
          <span v-else class="sender-profile-avatar" :class="latestMessage ? `avatar-${latestMessage.color}` : 'avatar-blue'" aria-hidden="true">{{ contactInitials }}</span>
          <div class="sender-profile-identity">
            <h1>{{ contactName }}</h1>
            <p class="sender-profile-address">{{ primaryAddress }}</p>
            <p v-if="profile?.contact?.company" class="sender-profile-company">{{ profile.contact.company }}</p>
            <div v-if="secondaryAddresses.length" class="sender-profile-aliases" :aria-label="$t('contactProfile.otherAddresses')">
              <span v-for="item in secondaryAddresses" :key="item.address">{{ item.address }}</span>
            </div>
            <div v-if="profile?.contact?.phones.length" class="sender-profile-details" :aria-label="$t('contactProfile.phones')">
              <a v-for="phone in profile.contact.phones" :key="phone.number" :href="`tel:${phone.number}`"><span>{{ phone.label || $t('contactProfile.phone') }}</span>{{ phone.number }}</a>
            </div>
            <div v-if="profile?.contact?.postalAddresses.length" class="sender-profile-details sender-profile-postal" :aria-label="$t('contactProfile.postalAddresses')">
              <div v-for="item in profile.contact.postalAddresses" :key="`${item.label}-${item.address}`"><span>{{ item.label || $t('contactProfile.postalAddress') }}</span><p>{{ item.address }}</p></div>
            </div>
          </div>
          <nav class="sender-profile-actions" :aria-label="$t('contactProfile.contactActions')">
            <template v-if="profile?.contact">
              <NuxtLink :to="`${contactPath}/edit`">{{ $t('contactProfile.editContact') }}</NuxtLink>
              <NuxtLink :to="`${contactPath}/note`">{{ profile.contact.note ? $t('contactProfile.editNote') : $t('contactProfile.addNote') }}</NuxtLink>
            </template>
            <template v-else>
              <NTooltip :content="$t('contactProfile.saveAsContactHint')" :_tooltip-content="{ side: 'bottom', sideOffset: 8, collisionPadding: 12 }" :una="{ tooltipContent: 'compose-tooltip-content z-[130]' }">
                <NuxtLink class="sender-profile-save-contact" :to="`${contactPath}/edit`" aria-keyshortcuts="R">
                  {{ $t('contactProfile.saveAsContact') }}
                  <kbd aria-hidden="true">R</kbd>
                </NuxtLink>
              </NTooltip>
            </template>
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
            <div class="sender-profile-section-title">
              <h2 id="sender-history-title">{{ $t('contactProfile.conversations') }}</h2>
              <span>{{ filteredConversations.length }}</span>
            </div>
            <div class="sender-history-controls">
              <NCombobox
                class="sender-history-filter"
                :items="conversationFilterOptions"
                :model-value="selectedConversationFilterOption"
                by="value"
                :_combobox-input="{ placeholder: $t('contactProfile.searchConversationFilter'), autocomplete: 'off' }"
                :_combobox-list="{ align: 'end', side: 'bottom', sideOffset: 7, class: 'sender-history-filter-list z-[120]' }"
                :_combobox-viewport="{ class: 'sender-history-filter-viewport' }"
                :_combobox-trigger="{ class: 'sender-history-filter-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('contactProfile.filterConversations') }"
                :_combobox-item="{ class: 'sender-history-filter-item' }"
                :text-empty="$t('contactProfile.noConversationFiltersFound')"
                @update:model-value="selectConversationFilter"
              >
                <template #trigger>
                  <span>{{ selectedConversationFilterOption?.label }}</span>
                </template>
              </NCombobox>
              <button class="sender-history-write" type="button" @click="writeToContact">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                {{ $t('contactProfile.writeToContact') }}
              </button>
            </div>
          </div>

          <div class="sender-history-list" role="list" :aria-label="$t('contactProfile.conversationsWith', { name: contactName })">
            <NuxtLink v-for="conversation in filteredConversations" :key="conversation.key" class="sender-history-row" role="listitem" :to="messagePath(conversation.latest)">
              <span class="sender-history-copy">
                <strong>{{ conversation.subject || '(sans objet)' }}</strong>
                <span class="sender-history-preview">
                  <span class="sender-history-direction">{{ $t(`contactProfile.${conversation.direction}`) }}</span>
                  <span>{{ conversation.latest.preview || $t('sender.noPreview') }}</span>
                </span>
              </span>
              <span class="sender-history-meta">
                <span class="sender-history-meta-summary">
                  <span class="sender-history-counts">
                    <span class="sender-history-count">{{ $t(conversation.count === 1 ? 'contactProfile.messageCountOne' : 'contactProfile.messageCount', { count: conversation.count }) }}</span>
                    <span v-if="conversation.attachmentCount" class="sender-history-attachment">{{ $t('contactProfile.attachmentsCount', { count: conversation.attachmentCount }) }}</span>
                  </span>
                  <span v-if="!conversation.latest.isOutgoing" class="sender-folder-label" :class="{ 'is-queue': conversation.latest.isSetAside || conversation.latest.isReplyLater }">{{ folderLabel(conversation.latest) }}</span>
                </span>
                <time :datetime="conversation.latest.timestamp" :title="formatDate(conversation.latest.timestamp)">{{ formatRelativeDate(conversation.latest.timestamp) }}</time>
              </span>
            </NuxtLink>
            <p v-if="!filteredConversations.length" class="sender-history-empty" role="status">{{ $t('contactProfile.noFilteredConversations') }}</p>
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
                <NCombobox
                  class="sender-rule-folder"
                  :items="mailboxFolderOptions"
                  :model-value="selectedFolderOption(group)"
                  by="value"
                  :disabled="savingDomain === group.id"
                  :_combobox-input="{ placeholder: $t('bulk.findFolder'), autocomplete: 'off' }"
                  :_combobox-list="{ align: 'end', side: 'bottom', sideOffset: 7, class: 'sender-rule-folder-list z-[120]' }"
                  :_combobox-viewport="{ class: 'sender-rule-folder-viewport' }"
                  :_combobox-trigger="{ class: 'sender-rule-folder-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('sender.mailboxFor', { address: group.address, domain: group.domain }) }"
                  :_combobox-item="{ class: 'sender-rule-folder-item' }"
                  :text-empty="$t('bulk.noFoldersFound')"
                  @update:model-value="(option: { value: MailboxFolder } | null | undefined) => selectFolder(group.id, option)"
                >
                  <template #trigger>
                    <span>{{ selectedFolderOption(group)?.label }}</span>
                  </template>
                </NCombobox>
                <button class="sender-rule-submit" type="submit" :disabled="savingDomain === group.id || selectedFolder(group) === group.rule">
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
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { MailboxFolder, StoredFolder } from '~/types/mail'
import { mailboxByName, mailboxPath, threadPath, type MailboxKey } from '~/utils/mailbox-routing'

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
  folder: StoredFolder
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
  company: string
  avatarUrl: string | null
  addresses: { address: string, isPrimary: boolean }[]
  phones: { label: string, number: string, isPrimary: boolean }[]
  postalAddresses: { label: string, address: string, isPrimary: boolean }[]
  note: { body: string, createdBy: string, updatedBy: string, createdAt: string | null, updatedAt: string | null } | null
}
type ContactProfile = { contact: ContactView | null, suggestedName: string, logoUrl: string | null }
type SenderMailboxGroup = { id: string, address: string, domain: string, messages: SenderMessage[], rule: MailboxFolder | null, blocked: boolean }
type SenderConversation = { key: string, threadId: string, latest: SenderMessage, subject: string, count: number, attachmentCount: number, direction: 'received' | 'sent' | 'correspondence', hasSent: boolean, hasReceived: boolean }
type ConversationFilter = 'all' | 'received' | 'sent'

const route = useRoute()
const router = useRouter()
const { $t } = useI18n()
const { locale } = useI18nLocale()
const returnTo = ref(mailboxPath('Imbox'))
onMounted(() => {
  const back = router.options.history.state.back
  if (typeof back === 'string' && back.startsWith('/mail/') && !back.startsWith('/mail/senders/')) returnTo.value = back
  window.addEventListener('keydown', handleSaveContactShortcut)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleSaveContactShortcut))

function handleSaveContactShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat) return
  if (event.key.toLocaleLowerCase('en-US') !== 'r' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  if (profile.value?.contact) return

  const target = event.target instanceof Element ? event.target : null
  if (!target || target.closest('input, textarea, select, [role="textbox"], [contenteditable="true"], [contenteditable=""]')) return

  const openSurfaceSelector = '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-state="open"], [aria-haspopup="dialog"][aria-expanded="true"], [aria-haspopup="menu"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]'
  if (target.closest(openSurfaceSelector)) return
  if ([...document.querySelectorAll<HTMLElement>(openSurfaceSelector)].some(surface => surface.getClientRects().length > 0)) return

  event.preventDefault()
  void router.push(`${contactPath.value}/edit`)
}
const returnLabel = computed(() => $t(returnTo.value === mailboxPath('Imbox') ? 'sender.backInbox' : 'sender.backMessage'))
const rawAddress = Array.isArray(route.params.address) ? route.params.address[0] : route.params.address
const address = computed(() => {
  try { return decodeURIComponent(String(rawAddress ?? '')).trim().toLocaleLowerCase('en-US') }
  catch { return String(rawAddress ?? '').trim().toLocaleLowerCase('en-US') }
})
const profilePath = computed(() => `/mail/senders/${encodeURIComponent(address.value)}`)
const composeDraftRequest = useState<{ to: string, subject: string, body: string } | null>('courrier-compose-draft-request', () => null)
const { data, pending, error, refresh } = await useFetch<SenderMessage[]>('/api/messages', { default: () => [] })
const { data: profileData, pending: profilePending, error: profileError, refresh: refreshProfile } = await useFetch<ContactProfile>('/api/contacts/profile', {
  query: computed(() => ({ address: address.value })),
  default: () => ({ contact: null, suggestedName: '' }),
})
const profile = computed(() => profileData.value)
const logoFailed = ref(false)
watch(address, () => { logoFailed.value = false })
const ruleSelections = reactive<Record<string, MailboxFolder>>({})
const mailboxFolderOptions = computed(() => (['Imbox', 'The Feed', 'Paper Trail'] as MailboxFolder[]).map(value => ({
  value,
  label: mailboxByName(value).label,
})))
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
      hasSent,
      hasReceived,
    }
  }).sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp))
})
const conversationFilter = ref<ConversationFilter>('all')
const conversationFilterOptions = computed(() => ([
  { value: 'all' as const, label: $t('contactProfile.allConversations') },
  { value: 'received' as const, label: $t('contactProfile.receivedConversations') },
  { value: 'sent' as const, label: $t('contactProfile.sentConversations') },
]))
const selectedConversationFilterOption = computed(() => conversationFilterOptions.value.find(item => item.value === conversationFilter.value))
const filteredConversations = computed(() => conversations.value.filter((conversation) => {
  if (conversationFilter.value === 'received') return conversation.hasReceived
  if (conversationFilter.value === 'sent') return conversation.hasSent
  return true
}))
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

function selectConversationFilter(option: { value: ConversationFilter } | null | undefined) {
  if (option && conversationFilterOptions.value.some(item => item.value === option.value)) conversationFilter.value = option.value
}

async function writeToContact() {
  await router.push(mailboxPath('Imbox'))
  composeDraftRequest.value = { to: primaryAddress.value, subject: '', body: '' }
}

function selectedFolder(group: SenderMailboxGroup) {
  return ruleSelections[group.id] ?? group.rule ?? 'Imbox'
}

function selectedFolderOption(group: SenderMailboxGroup) {
  return mailboxFolderOptions.value.find(option => option.value === selectedFolder(group))
}

function selectFolder(id: string, option: { value: MailboxFolder } | null | undefined) {
  if (!option || !mailboxFolderOptions.value.some(item => item.value === option.value)) return
  ruleSelections[id] = option.value
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
.sender-profile-page { min-height: calc(100vh - 76px); padding: 26px clamp(20px, 5vw, 76px) 64px; }
.sender-profile-shell { width: min(100%, 1080px); margin: 0 auto; }
.sender-profile-back { display: inline-flex; align-items: center; min-height: 38px; margin: 0 0 24px; color: var(--muted); font-size: 13px; font-weight: 600; text-decoration: none; }
.sender-profile-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.sender-profile-heading { display: grid; grid-template-columns: 68px minmax(0, 1fr) auto; align-items: center; gap: 18px; margin: 0 0 32px; padding: 8px 0 25px; border-bottom: 1px solid var(--line); text-align: left; }
.sender-profile-avatar { display: grid; width: 68px; height: 68px; place-items: center; border-radius: 50%; font-size: 20px; font-weight: 700; }
.sender-profile-avatar-photo { object-fit: cover; }
.sender-profile-avatar-logo { object-fit: contain; padding: 6px; background: white; }
.avatar-terracotta { background: #f2e5dd; color: #714b3e; }
.avatar-blue { background: #e3eceb; color: #405e62; }
.avatar-green { background: #deebe4; color: #31574d; }
.avatar-gold { background: #f1ead8; color: #685a37; }
.sender-profile-identity { display: grid; justify-items: start; min-width: 0; gap: 4px; }
.sender-profile-heading h1 { margin: 0; color: var(--ink); font-size: clamp(28px, 3.2vw, 38px); font-weight: 720; letter-spacing: -.03em; line-height: 1.12; overflow-wrap: anywhere; }
.sender-profile-address { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
.sender-profile-company { margin: 0; color: var(--muted); font-size: 14px; font-weight: 620; }
.sender-profile-aliases { display: flex; justify-content: flex-start; flex-wrap: wrap; gap: 6px 14px; margin-top: 3px; color: var(--quiet); font-size: 12px; }
.sender-profile-details { display: grid; justify-items: start; gap: 7px; margin-top: 3px; color: var(--muted); font-size: 13px; }
.sender-profile-details a { display: flex; align-items: baseline; gap: 8px; color: inherit; text-decoration: none; }
.sender-profile-details a:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.sender-profile-details > * > span, .sender-profile-details a > span { color: var(--quiet); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em; }
.sender-profile-postal { gap: 10px; }
.sender-profile-postal p { margin: 3px 0 0; color: var(--muted); white-space: pre-line; }
.sender-profile-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin: 0; }
.sender-profile-actions a, .sender-contact-note-heading a { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; font-weight: 620; text-decoration: none; transition: background-color 140ms ease, border-color 140ms ease; }
.sender-profile-actions a:hover, .sender-contact-note-heading a:hover { border-color: color-mix(in srgb, var(--accent) 38%, var(--line)); background: var(--accent-wash); }
.sender-profile-actions a.sender-profile-save-contact { min-height: 38px; padding-inline: 14px; border-color: var(--line); background: transparent; color: var(--muted); font-size: 13px; font-weight: 620; }
.sender-profile-actions a.sender-profile-save-contact:hover { border-color: color-mix(in srgb, var(--accent) 38%, var(--line)); background: var(--accent-wash); color: var(--ink); }
.sender-profile-actions a:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
.sender-contact-note { margin: 0 0 26px; padding: 17px 19px; border-radius: 12px; background: var(--surface-soft); }
.sender-contact-note-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.sender-contact-note-heading h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 680; }
.sender-contact-note-heading a { min-height: 32px; padding: 0 11px; font-size: 12px; }
.sender-contact-note p { margin: 12px 0 6px; color: var(--ink); font-size: 14px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.sender-contact-note > span { color: var(--quiet); font-size: 11px; }
.sender-profile-history { border-top: 0; }
.sender-profile-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 17px 0 11px; }
.sender-profile-section-title { display: flex; min-width: 0; align-items: baseline; gap: 10px; }
.sender-profile-section-heading h2 { margin: 0; color: var(--ink); font-size: 19px; font-weight: 700; letter-spacing: -.25px; }
.sender-profile-section-title > span { color: var(--quiet); font-size: 12px; font-variant-numeric: tabular-nums; }
.sender-history-controls { display: flex; align-items: center; gap: 9px; }
.sender-history-filter { min-width: 164px; }
.sender-history-filter button.sender-history-filter-trigger[aria-haspopup="listbox"] { display: inline-flex; width: 100%; min-height: 38px; align-items: center; justify-content: space-between; gap: 9px; padding: 0 11px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); box-shadow: none; font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease; }
.sender-history-filter button.sender-history-filter-trigger[aria-haspopup="listbox"]:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 46%, var(--line)); background: var(--sheet); }
.sender-history-filter button.sender-history-filter-trigger[aria-haspopup="listbox"]:focus-visible { border-color: var(--accent); outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent); outline-offset: 2px; }
.sender-history-filter button.sender-history-filter-trigger[aria-haspopup="listbox"] > span:first-child { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sender-history-filter button.sender-history-filter-trigger[aria-haspopup="listbox"] > span[icon-base] { flex: 0 0 auto; color: var(--quiet); }
.combobox-list.sender-history-filter-list { width: 190px; min-width: 170px; max-height: min(230px, calc(100dvh - 32px)); overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); box-shadow: 0 12px 30px rgb(33 43 38 / 14%); }
.sender-history-filter-viewport { max-height: 200px; overflow-y: auto; padding: 5px; }
.sender-history-filter-item { display: flex; min-height: 38px; align-items: center; gap: 9px; border-radius: 7px; color: var(--ink); font-size: 13px; }
.sender-history-filter-item[data-highlighted] { background: var(--accent-wash); color: var(--accent); }
.sender-history-write { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 7px; padding: 0 13px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; font-weight: 620; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease; }
.sender-history-write svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.8; }
.sender-history-write:hover { border-color: color-mix(in srgb, var(--accent) 38%, var(--line)); background: var(--accent-wash); }
.sender-history-list { margin-top: 3px; }
.sender-history-row { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 76px; padding: 13px 12px; border-radius: 8px; color: inherit; text-decoration: none; transition: background-color 130ms ease; }
.sender-history-row + .sender-history-row::before { position: absolute; top: 0; right: 0; left: 0; height: 1px; background: var(--line); content: ''; }
.sender-history-row:hover { background: var(--accent-wash); }
.sender-history-copy { display: grid; min-width: 0; gap: 7px; }
.sender-history-copy > strong, .sender-history-preview > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sender-history-copy > strong { color: var(--ink); font-size: 15px; font-weight: 680; }
.sender-history-preview { display: flex; align-items: center; min-width: 0; gap: 8px; color: var(--muted); font-size: 12px; }
.sender-history-preview > span:last-child { min-width: 0; }
.sender-history-direction { flex: 0 0 auto; color: var(--quiet); }
.sender-history-meta { display: grid; min-width: 200px; flex: 0 0 auto; gap: 4px; justify-items: stretch; }
.sender-history-meta-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.sender-history-counts { display: flex; min-width: 0; align-items: center; gap: 8px; }
.sender-history-count, .sender-history-attachment { color: var(--quiet); font-size: 11px; white-space: nowrap; }
.sender-folder-label { padding: 4px 9px; border-radius: 14px; background: var(--accent-wash); color: var(--accent); font-size: 11px; font-weight: 650; white-space: nowrap; }
.sender-folder-label.is-queue { background: #edf0fb; color: #4268cf; }
.sender-history-meta time { justify-self: end; color: var(--quiet); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sender-history-empty { margin: 0; padding: 22px 12px; color: var(--muted); font-size: 13px; }
.sender-rules { margin-top: 27px; }
.sender-mailbox-group + .sender-mailbox-group { margin-top: 13px; }
.sender-rule-panel { display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--sheet); }
.sender-rule-description { display: grid; min-width: 0; gap: 5px; }
.sender-rule-domain { overflow: hidden; color: var(--ink); font-size: 14px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.sender-rule-status, .sender-blocked-status { color: var(--muted); font-size: 12px; line-height: 1.4; }
.sender-rule-hint { max-width: 540px; color: var(--quiet); font-size: 11px; line-height: 1.45; }
.sender-blocked-status { color: var(--error); }
.sender-rule-form { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
.sender-rule-folder { min-width: 132px; }
.sender-rule-folder button.sender-rule-folder-trigger[aria-haspopup="listbox"] { display: inline-flex; width: 100%; min-width: 0; max-width: 100%; min-height: 38px; align-items: center; justify-content: space-between; gap: 9px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); box-shadow: none; font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease; }
.sender-rule-folder button.sender-rule-folder-trigger[aria-haspopup="listbox"]:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 46%, var(--line)); background: var(--sheet); }
.sender-rule-folder button.sender-rule-folder-trigger[aria-haspopup="listbox"]:focus-visible { border-color: var(--accent); outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent); outline-offset: 2px; }
.sender-rule-folder button.sender-rule-folder-trigger[aria-haspopup="listbox"] > span:first-child { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sender-rule-folder button.sender-rule-folder-trigger[aria-haspopup="listbox"] > span[icon-base] { flex: 0 0 auto; color: var(--quiet); }
.sender-rule-folder button.sender-rule-folder-trigger[aria-haspopup="listbox"]:disabled { color: var(--muted); cursor: wait; opacity: .65; }
.combobox-list.sender-rule-folder-list { width: 160px; min-width: 140px; max-height: min(220px, calc(100dvh - 32px)); overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); box-shadow: 0 12px 30px rgb(33 43 38 / 14%); }
.sender-rule-folder-viewport { max-height: 190px; overflow-y: auto; padding: 5px; }
.sender-rule-folder-item { display: flex; min-height: 38px; align-items: center; gap: 9px; border-radius: 7px; color: var(--ink); font-size: 13px; }
.sender-rule-folder-item[data-highlighted] { background: var(--accent-wash); color: var(--accent); }
.sender-rule-submit, .sender-profile-state button { min-height: 38px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 620; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease; }
.sender-rule-submit:hover:not(:disabled), .sender-profile-state button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 38%, var(--line)); background: var(--accent-wash); color: var(--ink); }
.sender-rule-submit:disabled, .sender-profile-state button:disabled { border: 1px solid var(--line); background: var(--surface-soft); color: var(--quiet); cursor: not-allowed; }
.sender-rule-undo { min-height: 32px; margin: 9px 0 0 3px; padding: 0 12px; border: 1px solid var(--line); border-radius: 17px; background: var(--paper); color: var(--accent); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.sender-rule-undo:hover:not(:disabled) { background: var(--accent-wash); }
.sender-rule-undo:disabled { background: var(--surface-soft); color: var(--muted); cursor: wait; }
.sender-rule-notice, .sender-rule-error { margin: 10px 3px 0; font-size: 12px; }
.sender-rule-notice { color: #286f5b; }
.sender-rule-error { color: var(--error); }
.sender-profile-state { display: grid; justify-items: start; gap: 9px; padding: 24px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); }
.sender-profile-state strong { color: var(--ink); font-size: 16px; }
.sender-profile-state span { font-size: 13px; }
.sender-profile-actions a:focus-visible, .sender-contact-note-heading a:focus-visible, .sender-history-row:focus-visible, .sender-profile-back:focus-visible, .sender-rule-form :focus-visible, .sender-history-controls :focus-visible, .sender-profile-state button:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
@media (max-width: 760px) {
  .sender-profile-page { padding-inline: 20px; }
  .sender-profile-heading { grid-template-columns: 58px minmax(0, 1fr); gap: 13px; margin-bottom: 27px; padding-bottom: 20px; }
  .sender-profile-avatar { width: 58px; height: 58px; font-size: 18px; }
  .sender-profile-actions { grid-column: 2; justify-content: flex-start; margin-top: 1px; }
  .sender-profile-section-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
  .sender-history-controls { width: 100%; }
  .sender-history-filter { min-width: 0; flex: 1 1 auto; }
  .sender-history-write { flex: 0 0 auto; }
  .sender-rule-panel { align-items: flex-start; flex-direction: column; gap: 13px; padding: 14px; }
  .sender-rule-form { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .sender-rule-folder { width: 100%; min-width: 0; }
  .sender-rule-submit { width: 100%; padding-inline: 12px; }
  .sender-history-row { align-items: flex-start; flex-direction: column; gap: 9px; padding: 13px 10px; }
  .sender-history-meta { width: 100%; min-width: 0; gap: 4px; }
  .sender-history-meta-summary { grid-template-columns: minmax(0, 1fr) auto; }
}
@media (max-width: 440px) {
  .sender-profile-page { padding-inline: 16px; }
  .sender-profile-back { margin-bottom: 22px; }
  .sender-profile-heading h1 { font-size: clamp(29px, 8vw, 38px); }
  .sender-profile-address { font-size: 14px; }
  .sender-profile-heading { grid-template-columns: 48px minmax(0, 1fr); gap: 10px; }
  .sender-profile-avatar { width: 48px; height: 48px; font-size: 16px; }
  .sender-profile-actions { grid-column: 1 / -1; }
  .sender-profile-actions a { min-height: 38px; padding-inline: 11px; font-size: 12px; white-space: nowrap; }
  .sender-history-write { padding-inline: 11px; font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .sender-profile-actions a, .sender-contact-note-heading a, .sender-history-row, .sender-history-write, .sender-rule-form button { transition: none; }
}
</style>
