import { nextTick, ref, type ComputedRef } from 'vue'

type SelectableThread = {
  id: string
}

export function useMailThreadSelection(options: {
  threads: ComputedRef<SelectableThread[]>
  onSelectionChange: () => void
}) {
  const selecting = ref(false)
  const selectedIds = ref<string[]>([])
  const keyboardCursorId = ref('')
  const anchorId = ref('')

  function start(threadId: string) {
    options.onSelectionChange()
    selecting.value = true
    selectedIds.value = [threadId]
    anchorId.value = threadId
    keyboardCursorId.value = threadId
  }

  function toggle(threadId: string, event?: MouseEvent) {
    options.onSelectionChange()
    keyboardCursorId.value = threadId
    const orderedIds = options.threads.value.map(thread => thread.id)
    const anchorIndex = orderedIds.indexOf(anchorId.value)
    const targetIndex = orderedIds.indexOf(threadId)
    if (event?.shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
      const [startIndex, endIndex] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
      selectedIds.value = [...new Set([...selectedIds.value, ...orderedIds.slice(startIndex, endIndex + 1)])]
      return
    }
    if (selectedIds.value.includes(threadId)) {
      const remainingIds = selectedIds.value.filter(id => id !== threadId)
      if (!remainingIds.length) {
        clear()
        return
      }
      selectedIds.value = remainingIds
    } else {
      selectedIds.value = [...selectedIds.value, threadId]
    }
    anchorId.value = threadId
  }

  function clear() {
    selectedIds.value = []
    selecting.value = false
    keyboardCursorId.value = ''
    anchorId.value = ''
  }

  function moveCursor(direction: -1 | 1) {
    const threads = options.threads.value
    if (!threads.length) return
    const currentIndex = threads.findIndex(thread => thread.id === keyboardCursorId.value)
    const nextIndex = currentIndex < 0
      ? (direction === 1 ? 0 : threads.length - 1)
      : Math.max(0, Math.min(threads.length - 1, currentIndex + direction))
    const thread = threads[nextIndex]!
    keyboardCursorId.value = thread.id
    void nextTick(() => {
      const row = [...document.querySelectorAll<HTMLElement>('.thread-selection-row')]
        .find(element => element.dataset.threadSelectionId === thread.id)
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      row?.querySelector<HTMLButtonElement>('.thread-row')?.focus({ preventScroll: true })
    })
  }

  return {
    selecting,
    selectedIds,
    keyboardCursorId,
    start,
    toggle,
    clear,
    moveCursor,
  }
}
