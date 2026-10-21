<template>
  <main class="activity-page">
    <div class="activity-page-content">
      <header class="activity-page-header">
        <h1>{{ $t('activity.title') }}</h1>
        <p>{{ $t('activity.pageDescription') }}</p>
      </header>
      <section class="activity-page-card" :aria-label="$t('activity.title')">
        <form class="activity-page-search" role="search" @submit.prevent>
          <label class="sr-only" for="activity-search">{{ $t('activity.searchLabel') }}</label>
          <span class="i-tabler-search activity-page-search-icon" aria-hidden="true" />
          <input
            id="activity-search"
            v-model="searchInput"
            type="search"
            maxlength="100"
            :placeholder="$t('activity.searchPlaceholder')"
            :aria-label="$t('activity.searchLabel')"
          >
          <button
            v-if="searchInput"
            class="activity-page-search-clear"
            type="button"
            :aria-label="$t('activity.clearSearch')"
            @click="clearSearch"
          >
            <span class="i-tabler-x" aria-hidden="true" />
          </button>
        </form>
        <WorkspaceActivityList :limit="30" :query="searchQuery" :show-load-more="true" />
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'

const { $t } = useI18n()
const searchInput = ref('')
const searchQuery = ref('')
watch(searchInput, (value, _previous, onCleanup) => {
  const timeout = setTimeout(() => {
    searchQuery.value = value.trim()
  }, 220)
  onCleanup(() => clearTimeout(timeout))
})

function clearSearch() {
  searchInput.value = ''
}

useHead({ title: computed(() => $t('activity.title') + ' · Courrier') })
</script>
