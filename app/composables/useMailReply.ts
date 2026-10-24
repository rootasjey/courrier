import { ref, watch, type ComputedRef } from 'vue'

type ReplyableMessage = {
  id: string
}

type ReplyDraft = {
  id: string
  to: string
  subject: string
  textBody: string
  status: 'draft' | 'sending'
}

type SentReply = {
  id: string
  folder: string
}

export function useMailReply(options: {
  activeMessage: ComputedRef<ReplyableMessage | undefined>
  translate: (key: string) => string
  afterSend: (sent: SentReply) => Promise<void>
}) {
  const composerOpen = ref(false)
  const sendConfirmOpen = ref(false)
  const body = ref('')
  const error = ref('')
  const loading = ref(false)
  const draftTargetId = ref('')
  const draftStatus = ref<'draft' | 'sending'>('draft')
  const saving = ref(false)
  const sending = ref(false)
  const saved = ref(false)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let saveRevision = 0

  watch(body, () => {
    if (!composerOpen.value || loading.value || draftStatus.value === 'sending') return
    saveRevision += 1
    if (saveTimer) clearTimeout(saveTimer)
    saved.value = false
    saveTimer = setTimeout(() => { void saveDraft() }, 650)
  })

  async function openComposer() {
    const message = options.activeMessage.value
    if (!message || loading.value) return
    error.value = ''
    saved.value = false
    body.value = ''
    draftStatus.value = 'draft'
    draftTargetId.value = message.id
    composerOpen.value = true
    loading.value = true
    try {
      const draft = await $fetch<ReplyDraft | null>(`/api/messages/${encodeURIComponent(message.id)}/draft`)
      body.value = draft?.textBody ?? ''
      draftStatus.value = draft?.status ?? 'draft'
      saved.value = Boolean(draft)
    } catch {
      error.value = options.translate('mail.replyLoadError')
    } finally {
      loading.value = false
    }
  }

  async function saveDraft() {
    const messageId = draftTargetId.value
    if (!messageId || draftStatus.value === 'sending' || saving.value) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }

    saving.value = true
    error.value = ''
    const revision = saveRevision
    const textBody = body.value
    try {
      const draft = await $fetch<{ status: 'draft' | 'sending' }>(`/api/messages/${encodeURIComponent(messageId)}/draft`, {
        method: 'PUT',
        body: { textBody },
      })
      draftStatus.value = draft.status
      saved.value = true
    } catch {
      saved.value = false
      error.value = options.translate('mail.replySaveError')
    } finally {
      saving.value = false
      if (revision !== saveRevision && draftStatus.value !== 'sending') void saveDraft()
    }
  }

  async function requestSend() {
    if (!body.value.trim() || sending.value) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
    await saveDraft()
    while (saving.value) await new Promise(resolve => setTimeout(resolve, 25))
    if (!saved.value || error.value) return
    sendConfirmOpen.value = true
  }

  async function send() {
    const messageId = draftTargetId.value
    if (!messageId || sending.value) return
    sending.value = true
    error.value = ''
    let sent: SentReply | undefined
    try {
      sent = await $fetch<SentReply>(`/api/messages/${encodeURIComponent(messageId)}/send`, { method: 'POST' })
      sendConfirmOpen.value = false
      composerOpen.value = false
    } catch (sendError) {
      sendConfirmOpen.value = false
      const data = sendError && typeof sendError === 'object' && 'data' in sendError ? sendError.data : null
      error.value = data && typeof data === 'object' && 'statusMessage' in data
        ? String(data.statusMessage)
        : options.translate('mail.replySendError')
      if (error.value.includes('état est incertain') || error.value.includes('accepté par Cloudflare')) {
        draftStatus.value = 'sending'
      }
    } finally {
      sending.value = false
    }
    if (!sent) return

    try {
      await options.afterSend(sent)
    } catch {
      error.value = options.translate('mail.replySentReloadError')
    }
  }

  return {
    composerOpen,
    sendConfirmOpen,
    body,
    error,
    loading,
    draftTargetId,
    draftStatus,
    saving,
    sending,
    saved,
    openComposer,
    saveDraft,
    requestSend,
    send,
  }
}
