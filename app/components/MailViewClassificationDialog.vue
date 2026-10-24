<template>
  <NDialog
    :open="Boolean(classificationTarget)"
    :title="$t('mail.classifyDialogTitle')"
    :description="classificationTarget ? `${classificationTarget.sender} — ${classificationTarget.address}` : undefined"
    :show-close="false"
    :_dialog-content="{ class: 'classification-dialog' }"
    @update:open="(open: boolean) => { if (!open && !isSavingClassification) classificationTarget = null }"
  >
    <template #content>
      <header class="dialog-header">
        <p class="dialog-kicker">{{ $t(classificationTarget?.folder === 'Screener' ? 'mail.newSender' : 'mail.classification') }}</p>
        <NDialogTitle class="dialog-title">{{ $t('mail.classifyDialogTitle') }}</NDialogTitle>
        <NDialogDescription class="sr-only">{{ $t('mail.chooseDestinationDescription') }}</NDialogDescription>
        <p class="dialog-sender">{{ classificationTarget?.sender }} <span>{{ classificationTarget?.address }}</span></p>
      </header>

      <fieldset class="classification-scope">
        <legend>{{ $t('mail.scope') }}</legend>
        <label v-if="selectedThread?.manualMergeIds.length" class="scope-option">
          <input v-model="classificationScope" type="radio" value="group">
          <span><strong>{{ $t('mail.thisConversation') }}</strong><small>{{ $t('mail.currentMessagesOnly') }}</small></span>
        </label>
        <label v-if="!selectedThread?.manualMergeIds.length" class="scope-option">
          <input v-model="classificationScope" type="radio" value="sender">
          <span><strong>{{ $t('mail.sender') }}</strong><small>{{ $t('mail.senderExistingAndFuture') }}</small></span>
        </label>
        <label v-if="!selectedThread?.manualMergeIds.length" class="scope-option">
          <input v-model="classificationScope" type="radio" value="message">
          <span><strong>{{ $t('mail.thisMessageOnly') }}</strong><small>{{ $t(classificationTarget?.hasSenderRule ? 'mail.futureFollowRule' : 'mail.othersRemainScreener') }}</small></span>
        </label>
        <p v-if="selectedThread?.manualMergeIds.length" class="classification-scope-note">{{ $t('mail.mergedClassificationWarning') }}</p>
      </fieldset>

      <fieldset class="classification-destinations">
        <legend>{{ $t('mail.folderDestination') }}</legend>
        <label v-for="folder in folders" :key="folder.name" class="destination-option" :class="{ 'is-picked': classificationFolder === folder.name }">
          <input v-model="classificationFolder" type="radio" :value="folder.name">
          <span><strong>{{ folder.label }}</strong><small>{{ folder.description }}</small></span>
        </label>
      </fieldset>

      <p v-if="classificationError" class="dialog-error" role="alert">{{ classificationError }}</p>
      <footer class="dialog-actions">
        <NDialogClose as-child>
          <button class="dialog-cancel" type="button" :disabled="isSavingClassification">{{ $t('mail.cancel') }}</button>
        </NDialogClose>
        <button class="dialog-save" type="button" :disabled="isSavingClassification" @click="saveClassification">
          {{ $t(isSavingClassification ? 'mail.classifying' : classificationScope === 'sender' ? 'mail.classifySender' : classificationScope === 'group' ? 'mail.moveConversation' : 'mail.moveMessage') }}
        </button>
      </footer>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import type { useMailClassification } from '~/composables/useMailClassification'
import { mailboxes } from '~/utils/mailbox-routing'

const props = defineProps<{
  classification: Pick<ReturnType<typeof useMailClassification>, 'classificationTarget' | 'classificationScope' | 'classificationFolder' | 'isSavingClassification' | 'classificationError' | 'saveClassification'>
  selectedThread?: { manualMergeIds: string[] }
}>()
const {
  classificationTarget,
  classificationScope,
  classificationFolder,
  isSavingClassification,
  classificationError,
  saveClassification,
} = props.classification
const selectedThread = props.selectedThread
const { $t } = useI18n()
const folders = mailboxes.filter(item => !['Screener', 'Trash', 'Set Aside', 'Reply Later'].includes(item.name))
</script>
