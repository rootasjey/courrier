<template>
  <NDialog
    :open="splitDialogOpen"
    :title="$t('mail.splitTitle')"
    :description="$t('mail.splitDescription')"
    :_dialog-content="{ class: 'classification-dialog thread-merge-dialog' }"
    @update:open="(open: boolean) => { if (!isSplittingThread) splitDialogOpen = open }"
  >
    <template #content>
      <header class="dialog-header">
        <p class="dialog-kicker">{{ $t('mail.mergedConversation') }}</p>
        <NDialogTitle class="dialog-title">{{ $t('mail.splitTitle') }}</NDialogTitle>
        <NDialogDescription class="screener-confirm-copy">{{ $t('mail.splitDescription') }}</NDialogDescription>
      </header>
      <p v-if="threadMergeError" class="dialog-error" role="alert">{{ threadMergeError }}</p>
      <footer class="dialog-actions">
        <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="isSplittingThread">{{ $t('mail.cancel') }}</button></NDialogClose>
        <button class="dialog-save" type="button" :disabled="isSplittingThread" @click="splitSelectedThread">{{ isSplittingThread ? $t('mail.splitting') : $t('mail.splitThreads') }}</button>
      </footer>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import type { useMailThreadActions } from '~/composables/useMailThreadActions'

const props = defineProps<{
  threadActions: Pick<ReturnType<typeof useMailThreadActions>, 'splitDialogOpen' | 'isSplittingThread' | 'threadMergeError' | 'splitSelectedThread'>
}>()
const { splitDialogOpen, isSplittingThread, threadMergeError, splitSelectedThread } = props.threadActions
const { $t } = useI18n()
</script>
