<template>
  <div class="workspace-activity-list">
    <p v-if="loadError" class="workspace-activity-error" role="alert">
      {{ loadError }}
      <button type="button" @click="loadFirstPage">{{ $t('activity.retry') }}</button>
    </p>

    <p v-else-if="loading && !items.length" class="workspace-activity-loading" role="status">
      {{ $t('activity.loading') }}
    </p>

    <p v-else-if="!items.length" class="workspace-activity-empty">
      {{ $t('activity.empty') }}
    </p>

    <ol v-else class="workspace-activity-items">
      <li v-for="item in items" :key="item.id" class="workspace-activity-item">
        <span class="workspace-activity-icon" :class="activityIcon(item)" aria-hidden="true" />
        <div class="workspace-activity-copy">
          <strong>{{ actionLabel(item) }}</strong>
          <NuxtLink
            v-if="item.targetHref"
            class="workspace-activity-target workspace-activity-target-link"
            :to="item.targetHref"
          >
            {{ item.targetLabel || $t('activity.unknownTarget') }}
          </NuxtLink>
          <span v-else class="workspace-activity-target">{{ item.targetLabel || $t('activity.unknownTarget') }}</span>
          <small>{{ $t('activity.byActor', { actor: item.actorLabel }) }} · {{ formatDate(item.createdAt) }}</small>
          <small v-if="undoErrorForId === item.id" class="workspace-activity-error" role="alert">{{ undoError }}</small>
        </div>
        <button
          v-if="item.canUndo"
          class="workspace-activity-undo"
          type="button"
          :disabled="undoingId === item.id"
          :aria-label="$t('activity.undoAction', { action: actionLabel(item), target: item.targetLabel || $t('activity.unknownTarget') })"
          @click="undo(item)"
        >
          {{ undoingId === item.id ? $t('activity.undoing') : $t('activity.undo') }}
        </button>
        <span v-else-if="item.undoneAt" class="workspace-activity-undone">{{ $t('activity.undone') }}</span>
      </li>
    </ol>

    <button
      v-if="showLoadMore && nextCursor && !loadError"
      class="workspace-activity-load-more"
      type="button"
      :disabled="loadingMore"
      @click="loadMore"
    >
      {{ loadingMore ? $t('activity.loading') : $t('activity.loadMore') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import type { WorkspaceActivity, WorkspaceActivityPage } from '~/composables/useWorkspaceActivity'
import {
  useActivityRefreshRevision,
  useLatestActivityPreview,
  useMailStateRefreshRevision,
} from '~/composables/useWorkspaceActivity'

const props = withDefaults(defineProps<{
  limit?: number
  showLoadMore?: boolean
}>(), {
  limit: 8,
  showLoadMore: false,
})

const { $t } = useI18n()
const { locale } = useI18nLocale()
const items = ref<WorkspaceActivity[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const loadError = ref('')
const undoError = ref('')
const undoErrorForId = ref('')
const undoingId = ref('')
const requestRevision = ref(0)
const activityRefreshRevision = useActivityRefreshRevision()
const mailStateRefreshRevision = useMailStateRefreshRevision()
const latestActivityPreview = useLatestActivityPreview()

watch(activityRefreshRevision, () => {
  void loadFirstPage()
})

onMounted(() => {
  void loadFirstPage()
})

function actionLabel(item: WorkspaceActivity) {
  if (item.actionType === 'thread.mark_unseen') return $t('activity.actions.markUnseen')
  return $t('activity.unknownAction')
}

function activityIcon(item: WorkspaceActivity) {
  if (item.actionType === 'thread.mark_unseen') return 'i-tabler-mail-down'
  return 'i-tabler-history'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(value))
}

async function loadFirstPage() {
  const revision = ++requestRevision.value
  loading.value = true
  loadError.value = ''
  nextCursor.value = null

  try {
    const result = await $fetch<WorkspaceActivityPage>('/api/activity', {
      query: { limit: props.limit },
    })
    if (revision !== requestRevision.value) return
    items.value = result.items
    nextCursor.value = result.nextCursor
    latestActivityPreview.value = result.items[0]
      ? {
          actionType: result.items[0].actionType,
          targetLabel: result.items[0].targetLabel,
          canUndo: result.items[0].canUndo,
        }
      : null
  } catch {
    if (revision === requestRevision.value) loadError.value = $t('activity.loadError')
  } finally {
    if (revision === requestRevision.value) loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  loadError.value = ''
  try {
    const result = await $fetch<WorkspaceActivityPage>('/api/activity', {
      query: { limit: props.limit, cursor: nextCursor.value },
    })
    items.value = [...items.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch {
    loadError.value = $t('activity.loadError')
  } finally {
    loadingMore.value = false
  }
}

async function undo(item: WorkspaceActivity) {
  if (undoingId.value) return
  undoingId.value = item.id
  undoErrorForId.value = ''
  undoError.value = ''
  try {
    await $fetch('/api/activity/' + encodeURIComponent(item.id) + '/undo', { method: 'POST' })
    mailStateRefreshRevision.value += 1
    activityRefreshRevision.value += 1
  } catch {
    undoErrorForId.value = item.id
    undoError.value = $t('activity.undoError')
    activityRefreshRevision.value += 1
  } finally {
    undoingId.value = ''
  }
}
</script>
