import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { mailboxByName, type MailboxKey } from '~/utils/mailbox-routing'
import type { MailScreenerState, ScreenerDestination, ScreenerMessage, ScreenerSender } from '~/types/mail-screener'

type MailScreenerOptions<Message extends ScreenerMessage> = {
  messages: Ref<Message[]>
  search: Ref<string>
  activeFolder: ComputedRef<MailboxKey>
  isSaving: Ref<boolean>
  actionError: Ref<string>
  refreshMessages: () => Promise<void>
  showClassificationFeedback: (message: string, undoId?: string) => void
  clearClassificationTarget: () => void
}

export function useMailScreener<Message extends ScreenerMessage>({
  messages,
  search,
  activeFolder,
  isSaving,
  actionError,
  refreshMessages,
  showClassificationFeedback,
  clearClassificationTarget,
}: MailScreenerOptions<Message>): MailScreenerState<Message> {
  const { $t } = useI18n()
  const view = ref<'pending' | 'history'>('pending')
  const selectedAddress = ref('')
  const openOptionsFor = ref('')
  const clearDialogOpen = ref(false)
  const shortcutHelpOpen = ref(false)
  const destination = ref<ScreenerDestination>('Imbox')
  const scope = ref<'sender' | 'message'>('sender')
  const isClearing = ref(false)

  const allSenders = computed(() => {
    const senders = new Map<string, ScreenerSender<Message, 'pending'>>()

    for (const message of messages.value.filter(message => message.folder === 'Screener' && message.screenerState === 'pending')) {
      const address = message.address.trim().toLocaleLowerCase('en-US')
      const existing = senders.get(address)
      if (existing) existing.count += 1
      else senders.set(address, { address: message.address, latest: message, count: 1, state: 'pending' })
    }

    return [...senders.values()]
  })

  const historySenders = computed(() => {
    const senders = new Map<string, ScreenerSender<Message, 'cleared' | 'blocked'>>()

    for (const message of messages.value.filter(message => message.folder === 'Screener' && message.screenerState !== 'pending')) {
      const address = message.address.trim().toLocaleLowerCase('en-US')
      const existing = senders.get(address)
      if (existing) {
        existing.count += 1
        if (message.screenerState === 'blocked') existing.state = 'blocked'
      } else {
        senders.set(address, {
          address: message.address,
          latest: message,
          count: 1,
          state: message.screenerState === 'blocked' ? 'blocked' : 'cleared',
        })
      }
    }

    return [...senders.values()]
  })

  const senders = computed(() => {
    const query = search.value.trim().toLocaleLowerCase('fr')
    if (!query) return allSenders.value

    return allSenders.value.filter(({ address, latest }) =>
      `${address} ${latest.sender} ${latest.subject} ${latest.preview}`.toLocaleLowerCase('fr').includes(query),
    )
  })

  const visibleHistory = computed(() => {
    const query = search.value.trim().toLocaleLowerCase('fr')
    if (!query) return historySenders.value

    return historySenders.value.filter(({ address, latest }) =>
      `${address} ${latest.sender} ${latest.subject} ${latest.preview}`.toLocaleLowerCase('fr').includes(query),
    )
  })

  watch(senders, (nextSenders) => {
    if (!nextSenders.some(sender => sender.address.trim().toLocaleLowerCase('en-US') === selectedAddress.value)) {
      selectedAddress.value = ''
      openOptionsFor.value = ''
    }
  })

  function toggleOptions(address: string) {
    if (openOptionsFor.value === address) {
      openOptionsFor.value = ''
      return
    }

    destination.value = 'Imbox'
    scope.value = 'sender'
    openOptionsFor.value = address
  }

  function requestClear() {
    if (activeFolder.value === 'Screener' && view.value === 'pending' && allSenders.value.length && !isClearing.value) {
      clearDialogOpen.value = true
    }
  }

  async function applyChoice(message: Message, folder: ScreenerDestination, choiceScope: 'sender' | 'message') {
    if (isSaving.value) return
    isSaving.value = true
    actionError.value = ''
    openOptionsFor.value = ''

    try {
      if (choiceScope === 'sender') {
        const result = await $fetch<{ folder: ScreenerDestination, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(message.id)}/sender-rule`, {
          method: 'PUT',
          body: { folder },
        })
        showClassificationFeedback($t(result.affectedMessages === 1 ? 'mail.classificationDoneOne' : 'mail.classificationDoneMany', { count: result.affectedMessages, folder: mailboxByName(result.folder).label }), result.undoId)
      } else {
        await $fetch(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
          method: 'PATCH',
          body: { folder },
        })
        showClassificationFeedback($t('mail.messageClassified'))
      }
      clearClassificationTarget()
      await refreshMessages()
    } catch {
      actionError.value = $t('mail.classificationError')
    } finally {
      isSaving.value = false
    }
  }

  async function blockSender(message: Message) {
    if (isSaving.value) return
    isSaving.value = true
    actionError.value = ''
    try {
      const result = await $fetch<{ preservedMessages: number }>(`/api/messages/${encodeURIComponent(message.id)}/block-sender`, {
        method: 'POST',
      })
      showClassificationFeedback($t(result.preservedMessages === 1 ? 'mail.blockedOne' : 'mail.blockedMany', { count: result.preservedMessages }))
      await refreshMessages()
    } catch {
      actionError.value = $t('mail.screenerBlockError')
    } finally {
      isSaving.value = false
    }
  }

  async function trashMessage(message: Message) {
    if (isSaving.value) return
    isSaving.value = true
    actionError.value = ''
    try {
      await $fetch(`/api/messages/${encodeURIComponent(message.id)}/trash`, { method: 'POST' })
      showClassificationFeedback($t('mail.screenerMessageTrashed'))
      await refreshMessages()
    } catch {
      actionError.value = $t('mail.screenerTrashError')
    } finally {
      isSaving.value = false
    }
  }

  async function clearAll() {
    if (isClearing.value || !allSenders.value.length) return
    clearDialogOpen.value = false
    isClearing.value = true
    actionError.value = ''
    try {
      const result = await $fetch<{ clearedMessages: number }>('/api/screener/clear', { method: 'POST' })
      showClassificationFeedback($t(result.clearedMessages === 1 ? 'mail.screenerClearedOne' : 'mail.screenerClearedMany', { count: result.clearedMessages }))
      await refreshMessages()
    } catch {
      actionError.value = $t('mail.screenerClearError')
    } finally {
      isClearing.value = false
    }
  }

  async function restoreSender(message: Message, state: 'cleared' | 'blocked') {
    if (isSaving.value) return
    isSaving.value = true
    actionError.value = ''
    try {
      if (state === 'blocked') {
        await $fetch(`/api/messages/${encodeURIComponent(message.id)}/unblock-sender`, { method: 'POST' })
        showClassificationFeedback($t('mail.senderAllowed'))
      } else {
        await $fetch(`/api/messages/${encodeURIComponent(message.id)}/restore-screener`, { method: 'POST' })
        showClassificationFeedback($t('mail.messagesRestoredToScreener'))
      }
      await refreshMessages()
    } catch {
      actionError.value = $t('mail.screenerUpdateError')
    } finally {
      isSaving.value = false
    }
  }

  return {
    view,
    selectedAddress,
    openOptionsFor,
    clearDialogOpen,
    shortcutHelpOpen,
    destination,
    scope,
    actionError,
    isClearing,
    isSaving,
    allSenders,
    historySenders,
    senders,
    visibleHistory,
    toggleOptions,
    requestClear,
    applyChoice,
    blockSender,
    trashMessage,
    clearAll,
    restoreSender,
  }
}
