<template>
  <MailViewThreadTrashDialog :thread-actions="threadActions" />
  <MailViewBulkTrashDialog :thread-actions="threadActions" :selected-thread-count="selectedThreadCount" />
  <MailViewClassificationDialog :classification="classification" :selected-thread="selectedThread" />
  <MailViewReplySendDialog :reply="reply" :reply-recipient="replyRecipient" />
  <MailViewThreadMergeDialog :active-folder="activeFolder" :thread-actions="threadActions" :selected-thread-count="selectedThreadCount" />
  <MailViewThreadSplitDialog :thread-actions="threadActions" />
</template>

<script setup lang="ts">
import MailViewBulkTrashDialog from '~/components/MailViewBulkTrashDialog.vue'
import MailViewClassificationDialog from '~/components/MailViewClassificationDialog.vue'
import MailViewReplySendDialog from '~/components/MailViewReplySendDialog.vue'
import MailViewThreadMergeDialog from '~/components/MailViewThreadMergeDialog.vue'
import MailViewThreadSplitDialog from '~/components/MailViewThreadSplitDialog.vue'
import MailViewThreadTrashDialog from '~/components/MailViewThreadTrashDialog.vue'
import type { useMailClassification } from '~/composables/useMailClassification'
import type { useMailReply } from '~/composables/useMailReply'
import type { useMailThreadActions } from '~/composables/useMailThreadActions'
import type { MailboxKey } from '~/utils/mailbox-routing'

defineProps<{
  activeFolder: MailboxKey
  classification: ReturnType<typeof useMailClassification>
  reply: ReturnType<typeof useMailReply>
  replyRecipient: string
  selectedThread?: { manualMergeIds: string[] }
  selectedThreadCount: number
  threadActions: ReturnType<typeof useMailThreadActions>
}>()
</script>
