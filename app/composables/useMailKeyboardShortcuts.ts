import { onBeforeUnmount, onMounted } from 'vue'

type KeyboardShortcutHandler = (event: KeyboardEvent) => boolean

/** Registers one page-level listener. A handler returns true when it consumes or reserves the event. */
export function useMailKeyboardShortcuts(handlers: KeyboardShortcutHandler[]) {
  function dispatch(event: KeyboardEvent) {
    if (event.defaultPrevented) return

    for (const handleShortcut of handlers) {
      if (handleShortcut(event)) return
    }
  }

  onMounted(() => window.addEventListener('keydown', dispatch))
  onBeforeUnmount(() => window.removeEventListener('keydown', dispatch))
}
