import type { MailboxKey } from '~/utils/mailbox-routing'

export type RecentMailThread = {
  folder: MailboxKey
  threadId: string
  sender: string
  subject: string
  snippet: string
  timestamp: string
}

const STORAGE_KEY = 'courrier-recent-mail-threads'
const STATE_KEY = 'courrier-recent-mail-threads'
const MAX_RECENT_THREADS = 8

export function useRecentMailThreads() {
  const threads = useState<RecentMailThread[]>(STATE_KEY, () => [])
  const initialized = useState(`${STATE_KEY}-initialized`, () => false)

  if (import.meta.client && !initialized.value) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown
      threads.value = Array.isArray(saved)
        ? saved.filter(isRecentMailThread).slice(0, MAX_RECENT_THREADS)
        : []
    } catch {
      threads.value = []
    }
    initialized.value = true
  }

  function remember(thread: RecentMailThread) {
    threads.value = [thread, ...threads.value.filter(item => item.threadId !== thread.threadId)].slice(0, MAX_RECENT_THREADS)
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.value))
      } catch {
        // Keep the in-memory recent list when browser storage is unavailable.
      }
    }
  }

  return { threads, remember }
}

function isRecentMailThread(value: unknown): value is RecentMailThread {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentMailThread>
  return typeof item.threadId === 'string'
    && typeof item.folder === 'string'
    && typeof item.sender === 'string'
    && typeof item.subject === 'string'
    && typeof item.snippet === 'string'
    && typeof item.timestamp === 'string'
}
