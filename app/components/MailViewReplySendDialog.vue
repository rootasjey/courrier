<template>
  <NDialog
    :open="sendConfirmOpen"
    :title="$t('mail.sendReplyTitle')"
    :description="$t('mail.verifyRecipient')"
    :_dialog-content="{ class: 'classification-dialog reply-confirm-dialog' }"
    @update:open="(open: boolean) => { sendConfirmOpen = open }"
  >
    <template #content>
      <header class="dialog-header">
        <p class="dialog-kicker">{{ $t('mail.sendCheck') }}</p>
        <NDialogTitle class="dialog-title">{{ $t('mail.sendReplyTitle') }}</NDialogTitle>
        <NDialogDescription class="screener-confirm-copy">{{ $t('mail.replyWillSend', { recipient: replyRecipient }) }}</NDialogDescription>
      </header>
      <footer class="dialog-actions">
        <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="sending">{{ $t('mail.continueWriting') }}</button></NDialogClose>
        <button class="dialog-save" type="button" :disabled="sending" @click="send">{{ sending ? $t('mail.sending') : $t('composer.confirmSend') }}</button>
      </footer>
    </template>
  </NDialog>
</template>

<script setup lang="ts">
import type { useMailReply } from '~/composables/useMailReply'

const props = defineProps<{
  reply: Pick<ReturnType<typeof useMailReply>, 'sendConfirmOpen' | 'sending' | 'send'>
  replyRecipient: string
}>()
const { sendConfirmOpen, sending, send } = props.reply
const replyRecipient = props.replyRecipient
const { $t } = useI18n()
</script>
