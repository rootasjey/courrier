import { ref, type ComputedRef, type Ref } from 'vue'
import type { MailboxFolder } from '~/types/mail'
import { mailboxByName, type MailboxKey } from '~/utils/mailbox-routing'

type BulkAction = 'mark-seen' | 'mark-unseen' | 'reply-later' | 'set-aside' | 'move' | 'trash'
type ActionMessage = { id: string, isRead: boolean }
type ActionThread = { id: string, messages: ActionMessage[] }

type MailThreadActionOptions = {
  activeFolder: ComputedRef<MailboxKey>
  selectedThread: ComputedRef<ActionThread | undefined>
  selectedThreadIds: ComputedRef<string[]>
  clearThreadSelection: () => void
  keyboardCursorId: Ref<string>
  refreshMessages: () => Promise<unknown>
  activityRefreshRevision: Ref<number>
  closeMessage: () => void
  setMessageRead: (message: ActionMessage, isRead: boolean) => void
  navigateToMailbox: (folder: MailboxKey) => unknown
  mergeFeedback: Ref<string>
  mergeError: Ref<string>
}

const supportedThreadFolders: MailboxKey[] = ['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside']

export function useMailThreadActions(options: MailThreadActionOptions) {
  const mergeDialogOpen = ref(false)
  const splitDialogOpen = ref(false)
  const isMergingThreads = ref(false)
  const isSplittingThread = ref(false)
  const threadTrashDialogOpen = ref(false)
  const bulkTrashDialogOpen = ref(false)
  const isTrashingThread = ref(false)
  const isMarkingThreadUnseen = ref(false)
  const isMovingOpenThread = ref(false)
  const threadMoveMenuOpen = ref(false)
  const threadActionFeedback = ref('')
  const threadActionError = ref('')
  const bulkActionFeedback = ref('')
  const bulkActionError = ref('')
  const isApplyingBulkAction = ref(false)
  const { $t } = useI18n()

  async function applyBulkAction(
    action: BulkAction,
    actionOptions: { enabled?: boolean, folder?: MailboxFolder } = {},
    targetThreadIds = options.selectedThreadIds.value,
    preserveKeyboardCursor = false,
  ) {
    if (!targetThreadIds.length || isApplyingBulkAction.value) return
    isApplyingBulkAction.value = true
    bulkActionError.value = ''
    bulkActionFeedback.value = ''

    try {
      const result = await $fetch<{ affectedThreads: number, activityCount?: number }>('/api/threads/bulk-action', {
        method: 'PATCH',
        body: { threadIds: targetThreadIds, source: options.activeFolder.value, action, ...actionOptions },
      })
      if (action === 'trash') bulkTrashDialogOpen.value = false
      await options.refreshMessages()
      options.clearThreadSelection()
      if (preserveKeyboardCursor) options.keyboardCursorId.value = targetThreadIds[0] ?? ''

      const count = result.affectedThreads
      const plural = count === 1 ? 'One' : 'Many'
      if (result.activityCount) options.activityRefreshRevision.value += 1
      if (action === 'mark-unseen') return

      const key = action === 'mark-seen' ? `bulk.markSeenDone${plural}`
        : action === 'reply-later' ? actionOptions.enabled ? `bulk.replyLaterDone${plural}` : `bulk.replyLaterRemoved${plural}`
          : action === 'set-aside' ? actionOptions.enabled ? `bulk.setAsideDone${plural}` : `bulk.setAsideRemoved${plural}`
            : action === 'move' ? `bulk.moveDone${plural}` : `bulk.trashDone${plural}`
      bulkActionFeedback.value = $t(key, { count, folder: mailboxByName(actionOptions.folder ?? 'Imbox').label })
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null
      bulkActionError.value = data && typeof data === 'object' && 'statusMessage' in data
        ? String(data.statusMessage)
        : $t('bulk.error')
    } finally {
      isApplyingBulkAction.value = false
    }
  }

  async function trashOpenThread() {
    const thread = options.selectedThread.value
    const source = options.activeFolder.value
    if (!thread || !supportedThreadFolders.includes(source) || isTrashingThread.value) return

    isTrashingThread.value = true
    bulkActionError.value = ''
    try {
      await $fetch('/api/threads/bulk-action', {
        method: 'PATCH',
        body: { threadIds: [thread.id], source, action: 'trash' },
      })
      threadTrashDialogOpen.value = false
      bulkActionFeedback.value = $t('messageActions.trashDone')
      await options.refreshMessages().catch(() => {})
      options.navigateToMailbox(source)
    } catch {
      bulkActionError.value = $t('palette.actionError')
    } finally {
      isTrashingThread.value = false
    }
  }

  function moveSelectedThreads(destination: { value: MailboxFolder, label: string } | null | undefined) {
    if (!destination) return
    void applyBulkAction('move', { folder: destination.value })
  }

  async function moveOpenThread(destination: { value: MailboxFolder, label: string } | null | undefined) {
    const thread = options.selectedThread.value
    const source = options.activeFolder.value
    if (!destination || !thread || !supportedThreadFolders.includes(source) || isMovingOpenThread.value) return

    isMovingOpenThread.value = true
    threadActionError.value = ''
    threadActionFeedback.value = ''
    try {
      await $fetch('/api/threads/bulk-action', {
        method: 'PATCH',
        body: { threadIds: [thread.id], source, action: 'move', folder: destination.value },
      })
      await options.refreshMessages()
      await options.navigateToMailbox(destination.value)
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null
      threadActionError.value = data && typeof data === 'object' && 'statusMessage' in data
        ? String(data.statusMessage)
        : $t('messageActions.moveError')
    } finally {
      isMovingOpenThread.value = false
    }
  }

  async function mergeSelectedThreads() {
    if (options.selectedThreadIds.value.length < 2 || isMergingThreads.value) return
    isMergingThreads.value = true
    options.mergeError.value = ''
    try {
      const result = await $fetch<{ mergedThreads: number }>('/api/thread-merges', {
        method: 'POST',
        body: { threadIds: options.selectedThreadIds.value },
      })
      mergeDialogOpen.value = false
      options.clearThreadSelection()
      await options.refreshMessages()
      options.mergeFeedback.value = $t('mail.mergeDone', { count: result.mergedThreads })
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null
      options.mergeError.value = data && typeof data === 'object' && 'statusMessage' in data
        ? String(data.statusMessage)
        : $t('mail.mergeError')
    } finally {
      isMergingThreads.value = false
    }
  }

  async function splitSelectedThread() {
    const threadId = options.selectedThread.value?.id
    if (!threadId || isSplittingThread.value) return
    isSplittingThread.value = true
    options.mergeError.value = ''
    try {
      const result = await $fetch<{ originalThreads: number }>('/api/thread-merges/split', {
        method: 'POST',
        body: { threadId },
      })
      splitDialogOpen.value = false
      await options.refreshMessages()
      options.closeMessage()
      options.mergeFeedback.value = $t('mail.splitDone', { count: result.originalThreads })
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null
      options.mergeError.value = data && typeof data === 'object' && 'statusMessage' in data
        ? String(data.statusMessage)
        : $t('mail.splitError')
    } finally {
      isSplittingThread.value = false
    }
  }

  async function markOpenThreadUnseen() {
    const messages = options.selectedThread.value?.messages ?? []
    if (!messages.length || isMarkingThreadUnseen.value) return

    isMarkingThreadUnseen.value = true
    threadActionError.value = ''
    threadActionFeedback.value = ''
    const unreadMessages = messages.filter(message => message.isRead)
    if (!unreadMessages.length) {
      threadActionFeedback.value = $t('messageActions.alreadyUnseen')
      isMarkingThreadUnseen.value = false
      return
    }

    unreadMessages.forEach(message => options.setMessageRead(message, false))
    try {
      const result = await $fetch<{ activityId?: string, alreadyUnseen?: boolean }>(
        `/api/threads/${encodeURIComponent(options.selectedThread.value!.id)}/mark-unseen`,
        { method: 'POST' },
      )
      if (result.activityId) options.activityRefreshRevision.value += 1
      options.closeMessage()
    } catch {
      unreadMessages.forEach(message => options.setMessageRead(message, true))
      threadActionError.value = $t('messageActions.markUnseenError')
      await options.refreshMessages().catch(() => {})
    } finally {
      isMarkingThreadUnseen.value = false
    }
  }

  function setThreadMoveMenuOpen(open: boolean) {
    threadMoveMenuOpen.value = open
  }

  return {
    mergeDialogOpen,
    splitDialogOpen,
    isMergingThreads,
    isSplittingThread,
    threadTrashDialogOpen,
    bulkTrashDialogOpen,
    isTrashingThread,
    isMarkingThreadUnseen,
    isMovingOpenThread,
    threadMoveMenuOpen,
    threadActionFeedback,
    threadActionError,
    bulkActionFeedback,
    bulkActionError,
    isApplyingBulkAction,
    applyBulkAction,
    trashOpenThread,
    moveSelectedThreads,
    moveOpenThread,
    mergeSelectedThreads,
    splitSelectedThread,
    markOpenThreadUnseen,
    setThreadMoveMenuOpen,
  }
}
