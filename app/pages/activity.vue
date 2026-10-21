<template>
  <main class="activity-page">
    <div class="activity-page-content">
      <header class="activity-page-header">
        <h1>{{ $t('activity.title') }}</h1>
        <p>{{ $t('activity.pageDescription') }}</p>
      </header>
      <section class="activity-page-card" :aria-label="$t('activity.title')">
        <WorkspaceActivityList :limit="30" :show-load-more="true" />
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'

const { $t } = useI18n()
useHead({ title: computed(() => $t('activity.title') + ' · Courrier') })
</script>
