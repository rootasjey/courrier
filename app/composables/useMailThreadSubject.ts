import { nextTick, onBeforeUnmount, onMounted, ref, type ComputedRef } from 'vue'

type SubjectMessage = {
  threadSubject: string | null
  subject: string
}

type SubjectThread = {
  id: string
  messages: SubjectMessage[]
  subject: string
}

export function useMailThreadSubject(options: {
  selectedThread: ComputedRef<SubjectThread | undefined>
  chronologicalMessages: ComputedRef<SubjectMessage[]>
  refreshMessages: () => Promise<unknown>
}) {
  const { $t } = useI18n()
  const isEditing = ref(false)
  const draft = ref('')
  const saveError = ref('')
  const isSaving = ref(false)
  const input = ref<HTMLInputElement | null>(null)
  const heading = ref<HTMLElement | null>(null)
  const selection = ref({ visible: false, left: 0, top: 0 })
  const contextMenu = ref({ open: false, left: 0, top: 0 })

  function resetEditor() {
    isEditing.value = false
    saveError.value = ''
  }

  function beginEdit() {
    const thread = options.selectedThread.value
    if (!thread) return
    selection.value.visible = false
    contextMenu.value.open = false
    draft.value = thread.messages.find(message => message.threadSubject)?.threadSubject
      || options.chronologicalMessages.value[0]?.subject
      || thread.subject
    saveError.value = ''
    isEditing.value = true
    void nextTick(() => input.value?.focus())
  }

  function updateSelection() {
    const subjectHeading = heading.value
    const currentSelection = window.getSelection()
    if (!subjectHeading || !currentSelection || currentSelection.isCollapsed || !currentSelection.toString().trim()
      || !subjectHeading.contains(currentSelection.anchorNode) || !subjectHeading.contains(currentSelection.focusNode)) {
      selection.value.visible = false
      return
    }

    const rect = currentSelection.getRangeAt(0).getBoundingClientRect()
    selection.value = {
      visible: rect.width > 0 && rect.height > 0,
      left: Math.max(12, Math.min(window.innerWidth - 46, rect.right - 12)),
      top: Math.max(12, rect.top - 44),
    }
  }

  function openContextMenu(event: MouseEvent) {
    // Ctrl-right-click deliberately keeps the browser's own context menu available.
    if (event.ctrlKey) return
    event.preventDefault()
    selection.value.visible = false
    contextMenu.value = {
      open: true,
      left: Math.max(12, Math.min(window.innerWidth - 228, event.clientX)),
      top: Math.max(12, Math.min(window.innerHeight - 54, event.clientY)),
    }
  }

  function closeContextMenu(event: PointerEvent) {
    if (!(event.target instanceof Element) || !event.target.closest('.thread-subject-context-menu')) {
      contextMenu.value.open = false
    }
  }

  function closeContextMenuOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !contextMenu.value.open) return
    event.preventDefault()
    contextMenu.value.open = false
  }

  function cancelEdit() {
    if (isSaving.value) return
    isEditing.value = false
    saveError.value = ''
  }

  async function save() {
    const thread = options.selectedThread.value
    if (!thread || isSaving.value) return

    const subject = draft.value.trim()
    if (subject.length > 200) {
      saveError.value = $t('rename.tooLong')
      return
    }

    isSaving.value = true
    saveError.value = ''
    try {
      await $fetch(`/api/threads/${encodeURIComponent(thread.id)}/subject`, {
        method: 'PATCH',
        body: { subject: subject || null },
      })
      await options.refreshMessages()
      isEditing.value = false
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : $t('rename.error')
    } finally {
      isSaving.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('pointerdown', closeContextMenu)
    window.addEventListener('keydown', closeContextMenuOnEscape)
    document.addEventListener('selectionchange', updateSelection)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', closeContextMenu)
    window.removeEventListener('keydown', closeContextMenuOnEscape)
    document.removeEventListener('selectionchange', updateSelection)
  })

  return {
    isEditing,
    draft,
    saveError,
    isSaving,
    input,
    heading,
    selection,
    contextMenu,
    resetEditor,
    beginEdit,
    updateSelection,
    openContextMenu,
    cancelEdit,
    save,
  }
}
