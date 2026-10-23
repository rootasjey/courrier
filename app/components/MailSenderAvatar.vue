<template>
  <span class="sender-avatar" :class="[`avatar-${color}`, { 'has-avatar-image': imageUrl, 'has-avatar-logo': imageKind === 'logo' }]" aria-hidden="true">
    <img v-if="imageUrl" :src="imageUrl" alt="" @error="handleImageError">
    <span v-else>{{ initials }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  initials: string
  color: string
  avatarUrl?: string | null
  logoUrl?: string | null
}>()

const failedAvatarUrl = ref<string | null>(null)
const failedLogoUrl = ref<string | null>(null)

const imageUrl = computed(() => {
  if (props.avatarUrl && props.avatarUrl !== failedAvatarUrl.value) return props.avatarUrl
  if (props.logoUrl && props.logoUrl !== failedLogoUrl.value) return props.logoUrl
  return null
})
const imageKind = computed(() => {
  if (!imageUrl.value) return null
  return imageUrl.value === props.logoUrl ? 'logo' : 'photo'
})

watch(() => [props.avatarUrl, props.logoUrl], () => {
  failedAvatarUrl.value = null
  failedLogoUrl.value = null
})

function handleImageError() {
  if (imageKind.value === 'photo') failedAvatarUrl.value = imageUrl.value
  else failedLogoUrl.value = imageUrl.value
}
</script>
