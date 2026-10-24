import type { ComputedRef, Ref } from 'vue'
import type { MailboxKey } from '~/utils/mailbox-routing'

export type ScreenerDestination = Exclude<MailboxKey, 'Screener' | 'Trash' | 'Set Aside' | 'Reply Later'>

export type ScreenerMessage = {
  id: string
  address: string
  sender: string
  subject: string
  preview: string
  timestamp: string
  initials: string
  color: string
  folder: MailboxKey
  screenerState: 'pending' | 'cleared' | 'blocked'
}

export type ScreenerSender<Message, State extends 'pending' | 'cleared' | 'blocked'> = {
  address: string
  latest: Message
  count: number
  state: State
}

export type MailScreenerState<Message extends ScreenerMessage> = {
  view: Ref<'pending' | 'history'>
  selectedAddress: Ref<string>
  openOptionsFor: Ref<string>
  clearDialogOpen: Ref<boolean>
  shortcutHelpOpen: Ref<boolean>
  destination: Ref<ScreenerDestination>
  scope: Ref<'sender' | 'message'>
  actionError: Ref<string>
  isClearing: Ref<boolean>
  isSaving: Ref<boolean>
  allSenders: ComputedRef<ScreenerSender<Message, 'pending'>[]>
  historySenders: ComputedRef<ScreenerSender<Message, 'cleared' | 'blocked'>[]>
  senders: ComputedRef<ScreenerSender<Message, 'pending'>[]>
  visibleHistory: ComputedRef<ScreenerSender<Message, 'cleared' | 'blocked'>[]>
  toggleOptions: (address: string) => void
  requestClear: () => void
  applyChoice: (message: Message, folder: ScreenerDestination, scope: 'sender' | 'message') => Promise<void>
  blockSender: (message: Message) => Promise<void>
  trashMessage: (message: Message) => Promise<void>
  clearAll: () => Promise<void>
  restoreSender: (message: Message, state: 'cleared' | 'blocked') => Promise<void>
}
