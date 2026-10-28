<template>
  <section class="admin-section" aria-labelledby="admin-blocked-senders-heading">
    <h2 id="admin-blocked-senders-heading">{{ $t('admin.blockedSenders') }}</h2>
    <p class="admin-section-description">{{ $t('admin.blockedSendersDescription') }}</p>
    <p v-if="error" class="admin-access-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="admin-access-notice" role="status">{{ notice }}</p>
    <p v-if="truncated" class="admin-access-notice" role="status">{{ $t('admin.blockedSendersTruncated') }}</p>

    <div class="admin-table-wrap">
      <table>
        <thead><tr><th>{{ $t('admin.sender') }}</th><th>{{ $t('admin.domain') }}</th><th>{{ $t('admin.workspace') }}</th><th>{{ $t('admin.blockedBy') }}</th><th>{{ $t('admin.blockedSince') }}</th><th>{{ $t('admin.action') }}</th></tr></thead>
        <tbody>
          <tr v-for="sender in senders" :key="`${sender.mailbox_domain}:${sender.sender_address}`">
            <td><strong>{{ sender.sender_address }}</strong></td>
            <td>{{ sender.mailbox_domain }}</td>
            <td>{{ sender.workspace_name || '—' }}</td>
            <td>{{ sender.blocked_by_email || $t('admin.unknownBlocker') }}</td>
            <td>{{ formatDate(sender.created_at) }}</td>
            <td><button class="admin-membership-action is-reactivate" type="button" :disabled="busy" @click="selectedSender = sender">{{ $t('admin.unblockSender') }}</button></td>
          </tr>
          <tr v-if="!senders.length"><td colspan="6" class="admin-empty">{{ $t('admin.noBlockedSenders') }}</td></tr>
        </tbody>
      </table>
    </div>

    <NDialog
      :open="Boolean(selectedSender)"
      :title="$t('admin.unblockSender')"
      :description="$t('admin.unblockSenderDescription', { sender: selectedSender?.sender_address || '', domain: selectedSender?.mailbox_domain || '' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !busy) selectedSender = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.unblockSender') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.unblockSenderDescription', { sender: selectedSender?.sender_address || '', domain: selectedSender?.mailbox_domain || '' }) }}</NDialogDescription>
        </header>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="busy" @click="selectedSender = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="busy" @click="unblockSender">
            {{ busy ? $t('admin.unblockingSender') : $t('admin.unblockSender') }}
          </button>
        </div>
      </template>
    </NDialog>
  </section>
</template>

<script setup lang="ts">
type BlockedSender = {
  mailbox_domain: string
  sender_address: string
  created_at: string
  created_by_user_id: string | null
  blocked_by_email: string | null
  workspace_id: string | null
  workspace_name: string | null
}
type AdminRequest = <T>(request: string, options?: Parameters<typeof $fetch>[1]) => Promise<T>

const props = defineProps<{
  senders: BlockedSender[]
  truncated: boolean
  adminFetch: AdminRequest
  formatDate: (value: string) => string
}>()
const emit = defineEmits<{ refresh: [] }>()
const { $t } = useI18n()

const selectedSender = ref<BlockedSender | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')

function statusCode(value: unknown) {
  if (!value || typeof value !== 'object') return 0
  const error = value as { statusCode?: number, status?: number, response?: { status?: number } }
  return Number(error.statusCode || error.status || error.response?.status || 0)
}

async function unblockSender() {
  const sender = selectedSender.value
  if (busy.value || !sender) return

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await props.adminFetch<{ removed: boolean }>('/api/admin/blocked-senders/unblock', {
      method: 'POST',
      body: { mailboxDomain: sender.mailbox_domain, senderAddress: sender.sender_address },
    })
    if (!result.removed) {
      error.value = $t('admin.blockedSenderChanged')
      return
    }
    selectedSender.value = null
    notice.value = $t('admin.senderUnblockedNotice', { sender: sender.sender_address, domain: sender.mailbox_domain })
    emit('refresh')
  } catch (failure) {
    error.value = $t(statusCode(failure) === 404 ? 'admin.blockedSenderChanged' : 'admin.unblockSenderError')
  } finally {
    busy.value = false
  }
}
</script>
