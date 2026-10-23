import { computed, onBeforeUnmount, ref, watch, type ComputedRef } from 'vue'
import type { MailboxKey } from '~/utils/mailbox-routing'

type StoredFolder = Exclude<MailboxKey, 'Set Aside' | 'Reply Later'>

export type SearchHit = {
  id: string
  folder: StoredFolder
  threadId: string
  snippet: string
}

export function useMailViewSearch(search: ComputedRef<string>, activeFolder: ComputedRef<MailboxKey>) {
  const { $t } = useI18n()
  const isGlobalSearch = computed(() => Boolean(search.value.trim()) && activeFolder.value !== 'Screener' && activeFolder.value !== 'Trash')
  const searchResults = ref<SearchHit[]>([])
  const searchTotal = ref(0)
  const searchOffset = ref(0)
  const searchHasMore = ref(false)
  const searchLoading = ref(Boolean(isGlobalSearch.value))
  const searchError = ref('')
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let searchRevision = 0

  async function loadSearchPage(reset = false) {
    if (!isGlobalSearch.value) return

    if (reset) {
      searchResults.value = []
      searchOffset.value = 0
    }

    const offset = reset ? 0 : searchOffset.value
    const revision = ++searchRevision
    searchLoading.value = true
    searchError.value = ''

    try {
      const response = await $fetch<{
        results: SearchHit[]
        total: number
        hasMore: boolean
        nextOffset: number | null
      }>('/api/search', {
        query: { q: search.value.trim(), offset },
      })

      if (revision !== searchRevision) return

      if (reset) searchResults.value = response.results
      else {
        const knownIds = new Set(searchResults.value.map(result => result.id))
        searchResults.value = [...searchResults.value, ...response.results.filter(result => !knownIds.has(result.id))]
      }
      searchTotal.value = response.total
      searchHasMore.value = response.hasMore
      searchOffset.value = response.nextOffset ?? offset + response.results.length
    } catch {
      if (revision === searchRevision) searchError.value = $t('mail.searchError')
    } finally {
      if (revision === searchRevision) searchLoading.value = false
    }
  }

  function loadMoreSearchResults() {
    if (searchHasMore.value && !searchLoading.value) void loadSearchPage()
  }

  watch([search, activeFolder], () => {
    if (!import.meta.client) return
    searchRevision += 1
    if (searchTimer) clearTimeout(searchTimer)
    searchResults.value = []
    searchTotal.value = 0
    searchOffset.value = 0
    searchHasMore.value = false
    searchError.value = ''

    if (!isGlobalSearch.value) {
      searchLoading.value = false
      return
    }

    searchLoading.value = true
    searchTimer = setTimeout(() => { void loadSearchPage(true) }, 240)
  }, { immediate: true })

  onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer)
    searchRevision += 1
  })

  return {
    isGlobalSearch,
    loadMoreSearchResults,
    searchError,
    searchHasMore,
    searchLoading,
    searchResults,
    searchTotal,
  }
}
