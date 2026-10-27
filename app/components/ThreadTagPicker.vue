<template>
  <NPopover
    :open="open"
    :modal="false"
    :_popover-content="{ side: 'top', align: 'start', sideOffset: 9, avoidCollisions: true, 'aria-label': $t('tags.assign') }"
    :una="{ popoverContent: 'thread-tag-picker topbar-popover-surface z-[140]' }"
    @update:open="setOpen"
  >
    <template #trigger>
      <button ref="triggerButton" class="thread-tag-picker-trigger" :class="{ 'is-wide': wideTrigger }" type="button" :aria-label="$t('tags.assign')" aria-keyshortcuts="B" :aria-expanded="open" :disabled="disabled">
        <span class="i-tabler-tag" aria-hidden="true" />
        <span v-if="wideTrigger">{{ $t('tags.assign') }}</span>
        <kbd v-if="wideTrigger">B</kbd>
      </button>
    </template>
    <template #default>
      <div class="thread-tag-picker-content" @keydown.esc.stop.prevent="closePicker">
        <p class="thread-tag-picker-heading">{{ $t('tags.assign') }}</p>
        <form class="thread-tag-picker-create" @submit.prevent="submitSearch">
          <label class="sr-only" for="thread-new-tag">{{ $t('tags.name') }}</label>
          <input id="thread-new-tag" ref="searchInput" v-model="newTagName" maxlength="40" :placeholder="$t('tags.namePlaceholder')" autocomplete="off" :disabled="saving">
          <button v-if="canManage" type="submit" :disabled="saving || (!filteredTags.length && !newTagName.trim())">{{ filteredTags.length ? $t('tags.add') : $t('tags.create') }}</button>
        </form>
        <p v-if="newTagName.trim() && !filteredTags.length && !canManage" class="thread-tag-picker-empty" role="status">{{ $t('tags.noMatches') }}</p>
        <button
          v-for="tag in filteredTags"
          :key="tag.id"
          class="thread-tag-picker-option"
          :class="[{ 'is-selected': assignedIds.has(tag.id) }, `tag-color-${tag.color}`]"
          type="button"
          :disabled="saving"
          :aria-pressed="assignedIds.has(tag.id)"
          @click="toggle(tag)"
        >
          <span class="thread-tag-picker-check" aria-hidden="true">{{ assignedIds.has(tag.id) ? '✓' : '' }}</span>
          <span class="workspace-tag-dot" aria-hidden="true" />
          <span>{{ tag.name }}</span>
        </button>
        <p v-if="!tags.length && !canManage && !newTagName.trim()" class="thread-tag-picker-empty">{{ $t('tags.noneCreated') }}</p>
        <p v-if="error" class="thread-tag-picker-error" role="alert">{{ error }}</p>
      </div>
    </template>
  </NPopover>
</template>

<script setup lang="ts">
import type { WorkspaceTag } from '~/types/mail'

const props = defineProps<{
  tags: WorkspaceTag[]
  assigned: WorkspaceTag[]
  messageIds: string[]
  canManage?: boolean
  disabled?: boolean
  wideTrigger?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { $t } = useI18n()
const open = ref(false)
const saving = ref(false)
const error = ref('')
const newTagName = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const triggerButton = ref<HTMLButtonElement | null>(null)
const assignedIds = computed(() => new Set(props.assigned.map(tag => tag.id)))
const filteredTags = computed(() => {
  const query = normalizeTagName(newTagName.value.trim())
  return query
    ? props.tags.filter(tag => normalizeTagName(tag.name).includes(query))
    : props.tags
})

function normalizeTagName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

async function setOpen(isOpen: boolean) {
  open.value = isOpen
  if (!isOpen) return
  await nextTick()
  searchInput.value?.focus()
}

async function openPicker() {
  if (props.disabled) return
  await setOpen(true)
}

async function closePicker() {
  await setOpen(false)
  await nextTick()
  triggerButton.value?.focus()
}

function isPickerOpen() {
  return open.value
}

async function submitSearch() {
  if (saving.value || !newTagName.value.trim()) return
  const firstMatch = filteredTags.value[0]
  if (firstMatch) {
    await toggle(firstMatch)
    return
  }
  if (props.canManage && newTagName.value.trim()) await createAndAssign()
}

async function toggle(tag: WorkspaceTag) {
  if (saving.value || !props.messageIds.length) return
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/tags/assign', {
      method: 'PATCH',
      body: { tagId: tag.id, messageIds: props.messageIds, enabled: !assignedIds.value.has(tag.id) },
    })
    emit('changed')
  } catch {
    error.value = $t('tags.assignError')
  } finally {
    saving.value = false
  }
}

async function createAndAssign() {
  if (!props.canManage || !newTagName.value.trim() || saving.value || !props.messageIds.length) return
  saving.value = true
  error.value = ''
  let tagWasCreated = false
  try {
    const created = await $fetch<WorkspaceTag>('/api/tags', {
      method: 'POST',
      body: { name: newTagName.value, color: 'teal' },
    })
    tagWasCreated = true
    await $fetch('/api/tags/assign', {
      method: 'PATCH',
      body: { tagId: created.id, messageIds: props.messageIds, enabled: true },
    })
    newTagName.value = ''
    emit('changed')
  } catch {
    if (tagWasCreated) emit('changed')
    error.value = $t(tagWasCreated ? 'tags.assignError' : 'tags.saveError')
  } finally {
    saving.value = false
  }
}

defineExpose({ openPicker, closePicker, isPickerOpen })
</script>
