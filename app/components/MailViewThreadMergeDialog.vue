<template>
  <NDialog
    :open="mergeDialogOpen"
    :title="$t('mail.mergeTitle')"
    :description="$t('mail.mergeDescription', { count: selectedThreadCount })"
    :_dialog-content="{ class: 'classification-dialog thread-merge-dialog' }"
    @update:open="(open: boolean) => { if (!isMergingThreads) mergeDialogOpen = open }"
  >
    <template #content>
      <header class="dialog-header">
        <p class="dialog-kicker">{{ mailboxByName(activeFolder).label }}</p>
        <NDialogTitle class="dialog-title">{{ $t('mail.mergeTitle') }}</NDialogTitle>
        <NDialogDescription class="screener-confirm-copy">{{ $t('mail.mergeDescriptionDetailed', { count: selectedThreadCount }) }}</NDialogDescription>
      </header>
      <p v-if="threadMergeError" class="dialog-error" role="alert">{{ threadMergeError }}</p>
      <footer class="dialog-actions">
        <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="isMergingThreads">{{ $t('mail.cancel') }}</button></NDialogClose>
        <button class="dialog-save" type="button" :disabled="isMergingThreads" @click="mergeSelectedThreads">{{ isMergingThreads ? $t('mail.merging') : $t('mail.mergeThreads') }}</button>
      </footer>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import type { useMailThreadActions } from '~/composables/useMailThreadActions'
import { mailboxByName, type MailboxKey } from '~/utils/mailbox-routing'

const props = defineProps<{
  activeFolder: MailboxKey
  selectedThreadCount: number
  threadActions: Pick<ReturnType<typeof useMailThreadActions>, 'mergeDialogOpen' | 'isMergingThreads' | 'threadMergeError' | 'mergeSelectedThreads'>
}>()
const { mergeDialogOpen, isMergingThreads, threadMergeError, mergeSelectedThreads } = props.threadActions
const { $t } = useI18n()
</script>
