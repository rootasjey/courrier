type RecipientField = 'to' | 'cc' | 'bcc'
type ContactSuggestion = { address: string, displayName: string }
type RecipientMenuState = { address: string, field: RecipientField, x: number, y: number }

export function useOutgoingComposerRecipients(options: { focusInput: () => void, focusEditor: () => void }) {
  const to = ref('')
  const recipientEntry = ref('')
  const cc = ref('')
  const bcc = ref('')
  const recipientLabels = ref<Record<string, string>>({})
  const recipientSuggestions = ref<ContactSuggestion[]>([])
  const recipientSuggestionsOpen = ref(false)
  const recipientSuggestionIndex = ref(0)
  const recipientMenu = ref<RecipientMenuState | null>(null)
  const recipientRoles: RecipientField[] = ['to', 'cc', 'bcc']

  let contactSuggestionTimer: ReturnType<typeof setTimeout> | undefined
  let contactSuggestionRequest = 0
  let recipientLongPressTimer: ReturnType<typeof setTimeout> | undefined
  let recipientLongPressOrigin: { x: number, y: number } | null = null

  const committedRecipients = computed(() => splitRecipients(to.value))
  const ccRecipients = computed(() => splitRecipients(cc.value))
  const bccRecipients = computed(() => splitRecipients(bcc.value))
  const pendingRecipientTokens = computed(() => splitRecipients(recipientEntry.value).map(token => parseRecipientToken(token)))
  const toRecipientList = computed(() => [...committedRecipients.value, ...pendingRecipientTokens.value.filter(item => item.field === 'to').map(item => item.address)])
  const ccRecipientList = computed(() => [...ccRecipients.value, ...pendingRecipientTokens.value.filter(item => item.field === 'cc').map(item => item.address)])
  const bccRecipientList = computed(() => [...bccRecipients.value, ...pendingRecipientTokens.value.filter(item => item.field === 'bcc').map(item => item.address)])
  const recipientList = computed(() => [...toRecipientList.value, ...ccRecipientList.value, ...bccRecipientList.value])
  const visibleRecipients = computed(() => [
    ...committedRecipients.value.map(address => ({ address, field: 'to' as const })),
    ...ccRecipients.value.map(address => ({ address, field: 'cc' as const })),
    ...bccRecipients.value.map(address => ({ address, field: 'bcc' as const })),
  ])
  const recipientMenuStyle = computed(() => recipientMenu.value ? { left: `${recipientMenu.value.x}px`, top: `${recipientMenu.value.y}px` } : {})

  function splitRecipients(value: string) {
    return value.split(/[;,\n]+/).map(address => address.trim()).filter(Boolean)
  }

  function isValidRecipient(address: string) {
    return /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/.test(address)
  }

  function parseRecipientToken(raw: string, fallback: RecipientField = 'to') {
    let value = raw.trim()
    let field = fallback
    const prefix = /^(cci|bcc|cc)\s*(?::\s*|\s+)(.*)$/iu.exec(value)
    if (prefix) {
      field = prefix[1]!.toLocaleLowerCase() === 'cc' ? 'cc' : 'bcc'
      value = prefix[2]!.trim()
    }
    const mailbox = /^(.*?)\s*<([^<>]+)>$/u.exec(value)
    if (mailbox && isValidRecipient(mailbox[2]!.trim())) {
      return { field, address: mailbox[2]!.trim(), displayName: mailbox[1]!.trim().replace(/^"|"$/g, '') }
    }
    return { field, address: value, displayName: '' }
  }

  function recipientValue(field: RecipientField) { return field === 'to' ? to : field === 'cc' ? cc : bcc }

  function addRecipients(addresses: string[], fallback: RecipientField = 'to') {
    for (const raw of addresses) {
      const item = parseRecipientToken(raw, fallback)
      const address = item.address.trim()
      if (!isValidRecipient(address)) continue
      const normalized = address.toLocaleLowerCase()
      if ([...committedRecipients.value, ...ccRecipients.value, ...bccRecipients.value].some(existing => existing.toLocaleLowerCase() === normalized)) continue
      const target = recipientValue(item.field)
      target.value = [...splitRecipients(target.value), address].join(', ')
      if (item.displayName) recipientLabels.value = { ...recipientLabels.value, [normalized]: item.displayName }
    }
  }

  function commitRecipientEntry() {
    const entries = splitRecipients(recipientEntry.value)
    addRecipients(entries)
    recipientEntry.value = entries.filter(raw => {
      const item = parseRecipientToken(raw)
      return !isValidRecipient(item.address)
    }).join(', ')
  }

  function handleRecipientInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    if (!/[;,\n]/.test(value)) {
      if (!/\s$/.test(value)) {
        updateContactSuggestions(value)
        return
      }
      const candidate = value.trim()
      if (!isValidRecipient(parseRecipientToken(candidate).address)) {
        updateContactSuggestions(value)
        return
      }
      addRecipients([candidate])
      recipientEntry.value = ''
      recipientSuggestionsOpen.value = false
      return
    }
    const parts = value.split(/[;,\n]/u)
    const remainder = parts.pop()?.trim() || ''
    const completed = parts.map(address => address.trim()).filter(Boolean)
    addRecipients(completed)
    recipientEntry.value = [...completed.filter(raw => !isValidRecipient(parseRecipientToken(raw).address)), remainder].filter(Boolean).join(', ')
    updateContactSuggestions(recipientEntry.value)
  }

  function removeRecipient(field: RecipientField, address: string) {
    const target = recipientValue(field)
    target.value = splitRecipients(target.value).filter(item => item.toLocaleLowerCase() !== address.toLocaleLowerCase()).join(', ')
  }

  function removeLastRecipient(event: KeyboardEvent) {
    const recipient = visibleRecipients.value.at(-1)
    if (recipientEntry.value || !recipient) return
    event.preventDefault()
    removeRecipient(recipient.field, recipient.address)
  }

  function updateContactSuggestions(value: string) {
    if (contactSuggestionTimer) clearTimeout(contactSuggestionTimer)
    const query = parseRecipientToken(value).address.trim()
    const request = ++contactSuggestionRequest
    if (query.length < 2 || isValidRecipient(query)) {
      recipientSuggestions.value = []
      recipientSuggestionsOpen.value = false
      return
    }
    contactSuggestionTimer = setTimeout(async () => {
      try {
        const result = await $fetch<ContactSuggestion[]>('/api/contacts/suggestions', { query: { q: query } })
        if (request !== contactSuggestionRequest) return
        recipientSuggestions.value = result
        recipientSuggestionsOpen.value = result.length > 0
        recipientSuggestionIndex.value = 0
      } catch {
        if (request === contactSuggestionRequest) {
          recipientSuggestions.value = []
          recipientSuggestionsOpen.value = false
        }
      }
    }, 180)
  }

  function onRecipientBlur() {
    window.setTimeout(() => {
      if (!recipientMenu.value) {
        commitRecipientEntry()
        recipientSuggestionsOpen.value = false
      }
    }, 120)
  }

  function onRecipientKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' && recipientSuggestionsOpen.value) {
      event.preventDefault()
      recipientSuggestionIndex.value = (recipientSuggestionIndex.value + 1) % recipientSuggestions.value.length
    } else if (event.key === 'ArrowUp' && recipientSuggestionsOpen.value) {
      event.preventDefault()
      recipientSuggestionIndex.value = (recipientSuggestionIndex.value - 1 + recipientSuggestions.value.length) % recipientSuggestions.value.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (recipientSuggestionsOpen.value && recipientSuggestions.value[recipientSuggestionIndex.value]) {
        selectRecipientSuggestion(recipientSuggestions.value[recipientSuggestionIndex.value]!)
        options.focusEditor()
        return
      }
      commitRecipientEntry()
      recipientSuggestionsOpen.value = false
      if (!recipientEntry.value) options.focusEditor()
    } else if (event.key === 'Escape' && recipientSuggestionsOpen.value) {
      event.stopPropagation()
      recipientSuggestionsOpen.value = false
    }
  }

  function selectRecipientSuggestion(suggestion: ContactSuggestion) {
    const { field } = parseRecipientToken(recipientEntry.value)
    recipientLabels.value = { ...recipientLabels.value, [suggestion.address.toLocaleLowerCase()]: suggestion.displayName }
    addRecipients([`${field === 'cc' ? 'cc: ' : field === 'bcc' ? 'cci: ' : ''}${suggestion.address}`])
    recipientEntry.value = ''
    recipientSuggestionsOpen.value = false
    options.focusInput()
  }

  function recipientMenuPosition(clientX: number, clientY: number) {
    return {
      x: Math.max(8, Math.min(clientX, window.innerWidth - 184)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - 144)),
    }
  }

  function openRecipientMenu(event: MouseEvent, address: string, field: RecipientField) {
    const position = recipientMenuPosition(event.clientX, event.clientY)
    recipientMenu.value = { address, field, ...position }
    recipientSuggestionsOpen.value = false
  }

  function openRecipientMenuFromClick(event: MouseEvent, address: string, field: RecipientField) {
    openRecipientMenu(event, address, field)
  }

  function openRecipientMenuFromKeyboard(event: KeyboardEvent, address: string, field: RecipientField) {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    openRecipientMenu({ clientX: bounds.left, clientY: bounds.bottom } as MouseEvent, address, field)
  }

  function startRecipientLongPress(event: PointerEvent, address: string, field: RecipientField) {
    cancelRecipientLongPress()
    if (event.pointerType !== 'touch') return
    recipientLongPressOrigin = { x: event.clientX, y: event.clientY }
    recipientLongPressTimer = setTimeout(() => {
      const position = recipientMenuPosition(event.clientX, event.clientY)
      recipientMenu.value = { address, field, ...position }
      recipientSuggestionsOpen.value = false
    }, 500)
  }

  function moveRecipientLongPress(event: PointerEvent) {
    if (!recipientLongPressOrigin) return
    if (Math.hypot(event.clientX - recipientLongPressOrigin.x, event.clientY - recipientLongPressOrigin.y) > 10) cancelRecipientLongPress()
  }

  function cancelRecipientLongPress() {
    if (recipientLongPressTimer) clearTimeout(recipientLongPressTimer)
    recipientLongPressTimer = undefined
    recipientLongPressOrigin = null
  }

  function changeRecipientRole(field: RecipientField) {
    const menu = recipientMenu.value
    if (!menu || menu.field === field) {
      recipientMenu.value = null
      return
    }
    removeRecipient(menu.field, menu.address)
    addRecipients([`${field === 'cc' ? 'cc: ' : field === 'bcc' ? 'cci: ' : ''}${menu.address}`])
    recipientMenu.value = null
  }

  function onDocumentPointerdown(event: PointerEvent) {
    if (recipientMenu.value && !(event.target instanceof Element && event.target.closest('.compose-recipient-menu, .compose-recipient-badge'))) recipientMenu.value = null
    if (recipientSuggestionsOpen.value && !(event.target instanceof Element && event.target.closest('.compose-recipient-control'))) recipientSuggestionsOpen.value = false
  }

  function reset() {
    to.value = ''
    recipientEntry.value = ''
    cc.value = ''
    bcc.value = ''
    recipientLabels.value = {}
    recipientSuggestions.value = []
    recipientSuggestionsOpen.value = false
    recipientMenu.value = null
    cancelRecipientLongPress()
    if (contactSuggestionTimer) clearTimeout(contactSuggestionTimer)
    contactSuggestionTimer = undefined
  }

  onBeforeUnmount(() => {
    if (contactSuggestionTimer) clearTimeout(contactSuggestionTimer)
    cancelRecipientLongPress()
  })

  return {
    to, recipientEntry, cc, bcc, recipientLabels, recipientSuggestions, recipientSuggestionsOpen, recipientSuggestionIndex,
    recipientMenu, recipientRoles, committedRecipients, ccRecipients, bccRecipients, pendingRecipientTokens,
    toRecipientList, ccRecipientList, bccRecipientList, recipientList, visibleRecipients, recipientMenuStyle,
    splitRecipients, isValidRecipient, parseRecipientToken, addRecipients, commitRecipientEntry,
    handleRecipientInput, removeRecipient, removeLastRecipient, updateContactSuggestions, onRecipientBlur,
    onRecipientKeydown, selectRecipientSuggestion, openRecipientMenu, openRecipientMenuFromClick,
    openRecipientMenuFromKeyboard, startRecipientLongPress, moveRecipientLongPress, cancelRecipientLongPress,
    changeRecipientRole, onDocumentPointerdown, reset,
  }
}
