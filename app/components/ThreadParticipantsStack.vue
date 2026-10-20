<template>
  <NuxtLink
    v-if="participants.length === 1"
    :class="['thread-participants-trigger', 'thread-participants-single', { 'thread-participants-inline': inline }]"
    :to="senderPath(participants[0]!.address)"
    :aria-label="$t('mail.openContactPage', { name: participants[0]!.name })"
  >
    <span class="thread-participant-avatar" :class="`avatar-${participants[0]!.color}`" aria-hidden="true">{{ participants[0]!.initials }}</span>
  </NuxtLink>

  <template v-else-if="participants.length > 1">
    <NPopover
      :open="open"
      :modal="false"
      :_popover-content="{ side: 'bottom', align: 'end', sideOffset: 8, avoidCollisions: true, 'aria-label': $t('mail.threadParticipants') }"
      :una="{ popoverContent: 'thread-participants-popover z-[120]' }"
      @update:open="open = $event"
    >
      <template #trigger>
        <button :class="['thread-participants-trigger', { 'thread-participants-inline': inline, 'thread-participants-desktop-trigger': mobileDrawer }]" type="button" :aria-label="$t('mail.showParticipants', { count: participants.length })" :aria-expanded="open">
          <span v-for="(participant, index) in visibleParticipants" :key="participant.address" class="thread-participant-avatar" :class="[`avatar-${participant.color}`, { 'is-overflow': index === 2 && participants.length > 3 }]" :style="{ zIndex: index + 1 }" aria-hidden="true">
            {{ index === 2 && participants.length > 3 ? `+${participants.length - 2}` : participant.initials }}
          </span>
        </button>
      </template>
      <template #default>
        <ParticipantList :participants="participants" :show-heading="true" />
      </template>
    </NPopover>

    <NDrawer
      v-if="mobileDrawer"
      :title="$t('mail.threadParticipants')"
      :description="$t('mail.participantsDrawerDescription')"
      direction="bottom"
      :modal="true"
      :dismissible="true"
      :should-scale-background="false"
      :una="{ drawerContent: 'mail-mobile-drawer-content z-[120]', drawerOverlay: 'mail-mobile-drawer-overlay z-[119]', drawerHeader: 'mail-mobile-drawer-header', drawerTitle: 'mail-mobile-drawer-title', drawerDescription: 'mail-mobile-drawer-description', drawerFooter: 'mail-mobile-drawer-footer' }"
    >
      <template #trigger="{ open: drawerOpen }">
        <button class="thread-participants-trigger thread-participants-mobile-trigger" type="button" :aria-label="$t('mail.showParticipants', { count: participants.length })" :aria-expanded="drawerOpen">
          <span v-for="(participant, index) in visibleParticipants" :key="participant.address" class="thread-participant-avatar" :class="[`avatar-${participant.color}`, { 'is-overflow': index === 2 && participants.length > 3 }]" :style="{ zIndex: index + 1 }" aria-hidden="true">
            {{ index === 2 && participants.length > 3 ? `+${participants.length - 2}` : participant.initials }}
          </span>
        </button>
      </template>
      <template #body>
        <ParticipantList class="thread-participants-mobile-content" :participants="participants" :show-heading="false" />
      </template>
      <template #footer>
        <NDrawerClose as-child>
          <button class="mail-mobile-drawer-close" type="button">{{ $t('common.close') }}</button>
        </NDrawerClose>
      </template>
    </NDrawer>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ParticipantList from '~/components/ThreadParticipantList.vue'
import { senderPath } from '~/utils/mailbox-routing'

type Participant = {
  address: string
  name: string
  initials: string
  color: 'terracotta' | 'blue' | 'green' | 'gold'
}

const props = defineProps<{ participants: Participant[], inline?: boolean, mobileDrawer?: boolean }>()
const open = ref(false)
const visibleParticipants = computed(() => props.participants.length > 3
  ? [...props.participants.slice(0, 2), props.participants[2]!]
  : props.participants)
</script>
