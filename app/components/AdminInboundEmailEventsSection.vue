<template>
  <section class="admin-section" aria-labelledby="admin-inbound-email-events-heading">
    <h2 id="admin-inbound-email-events-heading">{{ $t('admin.inboundEmailEvents') }}</h2>
    <p class="admin-section-description">{{ $t('admin.inboundEmailEventsDescription') }}</p>
    <p v-if="truncated" class="admin-access-notice" role="status">{{ $t('admin.inboundEmailEventsTruncated') }}</p>

    <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ $t('admin.date') }}</th>
            <th>{{ $t('admin.sender') }}</th>
            <th>{{ $t('admin.mailbox') }}</th>
            <th>{{ $t('admin.eventOutcome') }}</th>
            <th>{{ $t('admin.eventReason') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id">
            <td>{{ formatDate(event.created_at) }}</td>
            <td>{{ event.sender_address || '—' }}</td>
            <td>{{ event.recipient_address || '—' }}</td>
            <td>{{ $t(`admin.inboundEventTypes.${event.event_type}`) }}</td>
            <td>{{ $t(`admin.inboundEventReasons.${event.reason_code}`) }}</td>
          </tr>
          <tr v-if="!events.length"><td colspan="5" class="admin-empty">{{ $t('admin.noInboundEmailEvents') }}</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
type InboundEmailEvent = {
  id: string
  event_type: 'rejected' | 'degraded' | 'failed'
  reason_code: 'sender_blocked' | 'mailbox_unconfigured' | 'mail_storage_unavailable' | 'processing_failed'
  sender_address: string
  recipient_address: string
  created_at: string
}

defineProps<{
  events: InboundEmailEvent[]
  truncated: boolean
  formatDate: (value: string) => string
}>()

const { $t } = useI18n()
</script>
