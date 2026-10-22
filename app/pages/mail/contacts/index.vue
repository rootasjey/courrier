<template>
  <main class="mail-page contacts-page">
    <section class="contacts-view" aria-labelledby="contacts-title">
      <header class="contacts-heading">
        <div>
          <h1 id="contacts-title">{{ $t('contacts.title') }}</h1>
          <p>{{ $t('contacts.description') }}</p>
        </div>
        <div class="contacts-heading-actions">
          <span class="contacts-count">{{ $t(visibleCount === 1 ? 'contacts.countOne' : 'contacts.countMany', { count: visibleCount }) }}</span>
          <button type="button" class="contacts-action contacts-import" @click="importOpen = !importOpen">{{ $t('contacts.importVcard') }}</button>
          <NuxtLink class="contacts-action contacts-new" to="/mail/contacts/new">{{ $t('contacts.newContact') }}</NuxtLink>
        </div>
      </header>

      <section v-if="importOpen" class="contacts-import-panel" aria-labelledby="import-vcard-title">
        <div class="import-heading"><div><h2 id="import-vcard-title">{{ $t('contacts.importTitle') }}</h2><p>{{ $t('contacts.importDescription') }}</p></div><button type="button" class="import-close" @click="closeImport" :aria-label="$t('contacts.closeImport')">×</button></div>
        <label class="vcard-file"><span>{{ $t('contacts.chooseVcard') }}</span><input type="file" accept=".vcf,text/vcard,text/x-vcard" @change="readVcard"></label>
        <p v-if="importError" class="import-error" role="alert">{{ importError }}</p>
        <template v-if="previewCards.length">
          <p class="import-summary">{{ $t('contacts.importPreviewSummary', { count: previewCards.length, unsupported: unsupportedCount }) }}</p>
          <div class="import-preview" role="list">
            <label v-for="card in previewCards" :key="card.key" class="import-card" role="listitem">
              <input v-model="card.selected" type="checkbox" :disabled="card.duplicate || !card.addresses.length || card.unsupportedVersion">
              <span><strong>{{ card.displayName || card.addresses[0] || $t('contacts.unnamedCard') }}</strong><small>{{ card.addresses.join(', ') || $t('contacts.noEmailInCard') }}</small><small v-if="card.company">{{ $t('contactProfile.company') }} : {{ card.company }}</small><small v-for="phone in card.phones" :key="`${phone.label}-${phone.number}`">{{ phone.label ? `${phone.label} : ` : '' }}{{ phone.number }}</small><small v-for="item in card.postalAddresses" :key="`${item.label}-${item.address}`">{{ item.label ? `${item.label} : ` : '' }}{{ item.address }}</small><small v-if="card.duplicate" class="duplicate-label">{{ $t('contacts.duplicateSkipped') }}</small><small v-else-if="card.unsupportedVersion" class="duplicate-label">{{ $t('contacts.unsupportedVcardVersion') }}</small><small v-else-if="card.unsupported.length">{{ $t('contacts.unsupportedFields', { fields: card.unsupported.join(', ') }) }}</small></span>
            </label>
          </div>
          <div class="import-actions"><button type="button" :disabled="importing || !selectedCards.length" @click="importSelected">{{ importing ? $t('contacts.importing') : $t('contacts.importSelected', { count: selectedCards.length }) }}</button></div>
          <p v-if="importResult" class="import-result" role="status">{{ $t('contacts.importResult', { imported: importResult.importedCount, duplicates: importResult.duplicateCount }) }}</p>
        </template>
      </section>

      <label class="contacts-search">
        <span class="i-tabler-search" aria-hidden="true" />
        <span class="sr-only">{{ $t('contacts.searchLabel') }}</span>
        <input ref="searchInput" v-model="query" type="search" :placeholder="$t('contacts.searchPlaceholder')" autocomplete="off" @keydown="handleSearchKeydown">
        <button v-if="query" type="button" :aria-label="$t('contacts.clearSearch')" @click="query = ''">
          <span class="i-tabler-x" aria-hidden="true" />
        </button>
      </label>

      <div v-if="error" class="contacts-state contacts-error" role="alert">
        <p>{{ $t('contacts.loadError') }}</p>
        <button type="button" @click="loadContacts">{{ $t('common.retry') }}</button>
      </div>
      <div v-else-if="pending" class="contacts-state" role="status">{{ $t('contacts.loading') }}</div>
      <template v-else>
        <section v-if="filteredContacts.length" class="contacts-section" aria-labelledby="saved-contacts-title">
          <div class="contacts-section-heading">
            <h2 id="saved-contacts-title">{{ $t('contacts.saved') }}</h2>
            <span>{{ filteredContacts.length }}</span>
          </div>
          <div class="contacts-list" role="list">
            <NuxtLink
              v-for="contact in paginatedContacts"
              :key="contact.id"
              class="contact-row"
              role="listitem"
              :to="`/mail/senders/${encodeURIComponent(contact.profileAddress)}`"
            >
              <span class="contact-avatar" :class="`tone-${toneFor(contact.id)}`" aria-hidden="true">{{ initials(contact.displayName) }}</span>
              <span class="contact-copy">
                <span class="contact-name-line">
                  <strong>{{ contact.displayName }}</strong>
                  <span v-if="contact.note" class="i-tabler-note contact-note-icon" :aria-label="$t('contacts.hasNote')" />
                </span>
                <span v-if="contact.company" class="contact-company">{{ contact.company }}</span>
                <span class="contact-address">{{ primaryAddress(contact) }}</span>
                <span v-if="contact.addresses.length > 1" class="contact-secondary">{{ $t('contacts.otherAddresses', { count: contact.addresses.length - 1 }) }}</span>
              </span>
              <span class="contact-meta">
                <span v-if="contact.messageCount">{{ $t(contact.messageCount === 1 ? 'contacts.messageOne' : 'contacts.messageMany', { count: contact.messageCount }) }}</span>
                <span v-else>{{ $t('contacts.noMessages') }}</span>
                <time v-if="contact.lastMessageAt" :datetime="contact.lastMessageAt">{{ formatRelativeDate(contact.lastMessageAt) }}</time>
              </span>
              <span class="i-tabler-chevron-right contact-chevron" aria-hidden="true" />
            </NuxtLink>
          </div>
          <nav v-if="filteredContacts.length > pageSize" class="contacts-pagination" data-page-key="savedPage" :aria-label="$t('contacts.savedPagination')">
            <button type="button" aria-keyshortcuts="ArrowLeft" :disabled="savedPage === 1" @click="navigatePage('savedPage', savedPage - 1)">
              <span class="i-tabler-chevron-left" aria-hidden="true" />
              {{ $t('contacts.previousPage') }}
            </button>
            <span>{{ $t('contacts.pageOf', { page: savedPage, total: savedPageCount }) }}</span>
            <button type="button" aria-keyshortcuts="ArrowRight" :disabled="savedPage === savedPageCount" @click="navigatePage('savedPage', savedPage + 1)">
              {{ $t('contacts.nextPage') }}
              <span class="i-tabler-chevron-right" aria-hidden="true" />
            </button>
          </nav>
        </section>

        <section v-if="filteredSenders.length" class="contacts-section contacts-recent" aria-labelledby="recent-contacts-title">
          <div class="contacts-section-heading">
            <div>
              <h2 id="recent-contacts-title">{{ $t('contacts.recent') }}</h2>
              <p>{{ $t('contacts.recentDescription') }}</p>
            </div>
            <span>{{ filteredSenders.length }}</span>
          </div>
          <div class="contacts-list" role="list">
            <NuxtLink
              v-for="sender in paginatedSenders"
              :key="sender.address"
              class="contact-row"
              role="listitem"
              :to="`/mail/senders/${encodeURIComponent(sender.address)}`"
            >
              <span class="contact-avatar" :class="`tone-${toneFor(sender.address)}`" aria-hidden="true">{{ initials(sender.displayName) }}</span>
              <span class="contact-copy">
                <strong>{{ sender.displayName }}</strong>
                <span class="contact-address">{{ sender.address }}</span>
              </span>
              <span class="contact-meta">
                <span>{{ $t(sender.count === 1 ? 'contacts.messageOne' : 'contacts.messageMany', { count: sender.count }) }}</span>
                <time :datetime="sender.timestamp">{{ formatRelativeDate(sender.timestamp) }}</time>
              </span>
              <span class="i-tabler-chevron-right contact-chevron" aria-hidden="true" />
            </NuxtLink>
          </div>
          <nav v-if="filteredSenders.length > pageSize" class="contacts-pagination" data-page-key="recentPage" :aria-label="$t('contacts.recentPagination')">
            <button type="button" aria-keyshortcuts="ArrowLeft" :disabled="recentPage === 1" @click="navigatePage('recentPage', recentPage - 1)">
              <span class="i-tabler-chevron-left" aria-hidden="true" />
              {{ $t('contacts.previousPage') }}
            </button>
            <span>{{ $t('contacts.pageOf', { page: recentPage, total: recentPageCount }) }}</span>
            <button type="button" aria-keyshortcuts="ArrowRight" :disabled="recentPage === recentPageCount" @click="navigatePage('recentPage', recentPage + 1)">
              {{ $t('contacts.nextPage') }}
              <span class="i-tabler-chevron-right" aria-hidden="true" />
            </button>
          </nav>
        </section>

        <div v-if="!visibleCount" class="contacts-state contacts-empty">
          <span class="i-tabler-address-book" aria-hidden="true" />
          <h2>{{ query ? $t('contacts.noResultsTitle') : $t('contacts.emptyTitle') }}</h2>
          <p>{{ query ? $t('contacts.noResultsDescription') : $t('contacts.emptyDescription') }}</p>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
type Contact = {
  id: string
  displayName: string
  company: string
  addresses: { address: string, isPrimary: boolean }[]
  note: string | null
  lastMessageAt: string | null
  messageCount: number
  latestSubject: string
  profileAddress: string
}
type RecentSender = { address: string, displayName: string, count: number, timestamp: string, subject: string }
type ContactResponse = { contacts: Contact[], recentSenders: RecentSender[] }

const { $t } = useI18n()
const { locale } = useI18nLocale()
const route = useRoute()
const router = useRouter()
const query = ref('')
const importOpen = ref(false)
const importError = ref('')
const importing = ref(false)
const importResult = ref<{ importedCount: number, duplicateCount: number } | null>(null)
type PreviewCard = { key: string, displayName: string, addresses: string[], company: string, phones: { label: string, number: string }[], postalAddresses: { label: string, address: string }[], unsupported: string[], duplicate: boolean, unsupportedVersion: boolean, selected: boolean }
const previewCards = ref<PreviewCard[]>([])
const unsupportedCount = computed(() => previewCards.value.filter(card => card.unsupported.length).length)
const selectedCards = computed(() => previewCards.value.filter(card => card.selected))
const searchInput = ref<HTMLInputElement | null>(null)
const pageSize = 20
const { data: contactData, pending, error, refresh } = await useFetch<ContactResponse>('/api/contacts', {
  default: () => ({ contacts: [], recentSenders: [] }),
})
const contacts = computed(() => contactData.value?.contacts || [])
const recentSenders = computed(() => contactData.value?.recentSenders || [])

const filteredContacts = computed(() => contacts.value.filter(contact => matches(`${contact.displayName} ${contact.company || ''} ${contact.addresses.map(item => item.address).join(' ')}`, query.value)))
const filteredSenders = computed(() => recentSenders.value.filter(sender => matches(`${sender.displayName} ${sender.address}`, query.value)))
const savedPageCount = computed(() => Math.max(1, Math.ceil(filteredContacts.value.length / pageSize)))
const recentPageCount = computed(() => Math.max(1, Math.ceil(filteredSenders.value.length / pageSize)))
const savedPage = computed(() => clampPage(route.query.savedPage, savedPageCount.value))
const recentPage = computed(() => clampPage(route.query.recentPage, recentPageCount.value))
const paginatedContacts = computed(() => filteredContacts.value.slice((savedPage.value - 1) * pageSize, savedPage.value * pageSize))
const paginatedSenders = computed(() => filteredSenders.value.slice((recentPage.value - 1) * pageSize, recentPage.value * pageSize))
const visibleCount = computed(() => filteredContacts.value.length + filteredSenders.value.length)

watch(query, () => {
  const nextQuery = { ...route.query }
  delete nextQuery.savedPage
  delete nextQuery.recentPage
  if (route.query.savedPage !== undefined || route.query.recentPage !== undefined) {
    void router.replace({ query: nextQuery })
  }
})

watch([savedPage, recentPage], () => {
  const nextQuery = { ...route.query }
  setPageQuery(nextQuery, 'savedPage', savedPage.value)
  setPageQuery(nextQuery, 'recentPage', recentPage.value)
  if (route.query.savedPage === nextQuery.savedPage && route.query.recentPage === nextQuery.recentPage) return
  void router.replace({ query: nextQuery })
})

function parsePage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number.parseInt(String(raw ?? ''), 10)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function clampPage(value: unknown, pageCount: number): number {
  return Math.min(parsePage(value), pageCount)
}

function setPageQuery(query: Record<string, unknown>, key: 'savedPage' | 'recentPage', page: number) {
  if (page > 1) query[key] = String(page)
  else delete query[key]
}

async function navigatePage(key: 'savedPage' | 'recentPage', requestedPage: number) {
  const pageCount = key === 'savedPage' ? savedPageCount.value : recentPageCount.value
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const nextQuery = { ...route.query }
  setPageQuery(nextQuery, key, page)
  await router.push({ query: nextQuery })
}

onMounted(() => window.addEventListener('keydown', handleContactsPageShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleContactsPageShortcut))

function handleContactsPageShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return

  const target = event.target instanceof Element ? event.target : null
  const openSurfaceSelector = '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-state="open"], [aria-haspopup="dialog"][aria-expanded="true"], [aria-haspopup="menu"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]'
  if (!target || target.closest(openSurfaceSelector)) return
  if ([...document.querySelectorAll<HTMLElement>(openSurfaceSelector)].some(surface => surface.getClientRects().length > 0)) return

  const isTypingTarget = Boolean(target.closest('input, textarea, select, [role="textbox"], [contenteditable="true"], [contenteditable=""]'))
  if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    const focusedRow = target.closest<HTMLAnchorElement>('.contact-row')

    if (focusedRow) {
      const rows = [...document.querySelectorAll<HTMLAnchorElement>('.contact-row')]
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const currentIndex = rows.indexOf(focusedRow)
      const nextIndex = currentIndex + direction

      if (nextIndex >= 0 && nextIndex < rows.length) {
        event.preventDefault()
        rows[nextIndex]?.focus()
      }
      else if (focusedRow && currentIndex === 0 && direction < 0) {
        event.preventDefault()
        searchInput.value?.focus()
      }
      return
    }
  }

  if (!isTypingTarget && !event.metaKey && !event.ctrlKey && !event.altKey && /^\p{L}$/u.test(event.key)) {
    const input = searchInput.value
    if (!input) return
    event.preventDefault()
    query.value += event.key
    void nextTick(() => {
      input.focus()
      const cursor = input.value.length
      input.setSelectionRange(cursor, cursor)
    })
    return
  }

  if (isTypingTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

  const focusedSection = target.closest<HTMLElement>('.contacts-section')
  let nav = focusedSection?.querySelector<HTMLElement>('.contacts-pagination') || null
  if (focusedSection && !nav) return

  if (!nav && target.closest('a, button, [role="button"], [tabindex]:not([tabindex="-1"])')) return
  if (!nav) nav = nearestContactsPagination()
  if (!nav) return

  const key = nav.dataset.pageKey
  if (key !== 'savedPage' && key !== 'recentPage') return

  const page = key === 'savedPage' ? savedPage.value : recentPage.value
  const pageCount = key === 'savedPage' ? savedPageCount.value : recentPageCount.value
  const requestedPage = page + (event.key === 'ArrowRight' ? 1 : -1)
  if (requestedPage < 1 || requestedPage > pageCount) return

  const focusedShortcut = target.closest<HTMLButtonElement>('button[aria-keyshortcuts]')?.getAttribute('aria-keyshortcuts')
  const focusedInThisNav = target.closest('.contacts-pagination') === nav
  event.preventDefault()
  void navigatePage(key, requestedPage).then(async () => {
    if (!focusedInThisNav) return
    await nextTick()
    const focusedButton = focusedShortcut
      ? nav?.querySelector<HTMLButtonElement>(`button[aria-keyshortcuts="${focusedShortcut}"]`)
      : null
    const fallbackButton = nav?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    if (focusedButton && !focusedButton.disabled) focusedButton.focus()
    else fallbackButton?.focus()
  })
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return

  const rows = [...document.querySelectorAll<HTMLAnchorElement>('.contact-row')]
  if (!rows.length) return

  event.preventDefault()
  const row = event.key === 'ArrowDown' ? rows[0] : rows.at(-1)
  row?.focus()
}

function nearestContactsPagination(): HTMLElement | null {
  const viewportCenter = window.innerHeight / 2
  const paginations = [...document.querySelectorAll<HTMLElement>('.contacts-pagination[data-page-key]')]
  return paginations
    .map(nav => {
      const section = nav.closest<HTMLElement>('.contacts-section')
      if (!section) return { nav, distance: Number.POSITIVE_INFINITY }
      const rect = section.getBoundingClientRect()
      const distance = viewportCenter < rect.top ? rect.top - viewportCenter : viewportCenter > rect.bottom ? viewportCenter - rect.bottom : 0
      return { nav, distance }
    })
    .sort((a, b) => a.distance - b.distance)[0]?.nav || null
}

function matches(value: string, search: string) {
  return !search.trim() || value.toLocaleLowerCase(locale.value).includes(search.trim().toLocaleLowerCase(locale.value))
}

function initials(value: string) {
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase(locale.value)).join('') || '??'
}

function toneFor(value: string) {
  const tones = ['sage', 'rose', 'sand', 'blue']
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return tones[Math.abs(hash) % tones.length]
}

function primaryAddress(contact: Contact) {
  return contact.addresses.find(address => address.isPrimary)?.address || contact.addresses[0]?.address || ''
}

function formatRelativeDate(value: string) {
  const date = new Date(value)
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (elapsedDays <= 0) return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
  if (elapsedDays < 7) return new Intl.RelativeTimeFormat(locale.value === 'en' ? 'en' : 'fr', { numeric: 'auto' }).format(-elapsedDays, 'day')
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short' }).format(date)
}

async function loadContacts() {
  await refresh()
}

function decodeVcardText(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function vcardLabel(line: string, fallback: string) {
  const head = line.slice(0, line.indexOf(':')).split(';').slice(1)
  const type = head.flatMap(part => part.replace(/^TYPE=/i, '').split(',')).find(part => part && !part.includes('='))
  if (!type) return fallback
  return type.toLowerCase().replace(/(^|[-_])([a-z])/g, (_match, prefix, letter) => `${prefix ? ' ' : ''}${letter.toUpperCase()}`)
}

function splitVcardComponents(value: string) {
  const components: string[] = []
  let current = ''
  let escaped = false
  for (const character of value) {
    if (escaped) { current += `\\${character}`; escaped = false }
    else if (character === '\\') escaped = true
    else if (character === ';') { components.push(current); current = '' }
    else current += character
  }
  if (escaped) current += '\\'
  components.push(current)
  return components.map(component => decodeVcardText(component).trim()).filter(Boolean)
}

async function readVcard(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  importError.value = ''
  importResult.value = null
  previewCards.value = []
  if (!file) return
  if (file.size > 2 * 1024 * 1024) { importError.value = $t('contacts.fileTooLarge'); return }
  try {
    const text = (await file.text()).replace(/\r?\n[ \t]/g, '')
    const blocks = text.split(/BEGIN:VCARD\s*/i).slice(1).map(block => block.split(/END:VCARD/i)[0] || '').filter(Boolean)
    if (!blocks.length || blocks.length > 100) { importError.value = $t('contacts.invalidVcardCount'); return }
    const known = new Set(contacts.value.flatMap(contact => contact.addresses.map(item => item.address.toLowerCase())))
    const seen = new Set<string>()
    previewCards.value = blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).filter(Boolean)
      const version = lines.find(line => /^VERSION:/i.test(line))?.split(':').slice(1).join(':').trim() || ''
      const unsupportedVersion = !['3.0', '4.0'].includes(version)
      const nameLine = lines.find(line => /^(?:item\d+\.)?FN(?:;[^:]*)?:/i.test(line))
      const displayName = nameLine ? decodeVcardText(nameLine.slice(nameLine.indexOf(':') + 1).trim()) : ''
      const addresses = [...new Set(lines.filter(line => /^(?:item\d+\.)?EMAIL(?:;[^:]*)?:/i.test(line))
        .map(line => decodeVcardText(line.slice(line.indexOf(':') + 1).trim()).toLowerCase())
        .filter(value => /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/.test(value)))].slice(0, 10)
      const companyLine = lines.find(line => /^(?:item\d+\.)?ORG(?:;[^:]*)?:/i.test(line))
      const companyParts = companyLine ? splitVcardComponents(companyLine.slice(companyLine.indexOf(':') + 1)) : []
      const company = companyParts[0]?.slice(0, 120) || ''
      const phones = lines.filter(line => /^(?:item\d+\.)?TEL(?:;[^:]*)?:/i.test(line)).map(line => ({
        label: vcardLabel(line, ''),
        number: decodeVcardText(line.slice(line.indexOf(':') + 1).trim()),
      })).filter(phone => phone.number && /\d/.test(phone.number)).slice(0, 10)
      const postalAddresses = lines.filter(line => /^(?:item\d+\.)?ADR(?:;[^:]*)?:/i.test(line)).map(line => ({
        label: vcardLabel(line, ''),
        address: splitVcardComponents(line.slice(line.indexOf(':') + 1)).join('\n'),
      })).filter(item => item.address).slice(0, 10)
      const duplicate = addresses.some(address => known.has(address) || seen.has(address))
      addresses.forEach(address => seen.add(address))
      const unsupported = [...new Set(lines.map(line => line.split(/[;:]/, 1)[0]!.replace(/^item\d+\./i, '').toUpperCase())
        .filter(field => ['PHOTO', 'BDAY', 'URL', 'TITLE'].includes(field)))]
      if (companyParts.length > 1) unsupported.push('ORG department')
      return { key: `${index}-${addresses[0] || 'card'}`, displayName, addresses, company, phones, postalAddresses, unsupported, duplicate, unsupportedVersion, selected: !duplicate && !unsupportedVersion && addresses.length > 0 }
    })
  } catch { importError.value = $t('contacts.readVcardError') }
}

async function importSelected() {
  if (!selectedCards.value.length || importing.value) return
  importing.value = true
  importError.value = ''
  try {
    const result = await $fetch<{ importedCount: number, duplicateCount: number }>('/api/contacts/import', {
      method: 'POST',
      body: { contacts: selectedCards.value.map(card => ({ displayName: card.displayName, addresses: card.addresses, company: card.company, phones: card.phones, postalAddresses: card.postalAddresses })) },
    })
    importResult.value = result
    await refresh()
    if (result.importedCount) previewCards.value.forEach(card => { if (card.selected) card.selected = false })
  } catch (cause) {
    importError.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage || $t('contacts.importError')
  } finally { importing.value = false }
}

function closeImport() { importOpen.value = false; previewCards.value = []; importError.value = ''; importResult.value = null }

useSeoMeta({ title: computed(() => `${$t('contacts.title')} — Courrier`) })
</script>

<style scoped>
.contacts-page { padding-top: 30px; }
.contacts-view { width: min(100%, 920px); margin: 0 auto; }
.contacts-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin: 0 0 27px; }
.contacts-heading-actions { display: flex; align-items: center; gap: 9px; }
.contacts-action { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 13px; border: 1px solid var(--accent); border-radius: 999px; background: transparent; color: var(--accent); font: inherit; font-size: 13px; font-weight: 650; text-decoration: none; cursor: pointer; white-space: nowrap; }
.contacts-action:hover { background: var(--accent-wash); }
.contacts-new { background: var(--accent); color: white; }
.contacts-new:hover { color: white; filter: brightness(.95); }
.contacts-import-panel { margin: -8px 0 24px; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); }
.import-heading { display: flex; justify-content: space-between; gap: 18px; }
.import-heading h2 { margin: 0; color: var(--ink); font-size: 16px; }
.import-heading p { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.import-close { width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 25px; cursor: pointer; }
.vcard-file { display: grid; gap: 8px; margin: 18px 0 10px; color: var(--ink); font-size: 13px; font-weight: 650; }
.vcard-file input { font: inherit; font-size: 13px; }
.import-summary, .import-result { color: var(--muted); font-size: 13px; }
.import-preview { max-height: 280px; overflow-y: auto; border-top: 1px solid var(--line); }
.import-card { display: flex; align-items: start; gap: 10px; padding: 11px 5px; border-bottom: 1px solid var(--line); color: var(--ink); font-size: 13px; cursor: pointer; }
.import-card > input { margin-top: 3px; accent-color: var(--accent); }
.import-card > span { display: grid; gap: 3px; min-width: 0; }
.import-card small { overflow-wrap: anywhere; color: var(--muted); font-size: 12px; font-weight: 400; }
.import-card .duplicate-label, .import-error { color: var(--error); }
.import-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
.import-actions button { min-height: 38px; padding: 0 14px; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: white; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.import-actions button:disabled { opacity: .55; cursor: not-allowed; }
.contacts-heading h1 { margin: 0; color: var(--ink); font-size: clamp(28px, 3.25vw, 39px); font-weight: 680; letter-spacing: -.03em; line-height: 1.15; }
.contacts-heading p { margin: 8px 0 0; color: var(--muted); font-size: 15px; line-height: 1.55; }
.contacts-count { padding-bottom: 3px; color: var(--quiet); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.contacts-search { display: flex; min-height: 46px; align-items: center; gap: 11px; margin-bottom: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--quiet); }
.contacts-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: 14px; }
.contacts-search input::placeholder { color: var(--quiet); opacity: 1; }
.contacts-search:focus-within { border-color: var(--accent); outline: 2px solid color-mix(in srgb, var(--accent) 25%, transparent); outline-offset: 1px; }
.contacts-search button { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.contacts-search button:hover { background: var(--accent-wash); color: var(--accent); }
.contacts-section + .contacts-section { margin-top: 37px; }
.contacts-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 9px; }
.contacts-section-heading h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 680; letter-spacing: -.015em; }
.contacts-section-heading > span { color: var(--quiet); font-size: 13px; font-variant-numeric: tabular-nums; }
.contacts-section-heading p { margin: 4px 0 0; color: var(--quiet); font-size: 13px; line-height: 1.5; }
.contacts-list { border-top: 1px solid var(--line); }
.contacts-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 4px 0; color: var(--quiet); font-size: 13px; font-variant-numeric: tabular-nums; }
.contacts-pagination button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; cursor: pointer; }
.contacts-pagination button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.contacts-pagination button:disabled { color: var(--quiet); cursor: not-allowed; opacity: .55; }
.contact-row { display: flex; min-height: 78px; align-items: center; gap: 15px; padding: 12px 8px; border-bottom: 1px solid var(--line); color: inherit; text-decoration: none; transition: background-color 140ms ease; }
.contact-row:hover { background: color-mix(in srgb, var(--accent-wash) 58%, transparent); }
.contact-avatar { display: grid; width: 44px; height: 44px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: var(--ink); font-size: 14px; font-weight: 700; letter-spacing: -.02em; }
.tone-sage { background: var(--accent-wash); color: var(--accent); }
.tone-rose { background: color-mix(in srgb, var(--surface-soft) 78%, var(--error) 22%); }
.tone-sand { background: color-mix(in srgb, var(--surface-soft) 72%, var(--sage) 28%); }
.tone-blue { background: color-mix(in srgb, var(--surface-soft) 78%, var(--reply-later) 22%); }
.contact-copy { display: grid; min-width: 0; flex: 1 1 auto; gap: 3px; }
.contact-name-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
.contact-copy strong { overflow: hidden; color: var(--ink); font-size: 15px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.contact-address, .contact-secondary { overflow: hidden; color: var(--muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.contact-company { overflow: hidden; color: var(--quiet); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.contact-secondary { color: var(--quiet); font-size: 13px; }
.contact-note-icon { color: var(--accent); font-size: 15px; }
.contact-meta { display: grid; flex: 0 0 auto; justify-items: end; gap: 5px; color: var(--quiet); font-size: 13px; font-variant-numeric: tabular-nums; }
.contact-meta time { color: var(--muted); }
.contact-chevron { flex: 0 0 auto; color: var(--quiet); font-size: 17px; }
.contacts-state { display: grid; justify-items: start; gap: 8px; padding: 22px 8px; color: var(--muted); font-size: 14px; }
.contacts-state p, .contacts-state h2 { margin: 0; }
.contacts-error { color: var(--error); }
.contacts-error button, .contacts-empty button { padding: 7px 12px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--accent); font: inherit; cursor: pointer; }
.contacts-empty { justify-items: center; padding: 56px 20px; text-align: center; }
.contacts-empty > span { color: var(--accent); font-size: 28px; }
.contacts-empty h2 { color: var(--ink); font-size: 15px; font-weight: 680; }
.contacts-empty p { max-width: 48ch; line-height: 1.6; }
.contact-row:focus-visible, .contacts-search button:focus-visible, .contacts-error button:focus-visible, .contacts-pagination button:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
@media (max-width: 560px) {
  .contacts-page { padding-top: 22px; }
  .contacts-heading { align-items: start; flex-direction: column; }
  .contacts-heading-actions { width: 100%; flex-wrap: wrap; }
  .contacts-heading p { max-width: 33ch; font-size: 13px; }
  .contact-row { gap: 11px; padding-inline: 2px; }
  .contact-avatar { width: 40px; height: 40px; font-size: 12px; }
  .contact-meta { max-width: 78px; font-size: 13px; text-align: right; }
  .contact-copy strong { font-size: 14px; }
  .contact-address { font-size: 13px; }
  .contact-chevron { display: none; }
}
@media (prefers-reduced-motion: reduce) { .contact-row { transition: none; } }
::selection { background: var(--accent-wash); color: var(--ink); }
</style>
