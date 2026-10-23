<template>
  <span class="thread-participant-avatar" :class="[`avatar-${participant.color}`, { 'is-overflow': overflowText }]" :style="style" aria-hidden="true">
    <img v-if="imageUrl" :src="imageUrl" alt="" referrerpolicy="no-referrer" @error="handleImageError">
    <span v-else>{{ overflowText || participant.initials }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type Participant = {
  initials: string
  color: 'terracotta' | 'blue' | 'green' | 'gold'
  avatarUrl?: string | null
  logoUrl?: string | null
}

const props = defineProps<{ participant: Participant, overflowText?: string, zIndex?: number }>()
const imageKind = ref<'photo' | 'logo' | null>(props.participant.avatarUrl ? 'photo' : props.participant.logoUrl ? 'logo' : null)

watch(() => [props.participant.avatarUrl, props.participant.logoUrl], () => {
  imageKind.value = props.participant.avatarUrl ? 'photo' : props.participant.logoUrl ? 'logo' : null
})

const imageUrl = computed(() => {
  if (props.overflowText) return null
  return imageKind.value === 'photo'
    ? props.participant.avatarUrl
    : imageKind.value === 'logo' ? props.participant.logoUrl : null
})
const style = computed(() => props.zIndex === undefined ? undefined : { zIndex: props.zIndex })

function handleImageError() {
  imageKind.value = imageKind.value === 'photo' && props.participant.logoUrl ? 'logo' : null
}
</script>
