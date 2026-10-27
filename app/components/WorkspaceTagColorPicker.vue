<template>
  <fieldset class="workspace-tag-color-picker">
    <legend>{{ label }} <span>· {{ $t(`tags.colors.${modelValue}`) }}</span></legend>
    <div class="workspace-tag-color-options">
      <NTooltip v-for="color in colors" :key="color" :content="$t(`tags.colors.${color}`)">
        <button
          class="workspace-tag-color-option"
          :class="[`tag-color-${color}`, { 'is-selected': modelValue === color }]"
          type="button"
          :aria-label="$t(`tags.colors.${color}`)"
          :aria-pressed="modelValue === color"
          @click="modelValue = color"
        >
          <span class="workspace-tag-color-dot" :class="`tag-color-${color}`" aria-hidden="true" />
        </button>
      </NTooltip>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
const colors = ['rose', 'violet', 'amber', 'teal', 'green', 'blue'] as const
const { $t } = useI18n()
defineProps<{ label: string }>()
const modelValue = defineModel<typeof colors[number]>({ required: true })
</script>
