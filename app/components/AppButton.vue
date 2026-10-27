<template>
  <button class="app-button" :class="[`app-button--${variant}`, { 'is-accent': accent }]" v-bind="$attrs">
    <slot />
  </button>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  variant?: 'primary' | 'secondary'
  accent?: boolean
}>(), {
  variant: 'secondary',
  accent: false,
})
</script>
