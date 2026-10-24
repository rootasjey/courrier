import { ref } from 'vue'
import { mailboxByName, type MailboxKey } from '~/utils/mailbox-routing'

type MailboxFolder = Exclude<MailboxKey, 'Screener' | 'Trash' | 'Set Aside' | 'Reply Later'>
type ClassificationScope = 'sender' | 'message' | 'group'
type ClassificationMessage = {
  id: string
  folder: MailboxKey
  sender: string
  address: string
  hasSenderRule: boolean
}

type MailClassificationOptions = {
  isCurrentThreadMerged: () => boolean
  refreshMessages: () => Promise<unknown>
  closeMessage: () => void
}

export function useMailClassification(options: MailClassificationOptions) {
  const classificationTarget = ref<ClassificationMessage | null>(null)
  const classificationScope = ref<ClassificationScope>('sender')
  const classificationFolder = ref<MailboxFolder>('Imbox')
  const isSavingClassification = ref(false)
  const isUndoingClassification = ref(false)
  const undoClassificationId = useState('courrier-undo-classification-id', () => '')
  const classificationError = ref('')
  const classificationFeedback = useState('courrier-classification-feedback', () => '')
  const classificationActionError = useState('courrier-classification-action-error', () => '')
  const { $t } = useI18n()
  let undoTimer: ReturnType<typeof setTimeout> | undefined

  function openClassification(message: ClassificationMessage, scope?: ClassificationScope) {
    classificationTarget.value = message
    classificationScope.value = scope ?? (options.isCurrentThreadMerged() ? 'group' : 'sender')
    classificationFolder.value = message.folder === 'Screener' || message.folder === 'Trash' ? 'Imbox' : message.folder as MailboxFolder
    classificationError.value = ''
  }

  function clearClassificationTarget() {
    classificationTarget.value = null
  }

  function showClassificationFeedback(message: string, undoId = '') {
    classificationFeedback.value = message
    classificationActionError.value = ''
    undoClassificationId.value = undoId
    if (undoTimer) clearTimeout(undoTimer)

    if (undoId) {
      undoTimer = setTimeout(() => {
        if (undoClassificationId.value === undoId) undoClassificationId.value = ''
        undoTimer = undefined
      }, 20_000)
    }
  }

  async function undoSenderRule() {
    const changeId = undoClassificationId.value
    if (!changeId || isUndoingClassification.value) return

    isUndoingClassification.value = true
    classificationActionError.value = ''
    try {
      const result = await $fetch<{ restoredMessages: number }>(`/api/sender-rule-changes/${encodeURIComponent(changeId)}/undo`, {
        method: 'POST',
      })
      undoClassificationId.value = ''
      if (undoTimer) clearTimeout(undoTimer)
      undoTimer = undefined
      showClassificationFeedback($t(result.restoredMessages === 1 ? 'mail.undoDoneOne' : 'mail.undoDoneMany', { count: result.restoredMessages }))
      try {
        await options.refreshMessages()
      } catch {
        classificationActionError.value = $t('mail.undoRefreshError')
      }
    } catch {
      classificationActionError.value = $t('mail.undoError')
    } finally {
      isUndoingClassification.value = false
    }
  }

  async function saveClassification() {
    const message = classificationTarget.value
    if (!message || isSavingClassification.value) return

    isSavingClassification.value = true
    classificationError.value = ''
    classificationActionError.value = ''

    try {
      if (classificationScope.value === 'group') {
        const result = await $fetch<{ folder: MailboxFolder, movedMessages: number }>(`/api/messages/${encodeURIComponent(message.id)}/group-folder`, {
          method: 'PATCH',
          body: { folder: classificationFolder.value },
        })
        showClassificationFeedback($t(result.movedMessages === 1 ? 'mail.groupMessagesMovedOne' : 'mail.groupMessagesMovedMany', { count: result.movedMessages, folder: mailboxByName(result.folder).label }))
      } else if (classificationScope.value === 'sender') {
        const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(message.id)}/sender-rule`, {
          method: 'PUT',
          body: { folder: classificationFolder.value },
        })
        showClassificationFeedback($t(result.affectedMessages === 1 ? 'mail.classificationDoneOne' : 'mail.classificationDoneMany', { count: result.affectedMessages, folder: mailboxByName(result.folder).label }), result.undoId)
      } else {
        const result = await $fetch<{ folder: MailboxFolder }>(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
          method: 'PATCH',
          body: { folder: classificationFolder.value },
        })
        showClassificationFeedback($t('mail.messageMovedKeepingSenderRule', { folder: mailboxByName(result.folder).label }))
      }

      classificationTarget.value = null
      options.closeMessage()
      try {
        await options.refreshMessages()
      } catch {
        classificationActionError.value = $t('mail.changeSavedReloadError')
      }
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null
      classificationError.value = data && typeof data === 'object' && 'statusMessage' in data
        ? String(data.statusMessage)
        : $t('mail.classificationError')
    } finally {
      isSavingClassification.value = false
    }
  }

  return {
    classificationTarget,
    classificationScope,
    classificationFolder,
    isSavingClassification,
    isUndoingClassification,
    undoClassificationId,
    classificationError,
    classificationFeedback,
    classificationActionError,
    openClassification,
    clearClassificationTarget,
    showClassificationFeedback,
    undoSenderRule,
    saveClassification,
  }
}
