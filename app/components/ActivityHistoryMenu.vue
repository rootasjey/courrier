<template>
  <NPopover
    :open="open"
    :modal="false"
    :_popover-content="{ side: 'bottom', align: 'end', sideOffset: 12, avoidCollisions: true, 'aria-label': $t('activity.title') }"
    :una="{ popoverContent: 'activity-menu-panel topbar-popover-surface z-[120]' }"
    @update:open="handleOpenChange"
  >
    <template #trigger>
      <button
        class="activity-trigger"
        type="button"
        :aria-label="tooltipLabel"
        aria-haspopup="dialog"
        :aria-expanded="open"
      >
        <NTooltip :content="tooltipLabel" :una="{ tooltipContent: 'compose-tooltip-content z-[130]' }">
          <span class="activity-trigger-icon" :class="latestActivityIcon" aria-hidden="true" />
        </NTooltip>
        <span v-if="latestActivityPreview?.canUndo" class="activity-trigger-indicator" aria-hidden="true" />
      </button>
    </template>
    <template #default>
      <section class="activity-menu-content">
        <header class="activity-menu-header">
          <div>
            <h2>{{ $t('activity.title') }}</h2>
            <p>{{ $t('activity.retention') }}</p>
          </div>
        </header>
        <WorkspaceActivityList :limit="8" />
        <NuxtLink class="activity-menu-all" to="/activity" @click="open = false">
          {{ $t('activity.viewAll') }}
          <span class="i-tabler-arrow-up-right" aria-hidden="true" />
        </NuxtLink>
      </section>
    </template>
  </NPopover>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import type { WorkspaceActivityPage } from '~/composables/useWorkspaceActivity'
import {
  useActivityRefreshRevision,
  useLatestActivityPreview,
} from '~/composables/useWorkspaceActivity'

const { $t } = useI18n()
const open = ref(false)
const activityRefreshRevision = useActivityRefreshRevision()
const latestActivityPreview = useLatestActivityPreview()
const latestActivityIcon = computed(() => latestActivityPreview.value?.actionType === 'thread.mark_unseen'
  ? 'i-tabler-mail-down'
  : 'i-tabler-history')
const tooltipLabel = computed(() => {
  if (!latestActivityPreview.value) return $t('activity.open')
  const action = latestActivityPreview.value.actionType === 'thread.mark_unseen'
    ? $t('activity.actions.markUnseen')
    : $t('activity.unknownAction')
  return action + ' · ' + (latestActivityPreview.value.targetLabel || $t('activity.unknownTarget'))
})

function handleOpenChange(value: boolean) {
  open.value = value
  if (!value) return
  activityRefreshRevision.value += 1
}

async function loadLatestActivity() {
  try {
    const result = await $fetch<WorkspaceActivityPage>('/api/activity', { query: { limit: 1 } })
    latestActivityPreview.value = result.items[0]
      ? {
          actionType: result.items[0].actionType,
          targetLabel: result.items[0].targetLabel,
          canUndo: result.items[0].canUndo,
        }
      : null
  } catch {
    latestActivityPreview.value = null
  }
}

watch(activityRefreshRevision, () => {
  void loadLatestActivity()
})

onMounted(() => {
  void loadLatestActivity()
})
</script>
