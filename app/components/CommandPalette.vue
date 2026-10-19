<template>
  <div>
  <NDialog
    :key="trashConfirmationOpen ? 'trash-confirmation' : 'command-palette'"
    :open="open || trashConfirmationOpen"
    :title="$t(trashConfirmationOpen ? 'palette.trashTitle' : 'palette.title')"
    :description="trashConfirmationOpen ? $t((pendingTrash?.context.threadIds.length || 0) === 1 ? 'palette.trashDescriptionOne' : 'palette.trashDescriptionMany', { count: pendingTrash?.context.threadIds.length || 0 }) : $t('palette.description')"
    :show-close="false"
    :_dialog-overlay="{ class: trashConfirmationOpen ? 'command-palette-confirm-overlay' : 'command-palette-overlay' }"
    :_dialog-content="{ class: trashConfirmationOpen ? 'command-palette-confirm-dialog' : 'command-palette-dialog' }"
    @update:open="(value: boolean) => { if (!value && !actionPending) { if (trashConfirmationOpen) trashConfirmationOpen = false; else emit('update:open', false) } }"
  >
    <template #content>
      <div v-if="!trashConfirmationOpen" class="command-palette" @keydown.capture="handleKeydown">
        <div class="command-palette-search">
          <input
            ref="input"
            v-model="query"
            type="search"
            autocomplete="off"
            :placeholder="$t('palette.placeholder')"
            :aria-label="$t('palette.input')"
            :aria-activedescendant="activeOptionId"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-options"
            @input="scheduleSearch"
          >
          <button class="command-palette-close" type="button" :aria-label="$t('palette.close')" @click="close">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>

        <div id="command-palette-options" ref="optionsElement" class="command-palette-options" role="listbox" :aria-label="$t('palette.suggestions')">
          <div class="command-palette-highlight" :style="activeHighlightStyle" aria-hidden="true" />
          <div v-for="section in commandSections" :key="section.id" class="command-palette-section" :class="{ 'is-mailbox-section': section.id === 'mailboxes' }" role="group" :aria-label="section.label">
            <p class="command-palette-heading">{{ section.label }}</p>
            <button
              v-for="{ item, index } in section.items"
              :id="optionId(index)"
              :key="item.id"
              class="command-palette-option"
              :class="{ 'is-active': activeIndex === index, 'is-mailbox-option': section.id === 'mailboxes' }"
              type="button"
              role="option"
              :aria-selected="activeIndex === index"
              @mouseenter="activeIndex = index"
              @click="runCommand(item)"
            >
              <span class="command-option-icon" aria-hidden="true">
                <span v-if="typeof item.icon === 'string'" class="command-mailbox-icon" :class="item.icon" />
                <component :is="item.icon" v-else />
              </span>
              <span class="command-option-copy"><strong>{{ item.label }}</strong><small v-if="item.description && section.id !== 'mailboxes'">{{ item.description }}</small></span>
              <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
            </button>
          </div>
          <p v-if="!filteredCommands.length && prefix === '/' && (commandContext.threadIds.length || commandContext.source === 'Screener')" class="command-palette-empty">{{ $t('palette.noActions') }}</p>
          <p v-else-if="!filteredCommands.length && prefix === '@'" class="command-palette-empty">{{ $t('palette.noNavigation') }}</p>
          <p v-if="prefix === '/' && !commandContext.threadIds.length && commandContext.source !== 'Screener'" class="command-palette-empty">{{ $t('palette.actionsNeedSelection') }}</p>

          <template v-if="!prefix && query.trim()">
            <p class="command-palette-heading">{{ $t('palette.results') }}</p>
            <button
              v-for="(result, index) in searchResults"
              :id="optionId(filteredCommands.length + index)"
              :key="result.id"
              class="command-palette-option command-result-option"
              :class="{ 'is-active': activeIndex === filteredCommands.length + index }"
              type="button"
              role="option"
              :aria-selected="activeIndex === filteredCommands.length + index"
              @mouseenter="activeIndex = filteredCommands.length + index"
              @click="openResult(result)"
            >
              <span class="command-option-copy command-result-copy">
                <span class="command-result-title-row">
                  <strong>{{ result.subject || $t('palette.open') }}</strong>
                  <NTooltip :content="absoluteMailDate(result.timestamp)" :una="{ tooltipContent: 'compose-tooltip-content z-[140]' }">
                    <time :datetime="result.timestamp">{{ relativeMailDate(result.timestamp) }}</time>
                  </NTooltip>
                </span>
                <span class="command-result-detail-row">
                  <small class="command-result-description">
                    <span class="command-result-sender-group">
                      <span class="sender-avatar command-result-avatar" :class="`avatar-${senderColor(result.id)}`" aria-hidden="true">{{ senderInitials(result.sender) }}</span>
                      <span class="command-result-sender">{{ result.sender }}</span>
                    </span>
                    <template v-if="result.snippet"><span aria-hidden="true"> · </span><span class="command-result-snippet">{{ result.snippet }}</span></template>
                  </small>
                  <span class="command-result-folder">{{ folderLabel(result.folder) }}</span>
                </span>
              </span>
            </button>
            <p v-if="searchPending" class="command-palette-empty">{{ $t('palette.searching') }}</p>
            <p v-else-if="!searchResults.length" class="command-palette-empty">{{ $t('palette.noResults', { query: query.trim() }) }}</p>
          </template>
          <p v-if="paletteError" class="command-palette-error" role="alert">{{ paletteError }}</p>
        </div>

        <footer class="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ $t('palette.browse') }}</span><span><kbd>↵</kbd> {{ $t('palette.open') }}</span><span><kbd>ESC</kbd> {{ $t('palette.close') }}</span>
        </footer>
      </div>
      <div v-else class="command-palette-confirm">
          <NDialogTitle>{{ $t('palette.trashTitle') }}</NDialogTitle>
          <NDialogDescription>{{ $t((pendingTrash?.context.threadIds.length || 0) === 1 ? 'palette.trashDescriptionOne' : 'palette.trashDescriptionMany', { count: pendingTrash?.context.threadIds.length || 0 }) }}</NDialogDescription>
          <p v-if="paletteError" class="command-palette-error" role="alert">{{ paletteError }}</p>
          <div class="command-palette-confirm-actions">
            <button type="button" class="command-palette-cancel" :disabled="actionPending" @click="trashConfirmationOpen = false">{{ $t('palette.cancel') }}</button>
            <button type="button" class="command-palette-trash" :disabled="actionPending" @click="confirmTrash">
              {{ actionPending ? $t('palette.applying') : $t('palette.confirmTrash') }}
            </button>
          </div>
      </div>
    </template>
  </NDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { mailboxPath, threadPath, type MailboxKey } from '~/utils/mailbox-routing'

type MailAction = 'mark-seen' | 'reply-later' | 'set-aside' | 'move' | 'trash'
type CommandContext = { source: MailboxKey, threadIds: string[], screenerPendingCount: number }
type PendingTrash = { item: PaletteItem, context: CommandContext }
type PaletteItem = {
  id: string
  label: string
  description: string
  icon: object | string
  shortcut?: string
  kind: 'action' | 'navigation'
  action: 'compose' | 'navigate' | 'mail' | 'clear-screener'
  to?: string
  mailAction?: MailAction
  enabled?: boolean
  destination?: MailboxKey
}
type SearchResult = { id: string, folder: MailboxKey, threadId: string, subject: string, sender: string, timestamp: string, snippet: string }

function senderInitials(sender: string) {
  return sender.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('fr')).join('') || '??'
}

function senderColor(messageId: string) {
  const colors = ['terracotta', 'blue', 'green', 'gold']
  return colors[Number.parseInt(messageId.slice(0, 2), 16) % colors.length] || colors[0]
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const router = useRouter()
const { $t } = useI18n()
const { locale } = useI18nLocale()
const input = ref<HTMLInputElement | null>(null)
const optionsElement = ref<HTMLDivElement | null>(null)
const query = ref('')
const activeIndex = ref(0)
const activeHighlight = ref({ top: 0, height: 0, baseHeight: 52, visible: false })
const searchResults = ref<SearchResult[]>([])
const searchPending = ref(false)
const composeRequest = useState('courrier-compose-request', () => 0)
const commandContext = useState<CommandContext>('courrier-palette-context', () => ({ source: 'Imbox', threadIds: [], screenerPendingCount: 0 }))
const screenerClearRequest = useState('courrier-screener-clear-request', () => 0)
const accountSession = useState<{ isPlatformAdmin: boolean } | null>('courrier-account-session', () => null)
const paletteFeedback = useState('courrier-palette-feedback', () => '')
const paletteError = useState('courrier-palette-error', () => '')
const trashConfirmationOpen = ref(false)
const actionPending = ref(false)
const pendingTrash = ref<PendingTrash | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRevision = 0

const icon = (path: string) => ({ render: () => h('svg', { viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true' }, [h('path', { d: path })]) })
const navigationItems = computed<PaletteItem[]>(() => [
  { id: 'inbox', label: 'Inbox', description: $t('palette.inboxDescription'), icon: 'i-tabler-inbox', kind: 'navigation', action: 'navigate', to: mailboxPath('Imbox') },
  { id: 'screener', label: 'Screener', description: $t('topbar.folderNotes.screener'), icon: 'i-tabler-user-screen', kind: 'navigation', action: 'navigate', to: mailboxPath('Screener') },
  { id: 'feed', label: 'The Feed', description: $t('palette.feedDescription'), icon: 'i-tabler-brand-feedly', kind: 'navigation', action: 'navigate', to: mailboxPath('The Feed') },
  { id: 'paper', label: 'Paper Trail', description: $t('palette.paperDescription'), icon: 'i-tabler-toilet-paper', kind: 'navigation', action: 'navigate', to: mailboxPath('Paper Trail') },
  { id: 'reply-later', label: 'Reply Later', description: $t('palette.replyLaterDescription'), icon: icon('M7.5 5 3 9.5 7.5 14 M3.5 9.5H11a5 5 0 0 1 5 5v1'), kind: 'navigation', action: 'navigate', to: mailboxPath('Reply Later') },
  { id: 'set-aside', label: 'Set Aside', description: $t('palette.setAsideDescription'), icon: icon('M5 3h10v15l-2.5-1.5L10 18l-2.5-1.5L5 18V3Z'), kind: 'navigation', action: 'navigate', to: mailboxPath('Set Aside') },
  { id: 'drafts', label: $t('palette.drafts'), description: $t('palette.draftsDescription'), icon: icon('M4 3h12v14H4z M7 7h6m-6 3h6m-6 3h4'), kind: 'navigation', action: 'navigate', to: '/mail/drafts' },
  { id: 'settings', label: $t('palette.settings'), description: $t('palette.settingsDescription'), icon: icon('M10 3v2m0 10v2M3 10h2m10 0h2M5 5l1.5 1.5m7 7L15 15m0-10-1.5 1.5m-7 7L5 15 M13.5 10A3.5 3.5 0 1 1 6.5 10a3.5 3.5 0 0 1 7 0Z'), kind: 'navigation', action: 'navigate', to: '/settings' },
  ...(accountSession.value?.isPlatformAdmin ? [{ id: 'admin', label: $t('account.adminConsole'), description: '', icon: icon('M3 16.5V5.8a1.3 1.3 0 0 1 1.3-1.3h11.4A1.3 1.3 0 0 1 17 5.8v10.7M2.5 16.5h15M7 7.5h2m2 0h2M7 10.5h2m2 0h2M8 16.5v-3h4v3'), kind: 'navigation' as const, action: 'navigate' as const, to: '/admin' }] : []),
])
const actionItems = computed<PaletteItem[]>(() => {
  const { source, threadIds } = commandContext.value
  const compose: PaletteItem = { id: 'compose', label: $t('palette.newMessage'), description: $t('palette.newMessageDescription'), icon: icon('M4 14.5 14.8 3.7a1.7 1.7 0 0 1 2.4 2.4L6.4 16.9 3 17.5l.6-3Z M11.5 5.5l3 3'), shortcut: source === 'Screener' ? undefined : 'C', kind: 'action', action: 'compose' }
  if (source === 'Screener') {
    return [
      compose,
      ...(commandContext.value.screenerPendingCount > 0 ? [{
        id: 'clear-screener',
        label: $t('mail.clearAll'),
        description: $t('palette.clearScreenerDescription'),
        icon: icon('M4 6h12M8 6V4h4v2m2 0-.7 10H6.7L6 6m3 3v4m2-4v4'),
        shortcut: 'C',
        kind: 'action' as const,
        action: 'clear-screener' as const,
      }] : []),
    ]
  }
  if (!threadIds.length || !['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(source)) return [compose]
  const items: PaletteItem[] = [compose,
    { id: 'mark-seen', label: $t('bulk.markSeen'), description: $t('palette.markSeenDescription'), icon: icon('m4.5 10.5 3.2 3.2 7-7'), kind: 'action', action: 'mail', mailAction: 'mark-seen' },
  ]
  if (source === 'Reply Later') items.push({ id: 'reply-later-off', label: $t('bulk.removeReplyLater'), description: $t('palette.replyLaterRemoveDescription'), icon: icon('M5 5l10 10M15 5 5 15'), kind: 'action', action: 'mail', mailAction: 'reply-later', enabled: false })
  else if (source !== 'Set Aside') items.push({ id: 'reply-later-on', label: $t('bulk.replyLater'), description: $t('palette.replyLaterDescription'), icon: icon('M7.5 5 3 9.5 7.5 14 M3.5 9.5H11a5 5 0 0 1 5 5v1'), kind: 'action', action: 'mail', mailAction: 'reply-later', enabled: true })
  if (source === 'Imbox') items.push({ id: 'set-aside-on', label: $t('bulk.setAside'), description: $t('palette.setAsideDescription'), icon: icon('M5 3h10v15l-2.5-1.5L10 18l-2.5-1.5L5 18V3Z'), kind: 'action', action: 'mail', mailAction: 'set-aside', enabled: true })
  if (source === 'Set Aside') items.push({ id: 'set-aside-off', label: $t('bulk.returnInbox'), description: $t('palette.returnInboxDescription'), icon: icon('M4 10h11m-4-4 4 4-4 4'), kind: 'action', action: 'mail', mailAction: 'set-aside', enabled: false })
  for (const destination of ['Imbox', 'The Feed', 'Paper Trail'] as MailboxKey[]) {
    if (destination === source) continue
    items.push({ id: `move-${destination}`, label: $t('palette.moveTo', { folder: destination === 'Imbox' ? 'Inbox' : destination }), description: $t('palette.moveDescription'), icon: icon('M3 10h12m-4-4 4 4-4 4'), kind: 'action', action: 'mail', mailAction: 'move', destination })
  }
  items.push({ id: 'trash', label: $t('bulk.trash'), description: $t('palette.trashActionDescription'), icon: icon('M4 6h12M8 6V4h4v2m2 0-.7 10H6.7L6 6m3 3v4m2-4v4'), kind: 'action', action: 'mail', mailAction: 'trash' })
  return items
})

const prefix = computed(() => query.value.startsWith('/') || query.value.startsWith('@') ? query.value[0] : '')
const normalizedQuery = computed(() => query.value.trim().replace(/^[/@]\s*/, '').toLocaleLowerCase('fr'))
const primaryMailboxIds = new Set(['inbox', 'screener', 'feed', 'paper'])
const filteredCommands = computed(() => {
  const sourceItems = prefix.value === '/'
    ? actionItems.value
    : prefix.value === '@'
      ? navigationItems.value
      : commandContext.value.source === 'Screener'
        ? [...actionItems.value, ...navigationItems.value]
        : [actionItems.value[0]!, ...navigationItems.value]
  const filtered = sourceItems.filter((item) => {
    if (!normalizedQuery.value) return true
    return `${item.label} ${item.description}`.toLocaleLowerCase('fr').includes(normalizedQuery.value)
  })
  if (prefix.value) return filtered
  if (!normalizedQuery.value) {
    return filtered.filter(item => item.kind === 'action' || primaryMailboxIds.has(item.id))
  }
  return filtered.slice(0, 5)
})
const activeOptionId = computed(() => optionId(activeIndex.value))
const visibleOptionCount = computed(() => filteredCommands.value.length + (!prefix.value && query.value.trim() ? searchResults.value.length : 0))
const activeMailboxTile = computed(() => !prefix.value && !query.value.trim() && filteredCommands.value[activeIndex.value]?.kind === 'navigation')
const commandSections = computed(() => {
  const indexedItems = filteredCommands.value.map((item, index) => ({ item, index }))
  if (!indexedItems.length) return []
  if (prefix.value === '/') return [{ id: 'actions', label: $t('palette.actions'), items: indexedItems }]
  if (prefix.value === '@') return [{ id: 'navigation', label: $t('palette.navigation'), items: indexedItems }]
  if (query.value.trim()) return [{ id: 'quick-access', label: $t('palette.quickAccess'), items: indexedItems }]

  return [
    { id: 'actions', label: $t('palette.actions'), items: indexedItems.filter(({ item }) => item.kind === 'action') },
    { id: 'mailboxes', label: $t('topbar.mailboxes'), items: indexedItems.filter(({ item }) => item.kind === 'navigation') },
  ].filter(section => section.items.length)
})
const activeHighlightStyle = computed(() => ({
  transform: `translateY(${activeHighlight.value.top}px) scaleY(${activeHighlight.value.height / activeHighlight.value.baseHeight})`,
  opacity: activeHighlight.value.visible && !activeMailboxTile.value ? 1 : 0,
}))

function optionId(index: number) { return `command-palette-option-${index}` }
function updateActiveHighlight(keepVisible = false) {
  void nextTick(() => {
    const options = optionsElement.value
    const activeOption = document.getElementById(optionId(activeIndex.value))
    if (!options || !activeOption || !props.open || trashConfirmationOpen.value) {
      activeHighlight.value = { ...activeHighlight.value, visible: false }
      return
    }

    if (keepVisible) {
      const optionsRect = options.getBoundingClientRect()
      const optionRect = activeOption.getBoundingClientRect()
      const viewportTop = optionsRect.top + options.clientTop + 8
      const viewportBottom = optionsRect.top + options.clientTop + options.clientHeight - 8
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (optionRect.top < viewportTop) {
        options.scrollTo({ top: Math.max(0, options.scrollTop - (viewportTop - optionRect.top)), behavior: reduceMotion ? 'auto' : 'smooth' })
      } else if (optionRect.bottom > viewportBottom) {
        options.scrollTo({ top: options.scrollTop + (optionRect.bottom - viewportBottom), behavior: reduceMotion ? 'auto' : 'smooth' })
      }
    }

    const optionsRect = options.getBoundingClientRect()
    const optionRect = activeOption.getBoundingClientRect()
    const baseHeight = Number.parseFloat(getComputedStyle(options).getPropertyValue('--palette-option-height')) || 52
    activeHighlight.value = {
      top: optionRect.top - optionsRect.top + options.scrollTop - options.clientTop,
      height: optionRect.height,
      baseHeight,
      visible: true,
    }
  })
}
function folderLabel(folder: MailboxKey) {
  return folder === 'Imbox' ? 'Inbox' : folder === 'The Feed' ? 'The Feed' : folder === 'Paper Trail' ? 'Paper Trail' : folder
}
function relativeMailDate(timestamp: string) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return ''

  const difference = time - Date.now()
  const absoluteDifference = Math.abs(difference)
  const units: { unit: Intl.RelativeTimeFormatUnit, milliseconds: number }[] = [
    { unit: 'year', milliseconds: 31_536_000_000 },
    { unit: 'month', milliseconds: 2_592_000_000 },
    { unit: 'day', milliseconds: 86_400_000 },
    { unit: 'hour', milliseconds: 3_600_000 },
    { unit: 'minute', milliseconds: 60_000 },
    { unit: 'second', milliseconds: 1_000 },
  ]
  const { unit, milliseconds } = units.find(candidate => absoluteDifference >= candidate.milliseconds) ?? units.at(-1)!
  return new Intl.RelativeTimeFormat(locale.value || 'fr', { numeric: 'auto', style: 'short' }).format(Math.round(difference / milliseconds), unit)
}
function absoluteMailDate(timestamp: string) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value || 'fr', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date)
}
function close() { emit('update:open', false) }

async function runCommand(item: PaletteItem) {
  if (item.action === 'compose') {
    close()
    await router.push(mailboxPath('Imbox'))
    await nextTick()
    composeRequest.value += 1
    return
  }
  if (item.action === 'navigate' && item.to) {
    close()
    await router.push(item.to)
  }
  if (item.action === 'clear-screener') {
    close()
    screenerClearRequest.value += 1
    return
  }
  if (item.action === 'mail') {
    if (item.mailAction === 'trash') {
      pendingTrash.value = { item, context: { source: commandContext.value.source, threadIds: [...commandContext.value.threadIds] } }
      trashConfirmationOpen.value = true
      return
    }
    await applyMailAction(item)
  }
}

async function applyMailAction(item: PaletteItem, context = commandContext.value) {
  if (!item.mailAction || !context.threadIds.length || actionPending.value) return
  actionPending.value = true
  paletteFeedback.value = ''
  paletteError.value = ''
  try {
    const result = await $fetch<{ affectedThreads: number }>('/api/threads/bulk-action', {
      method: 'PATCH',
      body: {
        threadIds: context.threadIds,
        source: context.source,
        action: item.mailAction,
        ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
        ...(item.destination ? { folder: item.destination } : {}),
      },
    })
    paletteFeedback.value = $t('palette.actionDone', { count: result.affectedThreads, action: item.label })
    close()
    if (item.mailAction !== 'mark-seen') await router.push(mailboxPath(context.source))
    await refreshNuxtData()
  } catch {
    paletteError.value = $t('palette.actionError')
  } finally {
    actionPending.value = false
  }
}

async function confirmTrash() {
  const pending = pendingTrash.value
  if (!pending) return
  await applyMailAction(pending.item, pending.context)
  if (!paletteError.value) {
    trashConfirmationOpen.value = false
    pendingTrash.value = null
  }
}

async function submitSearch() {
  const value = query.value.trim().replace(/^[/@]\s*/, '')
  if (!value) return
  close()
  await router.push({ path: mailboxPath('Imbox'), query: { q: value } })
}

async function openResult(result: SearchResult) {
  close()
  await router.push({ path: threadPath(result.folder, result.threadId), query: { message: result.id } })
}

function scheduleSearch() {
  activeIndex.value = 0
  searchResults.value = []
  searchPending.value = false
  searchRevision += 1
  const revision = searchRevision
  if (searchTimer) clearTimeout(searchTimer)
  if (prefix.value || !query.value.trim()) return
  searchPending.value = true
  searchTimer = setTimeout(async () => {
    try {
      const response = await $fetch<{ results: SearchResult[] }>('/api/search', { query: { q: query.value.trim(), offset: 0 } })
      if (revision === searchRevision) searchResults.value = response.results.slice(0, 5)
    } catch {
      if (revision === searchRevision) searchResults.value = []
    } finally {
      if (revision === searchRevision) searchPending.value = false
    }
  }, 180)
}

function handlePaletteEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.open || trashConfirmationOpen.value) return

  event.preventDefault()
  event.stopImmediatePropagation()
  if (query.value.length) {
    query.value = ''
    searchResults.value = []
    searchPending.value = false
    searchRevision += 1
    if (searchTimer) clearTimeout(searchTimer)
    activeIndex.value = 0
    input.value?.focus()
    updateActiveHighlight()
  } else {
    close()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const count = visibleOptionCount.value
    if (!count) return
    activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const command = filteredCommands.value[activeIndex.value]
    if (command) void runCommand(command)
    else if (!prefix.value && searchResults.value[activeIndex.value - filteredCommands.value.length]) void openResult(searchResults.value[activeIndex.value - filteredCommands.value.length]!)
    else void submitSearch()
  }
}

watch(activeIndex, () => updateActiveHighlight(true), { flush: 'post' })
watch([filteredCommands, searchResults], () => updateActiveHighlight(), { flush: 'post' })

onMounted(() => window.addEventListener('keydown', handlePaletteEscape, true))
onBeforeUnmount(() => window.removeEventListener('keydown', handlePaletteEscape, true))

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    query.value = ''
    searchResults.value = []
    activeIndex.value = 0
    await nextTick()
    input.value?.focus()
    updateActiveHighlight()
  } else {
    activeHighlight.value = { ...activeHighlight.value, visible: false }
    if (searchTimer) clearTimeout(searchTimer)
  }
})
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>
