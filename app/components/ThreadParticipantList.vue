<template>
  <div class="thread-participants-content">
    <p v-if="showHeading" class="thread-participants-heading">{{ $t('mail.threadParticipants') }}</p>
    <nav :aria-label="$t('mail.threadParticipants')">
      <NuxtLink v-for="participant in participants" :key="participant.address" class="thread-participant-link" :to="senderPath(participant.address)">
        <span class="thread-participant-avatar" :class="`avatar-${participant.color}`" aria-hidden="true">{{ participant.initials }}</span>
        <span class="thread-participant-copy"><strong>{{ participant.name }}</strong><span>{{ participant.address }}</span></span>
        <svg class="thread-participant-open" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 6.5 9.5" /><path d="M11 9v3.5H3.5V5H7" /></svg>
      </NuxtLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { senderPath } from '~/utils/mailbox-routing'

defineProps<{
  participants: { address: string, name: string, initials: string, color: 'terracotta' | 'blue' | 'green' | 'gold' }[]
  showHeading?: boolean
}>()

const { $t } = useI18n()
</script>
