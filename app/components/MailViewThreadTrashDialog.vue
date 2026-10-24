<template>
  <NDialog
    :open="threadTrashDialogOpen"
    :title="$t('palette.trashTitle')"
    :description="$t('palette.trashDescriptionOne')"
    :show-close="false"
    :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
    @update:open="(open: boolean) => { if (!isTrashingThread) threadTrashDialogOpen = open }"
  >
    <template #content>
      <header class="dialog-header">
        <NDialogTitle class="dialog-title">{{ $t('palette.trashTitle') }}</NDialogTitle>
        <NDialogDescription>{{ $t('palette.trashDescriptionOne') }}</NDialogDescription>
      </header>
      <p v-if="bulkActionError" class="action-feedback-error" role="alert">{{ bulkActionError }}</p>
      <div class="dialog-actions">
        <button class="dialog-cancel" type="button" :disabled="isTrashingThread" @click="threadTrashDialogOpen = false">{{ $t('palette.cancel') }}</button>
        <button class="dialog-danger" type="button" :disabled="isTrashingThread" @click="trashOpenThread">
          {{ isTrashingThread ? $t('palette.applying') : $t('palette.confirmTrash') }}
        </button>
      </div>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import type { useMailThreadActions } from '~/composables/useMailThreadActions'

const props = defineProps<{
  threadActions: Pick<ReturnType<typeof useMailThreadActions>, 'threadTrashDialogOpen' | 'isTrashingThread' | 'bulkActionError' | 'trashOpenThread'>
}>()
const { threadTrashDialogOpen, isTrashingThread, bulkActionError, trashOpenThread } = props.threadActions
const { $t } = useI18n()
</script>
