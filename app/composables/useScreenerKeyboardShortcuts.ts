import { nextTick, type ComputedRef, type Ref } from 'vue'
import type { MailboxKey } from '~/utils/mailbox-routing'

type ScreenerSender<Message> = {
  address: string
  latest: Message
}

type ScreenerKeyboardShortcutOptions<Message> = {
  activeFolder: ComputedRef<MailboxKey>
  allScreenerSenders: ComputedRef<ScreenerSender<Message>[]>
  applyScreenerChoice: (message: Message, folder: MailboxKey, scope: 'sender' | 'message') => unknown
  blockScreenerSender: (message: Message) => unknown
  hasOpenKeyboardSurface: () => boolean
  navigateToFolder: (folder: MailboxKey) => unknown
  openScreenerOptionsFor: Ref<string>
  screenerClearDialogOpen: Ref<boolean>
  screenerDestination: Ref<'Imbox' | 'The Feed' | 'Paper Trail'>
  screenerScope: Ref<'sender' | 'message'>
  screenerSenders: ComputedRef<ScreenerSender<Message>[]>
  screenerShortcutHelpOpen: Ref<boolean>
  screenerView: Ref<'pending' | 'history'>
  selectedScreenerAddress: Ref<string>
  toggleScreenerOptions: (address: string, message: Message) => unknown
  trashScreenerMessage: (message: Message) => unknown
}

export function useScreenerKeyboardShortcuts<Message>(options: ScreenerKeyboardShortcutOptions<Message>) {
  return function handleScreenerKeyboardShortcut(event: KeyboardEvent) {
    const {
      activeFolder,
      allScreenerSenders,
      applyScreenerChoice,
      blockScreenerSender,
      hasOpenKeyboardSurface,
      navigateToFolder,
      openScreenerOptionsFor,
      screenerClearDialogOpen,
      screenerDestination,
      screenerScope,
      screenerSenders,
      screenerShortcutHelpOpen,
      screenerView,
      selectedScreenerAddress,
      toggleScreenerOptions,
      trashScreenerMessage,
    } = options

    if (activeFolder.value !== 'Screener' || screenerView.value !== 'pending') return false

    if (screenerShortcutHelpOpen.value) {
      if (event.key === 'Escape') {
        event.preventDefault()
        screenerShortcutHelpOpen.value = false
      }
      return true
    }

    if (screenerClearDialogOpen.value) {
      if (event.key === 'Escape') {
        event.preventDefault()
        screenerClearDialogOpen.value = false
      }
      return true
    }

    const senders = screenerSenders.value
    const selectedAddress = selectedScreenerAddress.value
    const selected = senders.find(sender => sender.address.trim().toLocaleLowerCase('en-US') === selectedAddress)
    const key = event.key.toLocaleLowerCase('en-US')

    if (event.key === '?') {
      event.preventDefault()
      screenerShortcutHelpOpen.value = true
      return true
    }

    if (event.key === 'Escape') {
      if (hasOpenKeyboardSurface()) return true
      event.preventDefault()
      navigateToFolder('Imbox')
      return true
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!senders.length) return true
      event.preventDefault()
      const currentIndex = senders.findIndex(sender => sender.address.trim().toLocaleLowerCase('en-US') === selectedAddress)
      const nextIndex = currentIndex < 0
        ? (event.key === 'ArrowDown' ? 0 : senders.length - 1)
        : Math.max(0, Math.min(senders.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)))
      selectedScreenerAddress.value = senders[nextIndex]!.address.trim().toLocaleLowerCase('en-US')
      openScreenerOptionsFor.value = ''
      void nextTick(() => document.querySelector<HTMLElement>('.screener-row.is-keyboard-selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
      return true
    }

    if (key === 'c' && allScreenerSenders.value.length) {
      event.preventDefault()
      screenerClearDialogOpen.value = true
      return true
    }

    if (!selected) return true

    if (openScreenerOptionsFor.value === selected.address && ['i', 'f', 'p', 'g', 'y', 'enter', ' '].includes(key)) {
      event.preventDefault()
      if (key === 'i') screenerDestination.value = 'Imbox'
      else if (key === 'f') screenerDestination.value = 'The Feed'
      else if (key === 'p') screenerDestination.value = 'Paper Trail'
      else if (key === 'g') screenerScope.value = screenerScope.value === 'sender' ? 'message' : 'sender'
      else void applyScreenerChoice(selected.latest, screenerDestination.value, screenerScope.value)
      return true
    }

    if (key === 'n') {
      event.preventDefault()
      openScreenerOptionsFor.value = ''
      void blockScreenerSender(selected.latest)
    } else if (key === 'y') {
      event.preventDefault()
      toggleScreenerOptions(selected.address, selected.latest)
      if (openScreenerOptionsFor.value === selected.address) {
        void nextTick(() => document.querySelector<HTMLButtonElement>('.screener-destinations button[aria-pressed="true"]')?.focus())
      }
    } else if (key === 't') {
      event.preventDefault()
      openScreenerOptionsFor.value = ''
      void trashScreenerMessage(selected.latest)
    }
    return true
  }
}
