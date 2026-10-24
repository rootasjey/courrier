<template>
  <NDialog
    :open="bulkTrashDialogOpen"
    :title="$t('palette.trashTitle')"
    :description="$t(selectedThreadCount === 1 ? 'palette.trashDescriptionOne' : 'palette.trashDescriptionMany', { count: selectedThreadCount })"
    :show-close="false"
    :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
    @update:open="(open: boolean) => { if (!isApplyingBulkAction) bulkTrashDialogOpen = open }"
  >
    <template #content>
      <header class="dialog-header">
        <NDialogTitle class="dialog-title">{{ $t('palette.trashTitle') }}</NDialogTitle>
        <NDialogDescription>{{ $t(selectedThreadCount === 1 ? 'palette.trashDescriptionOne' : 'palette.trashDescriptionMany', { count: selectedThreadCount }) }}</NDialogDescription>
      </header>
      <p v-if="bulkActionError" class="action-feedback-error" role="alert">{{ bulkActionError }}</p>
      <div class="dialog-actions">
        <button class="dialog-cancel" type="button" :disabled="isApplyingBulkAction" @click="bulkTrashDialogOpen = false">{{ $t('palette.cancel') }}</button>
        <button class="dialog-danger" type="button" :disabled="isApplyingBulkAction" @click="applyBulkAction('trash')">
          {{ isApplyingBulkAction ? $t('palette.applying') : $t('palette.confirmTrash') }}
        </button>
      </div>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import type { useMailThreadActions } from '~/composables/useMailThreadActions'

const props = defineProps<{
  threadActions: Pick<ReturnType<typeof useMailThreadActions>, 'bulkTrashDialogOpen' | 'isApplyingBulkAction' | 'bulkActionError' | 'applyBulkAction'>
  selectedThreadCount: number
}>()
const { bulkTrashDialogOpen, isApplyingBulkAction, bulkActionError, applyBulkAction } = props.threadActions
const { $t } = useI18n()
</script>
