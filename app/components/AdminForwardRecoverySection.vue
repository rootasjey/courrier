<template>
  <section class="admin-section" aria-labelledby="admin-forward-recovery-heading">
    <h2 id="admin-forward-recovery-heading">{{ $t('admin.forwardRecovery') }}</h2>
    <p class="admin-section-description">{{ $t('admin.forwardRecoveryDescription') }}</p>
    <p v-if="error" class="admin-access-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="admin-access-notice" role="status">{{ notice }}</p>
    <p v-if="loadMoreError" class="admin-access-error" role="alert">{{ loadMoreError }}</p>

    <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ $t('admin.subject') }}</th>
            <th>{{ $t('admin.sender') }}</th>
            <th>{{ $t('admin.mailbox') }}</th>
            <th>{{ $t('admin.forwardDestination') }}</th>
            <th>{{ $t('admin.status') }}</th>
            <th>{{ $t('admin.attempts') }}</th>
            <th>{{ $t('admin.receivedAt') }}</th>
            <th>{{ $t('admin.action') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="delivery in deliveries" :key="delivery.id">
            <td><strong>{{ delivery.subject || $t('admin.noSubject') }}</strong><small v-if="delivery.last_error">{{ delivery.last_error }}</small></td>
            <td>{{ delivery.sender_address || '—' }}</td>
            <td>{{ delivery.mailbox_address || '—' }}</td>
            <td>{{ delivery.destination || '—' }}</td>
            <td><span class="admin-status" :class="`is-${delivery.status}`">{{ delivery.status === 'failed' ? $t('admin.failed') : $t('admin.staleProcessing') }}</span></td>
            <td>{{ delivery.attempt_count }}</td>
            <td>{{ formatDate(delivery.received_at) }}</td>
            <td><button class="admin-membership-action is-reactivate" type="button" :disabled="busy" @click="selectedDelivery = delivery">{{ $t('admin.replayCopy') }}</button></td>
          </tr>
          <tr v-if="!deliveries.length"><td colspan="8" class="admin-empty">{{ $t('admin.noForwardRecovery') }}</td></tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="hasMore"
      class="admin-membership-action is-reactivate"
      type="button"
      :disabled="loadingMore"
      @click="emit('loadMore')"
    >
      {{ loadingMore ? $t('admin.loadingMoreForwards') : $t('admin.loadMoreForwards') }}
    </button>

    <NDialog
      :open="Boolean(selectedDelivery)"
      :title="$t('admin.replayCopy')"
      :description="$t('admin.replayCopyDescription', { subject: selectedDelivery?.subject || $t('admin.noSubject'), destination: selectedDelivery?.destination || '—' })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!open && !busy) selectedDelivery = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('admin.replayCopy') }}</NDialogTitle>
          <NDialogDescription>{{ $t('admin.replayCopyDescription', { subject: selectedDelivery?.subject || $t('admin.noSubject'), destination: selectedDelivery?.destination || '—' }) }}</NDialogDescription>
        </header>
        <p class="admin-section-description">{{ $t('admin.replayCopyWarning', { mailbox: selectedDelivery?.mailbox_address || '—', destination: selectedDelivery?.destination || '—' }) }}</p>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="busy" @click="selectedDelivery = null">{{ $t('common.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="busy" @click="replayDelivery">
            {{ busy ? $t('admin.replayingCopy') : $t('admin.confirmReplayCopy') }}
          </button>
        </div>
      </template>
    </NDialog>
  </section>
</template>

<script setup lang="ts">
type ForwardDelivery = {
  id: string
  status: 'processing' | 'failed'
  attempt_count: number
  last_error: string | null
  subject: string
  sender_address: string
  mailbox_address: string
  destination: string
  received_at: string
}
type AdminRequest = <T>(request: string, options?: Parameters<typeof $fetch>[1]) => Promise<T>

const props = defineProps<{
  deliveries: ForwardDelivery[]
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: string
  adminFetch: AdminRequest
  formatDate: (value: string) => string
}>()
const emit = defineEmits<{ refresh: [], loadMore: [] }>()
const { $t } = useI18n()
const selectedDelivery = ref<ForwardDelivery | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')

function statusCode(value: unknown) {
  if (!value || typeof value !== 'object') return 0
  const failure = value as { statusCode?: number, status?: number, response?: { status?: number } }
  return Number(failure.statusCode || failure.status || failure.response?.status || 0)
}

async function replayDelivery() {
  const delivery = selectedDelivery.value
  if (busy.value || !delivery) return

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await props.adminFetch<{ accepted: boolean }>(`/api/admin/legacy-forward-deliveries/${encodeURIComponent(delivery.id)}/replay`, { method: 'POST' })
    if (!result.accepted) throw new Error('REPLAY_NOT_ACCEPTED')
    selectedDelivery.value = null
    notice.value = $t('admin.replayCopyAccepted')
    emit('refresh')
  } catch (failure) {
    error.value = statusCode(failure) === 409 ? $t('admin.forwardRecoveryChanged') : $t('admin.replayCopyError')
  } finally {
    busy.value = false
  }
}
</script>
