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
          <template v-if="item.targetCount > 1">
            <button
              class="workspace-activity-target-toggle"
              type="button"
              :aria-expanded="isExpanded(item.id)"
              @click="toggleExpanded(item.id)"
            >
              <span>{{ isExpanded(item.id) ? $t('activity.hideTargets', { count: item.targetCount }) : $t('activity.showTargets', { count: item.targetCount }) }}</span>
              <span class="i-tabler-chevron-down" :class="{ 'is-expanded': isExpanded(item.id) }" aria-hidden="true" />
            </button>
          </template>
          <template v-else>
            <NuxtLink
              v-if="item.targets[0]?.targetHref"
              class="workspace-activity-target workspace-activity-target-link"
              :to="item.targets[0].targetHref"
            >
              {{ item.targets[0].targetLabel || $t('activity.unknownTarget') }}
            </NuxtLink>
            <span v-else class="workspace-activity-target">{{ item.targets[0]?.targetLabel || $t('activity.unknownTarget') }}</span>
          </template>
          <small>{{ $t('activity.byActor', { actor: item.actorLabel }) }} · {{ formatDate(item.createdAt) }}</small>
          <small v-if="item.partiallyUndone" class="workspace-activity-partial">{{ $t('activity.partiallyUndone') }}</small>
          <small v-if="undoErrorForId === item.id" class="workspace-activity-error" role="alert">{{ undoError }}</small>

          <Transition name="workspace-activity-group">
            <div v-if="item.targetCount > 1 && isExpanded(item.id)" class="workspace-activity-group">
              <ul class="workspace-activity-target-list">
                <li v-for="target in item.targets" :key="target.id" class="workspace-activity-target-item">
                  <NuxtLink
                    v-if="target.targetHref"
                    class="workspace-activity-target workspace-activity-target-link"
                    :to="target.targetHref"
                  >
                    {{ target.targetLabel || $t('activity.unknownTarget') }}
                  </NuxtLink>
                  <span v-else class="workspace-activity-target">{{ target.targetLabel || $t('activity.unknownTarget') }}</span>
                  <button
                    v-if="target.canUndo && !item.canUndo"
                    class="workspace-activity-undo workspace-activity-target-undo"
                    type="button"
                    :disabled="undoingId === target.id"
                    :aria-label="$t('activity.undoAction', { action: actionLabel(item), target: target.targetLabel || $t('activity.unknownTarget') })"
                    @click="undo(item, target)"
                  >
                    {{ undoingId === target.id ? $t('activity.undoing') : $t('activity.undo') }}
                  </button>
                  <NTooltip
                    v-else-if="target.undoneAt"
                    :content="$t('activity.undone')"
                    :una="{ tooltipContent: 'compose-tooltip-content z-[130]' }"
                  >
                    <span
                      class="workspace-activity-undone-icon i-tabler-clock-cancel"
                      role="img"
                      tabindex="0"
                      :aria-label="$t('activity.undone')"
                    />
                  </NTooltip>
                  <small v-if="undoErrorForId === target.id" class="workspace-activity-error" role="alert">{{ undoError }}</small>
                </li>
              </ul>
            </div>
          </Transition>
        </div>
        <button
          v-if="item.canUndo"
          class="workspace-activity-undo"
          type="button"
          :disabled="undoingId === item.id"
          :aria-label="$t('activity.undoBatchAction', { action: actionLabel(item), count: item.targetCount })"
          @click="undo(item)"
        >
          {{ undoingId === item.id ? $t('activity.undoing') : $t('activity.undo') }}
        </button>
        <button
          v-else-if="item.targetCount === 1 && item.targets[0]?.canUndo"
          class="workspace-activity-undo"
          type="button"
          :disabled="undoingId === item.targets[0].id"
          :aria-label="$t('activity.undoAction', { action: actionLabel(item), target: item.targets[0].targetLabel || $t('activity.unknownTarget') })"
          @click="undo(item, item.targets[0])"
        >
          {{ undoingId === item.targets[0].id ? $t('activity.undoing') : $t('activity.undo') }}
        </button>
        <NTooltip
          v-else-if="item.undoneAt"
          :content="$t('activity.undone')"
          :una="{ tooltipContent: 'compose-tooltip-content z-[130]' }"
        >
          <span
            class="workspace-activity-undone-icon i-tabler-clock-cancel"
            role="img"
            tabindex="0"
            :aria-label="$t('activity.undone')"
          />
        </NTooltip>
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
import type { WorkspaceActivity, WorkspaceActivityPage, WorkspaceActivityTarget } from '~/composables/useWorkspaceActivity'
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
const expandedGroups = ref<string[]>([])
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
  const plural = item.targetCount > 1 ? 'Many' : ''
  const keyByAction: Record<string, string> = {
    'thread.mark_seen': 'markSeen',
    'thread.mark_unseen': 'markUnseen',
    'thread.reply_later.added': 'replyLaterAdded',
    'thread.reply_later.removed': 'replyLaterRemoved',
    'thread.set_aside.added': 'setAsideAdded',
    'thread.set_aside.removed': 'setAsideRemoved',
    'thread.move.inbox': 'movedInbox',
    'thread.move.feed': 'movedFeed',
    'thread.move.paper': 'movedPaper',
    'thread.trashed': 'trashed',
  }
  const actionKey = keyByAction[item.actionType]
  return actionKey ? $t(`activity.actions.${actionKey}${plural}`, { count: item.targetCount }) : $t('activity.unknownAction')
}

function activityIcon(item: WorkspaceActivity) {
  if (item.actionType === 'thread.mark_unseen') return 'i-tabler-mail-down'
  if (item.actionType === 'thread.mark_seen') return 'i-tabler-mail-check'
  if (item.actionType.startsWith('thread.reply_later.')) return 'i-tabler-clock'
  if (item.actionType.startsWith('thread.set_aside.')) return 'i-tabler-inbox'
  if (item.actionType.startsWith('thread.move.')) return 'i-tabler-folder-symlink'
  if (item.actionType === 'thread.trashed') return 'i-tabler-trash'
  return 'i-tabler-history'
}

function isExpanded(id: string) {
  return expandedGroups.value.includes(id)
}

function toggleExpanded(id: string) {
  expandedGroups.value = isExpanded(id)
    ? expandedGroups.value.filter(groupId => groupId !== id)
    : [...expandedGroups.value, id]
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
          targetCount: result.items[0].targetCount,
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

async function undo(item: WorkspaceActivity, target?: WorkspaceActivityTarget) {
  if (undoingId.value) return
  const targetKey = target?.id ?? item.id
  undoingId.value = targetKey
  undoErrorForId.value = ''
  undoError.value = ''
  try {
    const path = item.batchId && !target
      ? `/api/activity/batches/${encodeURIComponent(item.batchId)}/undo`
      : `/api/activity/${encodeURIComponent(target?.id ?? item.id)}/undo`
    await $fetch(path, { method: 'POST' })
    mailStateRefreshRevision.value += 1
    activityRefreshRevision.value += 1
  } catch {
    undoErrorForId.value = targetKey
    undoError.value = $t('activity.undoError')
    activityRefreshRevision.value += 1
  } finally {
    undoingId.value = ''
  }
}
</script>
