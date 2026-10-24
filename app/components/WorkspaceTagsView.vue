<template>
  <main class="mail-page workspace-tags-page">
    <section class="workspace-tags-view" aria-labelledby="workspace-tags-title">
      <header class="workspace-tags-heading">
        <div>
          <h1 id="workspace-tags-title">{{ $t('tags.title') }}</h1>
          <p>{{ $t('tags.pageDescription') }}</p>
        </div>
        <NuxtLink class="files-back" to="/mail/inbox">
          <span class="i-tabler-arrow-left" aria-hidden="true" />
          {{ $t('files.backToInbox') }}
        </NuxtLink>
      </header>

      <form v-if="canManage" class="workspace-tags-create" @submit.prevent="createTag">
        <label class="workspace-tag-name-field" for="new-workspace-tag">
          <span>{{ $t('tags.name') }}</span>
          <input id="new-workspace-tag" v-model="newTagName" maxlength="40" :placeholder="$t('tags.namePlaceholder')" autocomplete="off">
        </label>
        <fieldset class="workspace-tag-color-field">
          <legend>{{ $t('tags.color') }}</legend>
          <NCombobox
            :una="{ combobox: 'workspace-tag-color-select' }"
            :items="tagColorOptions"
            :model-value="selectedTagColorOption"
            by="value"
            :_combobox-input="{ placeholder: $t('tags.color'), autocomplete: 'off' }"
            :_combobox-list="{ align: 'start', side: 'bottom', sideOffset: 7, class: 'workspace-tag-color-list z-[120]' }"
            :_combobox-viewport="{ class: 'workspace-tag-color-viewport' }"
            :_combobox-trigger="{ class: 'workspace-tag-color-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('tags.color') }"
            :_combobox-item="{ class: 'workspace-tag-color-item' }"
            :text-empty="$t('tags.colorNoMatches')"
            @update:model-value="selectNewTagColor"
          >
            <template #trigger>
              <span class="workspace-tag-color-selected">
                <span class="workspace-tag-color-dot" :class="`tag-color-${newTagColor}`" aria-hidden="true" />
                <span>{{ selectedTagColorOption?.label }}</span>
              </span>
            </template>
            <template #item="{ item }">
              <span class="workspace-tag-color-item-copy">
                <span class="workspace-tag-color-dot" :class="`tag-color-${item.value}`" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </span>
            </template>
          </NCombobox>
        </fieldset>
        <button type="submit" class="workspace-tag-create-button" :disabled="!newTagName.trim() || saving">{{ saving ? $t('tags.saving') : $t('tags.create') }}</button>
      </form>
      <p v-if="error" class="workspace-tags-error" role="alert">{{ error }}</p>

      <NuxtLink class="workspace-tags-all" to="/mail/inbox">{{ $t('tags.all') }} · {{ $t('mail.inboxLabel') }}</NuxtLink>
      <div v-if="pending && !initialLoadComplete" class="workspace-tags-empty" role="status">{{ $t('common.loading') }}</div>
      <TransitionGroup v-else name="workspace-tag-row" tag="ul" class="workspace-tags-list" :aria-label="$t('tags.title')">
        <li v-if="!tags.length" key="empty" class="workspace-tags-empty-row" role="status">
          <span class="i-tabler-tag" aria-hidden="true" />
          <p>{{ canManage ? $t('tags.empty') : $t('tags.emptyReadOnly') }}</p>
        </li>
        <li v-for="tag in tags" :key="tag.id" :class="{ 'is-manageable': canManage, 'is-editing': editingTagId === tag.id }">
          <span v-if="editingTagId === tag.id" class="workspace-tags-mark" :class="`tag-color-${tag.color}`"><span class="workspace-tag-dot" aria-hidden="true" /></span>
          <NuxtLink v-else class="workspace-tags-link" :to="`/mail/inbox?tag=${encodeURIComponent(tag.id)}`">
            <span class="workspace-tags-mark" :class="`tag-color-${tag.color}`"><span class="workspace-tag-dot" aria-hidden="true" /></span>
            <span class="workspace-tags-name">{{ tag.name }}</span>
            <span class="workspace-tags-open i-tabler-chevron-right" aria-hidden="true" />
          </NuxtLink>
          <template v-if="canManage">
            <label class="sr-only" :for="`tag-name-${tag.id}`">{{ $t('tags.rename', { name: tag.name }) }}</label>
            <input v-if="editingTagId === tag.id" :id="`tag-name-${tag.id}`" v-model="tagDrafts[tag.id]" class="workspace-tags-rename" maxlength="40" @keydown.enter.prevent="saveTag(tag)" @keydown.esc.prevent.stop="cancelTagEdit(tag)">
            <button v-if="editingTagId === tag.id" class="workspace-tags-action" type="button" :aria-label="$t('tags.saveName', { name: tag.name })" :disabled="saving || !tagDrafts[tag.id]?.trim() || tagDrafts[tag.id]?.trim() === tag.name" @click="saveTag(tag)"><span class="i-tabler-check" aria-hidden="true" /></button>
            <button v-else class="workspace-tags-action" type="button" :aria-label="$t('tags.rename', { name: tag.name })" @click="beginTagEdit(tag)"><span class="i-tabler-pencil" aria-hidden="true" /></button>
            <button v-if="editingTagId === tag.id" class="workspace-tags-action is-cancel" type="button" :aria-label="$t('tags.cancel')" @click="cancelTagEdit(tag)"><span class="i-tabler-x" aria-hidden="true" /></button>
            <button v-else class="workspace-tags-action is-danger" type="button" :aria-label="$t('tags.delete', { name: tag.name })" :disabled="saving" @click="tagDeleteTarget = tag"><span class="i-tabler-trash" aria-hidden="true" /></button>
          </template>
        </li>
      </TransitionGroup>
    </section>

    <NDialog
      :open="Boolean(tagDeleteTarget)"
      :title="$t('tags.deleteTitle')"
      :description="$t('tags.deleteDescription', { name: tagDeleteTarget?.name || '' })"
      :_dialog-content="{ class: 'classification-dialog workspace-tag-delete-dialog' }"
      @update:open="(open: boolean) => { if (!open) tagDeleteTarget = null }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('tags.deleteTitle') }}</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">{{ $t('tags.deleteDescription', { name: tagDeleteTarget?.name || '' }) }}</NDialogDescription>
        </header>
        <footer class="dialog-actions">
          <NDialogClose as-child><button class="dialog-cancel" type="button" @click="tagDeleteTarget = null">{{ $t('tags.cancel') }}</button></NDialogClose>
          <button class="dialog-danger" type="button" :disabled="saving" @click="deleteTag">{{ saving ? $t('tags.saving') : $t('tags.deleteConfirm') }}</button>
        </footer>
      </template>
    </NDialog>
  </main>
</template>

<script setup lang="ts">
import type { WorkspaceTag } from '~/types/mail'
const { $t } = useI18n()
const router = useRouter()
const tagColors = ['teal', 'blue', 'green', 'amber', 'rose', 'violet']
const newTagName = ref('')
const newTagColor = ref('teal')
const tagColorOptions = computed(() => tagColors.map(color => ({ value: color, label: String($t(`tags.colors.${color}`)) })))
const selectedTagColorOption = computed(() => tagColorOptions.value.find(option => option.value === newTagColor.value))
const saving = ref(false)
const error = ref('')
const editingTagId = ref<string | null>(null)
const tagDeleteTarget = ref<WorkspaceTag | null>(null)
const tagDrafts = ref<Record<string, string>>({})
const { data: tagState, pending, refresh } = await useFetch<{ canManage: boolean, canAssign: boolean, tags: WorkspaceTag[] }>('/api/tags', {
  default: () => ({ canManage: false, canAssign: false, tags: [] }),
})
const tags = computed(() => tagState.value?.tags ?? [])
const canManage = computed(() => Boolean(tagState.value?.canManage))
const initialLoadComplete = ref(false)

watch(pending, (isPending) => {
  if (!isPending) initialLoadComplete.value = true
}, { immediate: true })

watch(tags, (items) => {
  tagDrafts.value = Object.fromEntries(items.map(tag => [tag.id, tag.name]))
}, { immediate: true })

async function createTag() {
  if (!newTagName.value.trim() || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/tags', { method: 'POST', body: { name: newTagName.value, color: newTagColor.value } })
    newTagName.value = ''
    await refresh()
  } catch {
    error.value = $t('tags.saveError')
  } finally {
    saving.value = false
  }
}

function selectNewTagColor(option: { value: string } | null | undefined) {
  if (option) newTagColor.value = option.value
}

async function saveTag(tag: WorkspaceTag) {
  const name = tagDrafts.value[tag.id]?.trim()
  if (!name || name === tag.name || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'PATCH', body: { name, color: tag.color } })
    editingTagId.value = null
    await refresh()
  } catch {
    error.value = $t('tags.saveError')
  } finally {
    saving.value = false
  }
}

function beginTagEdit(tag: WorkspaceTag) {
  tagDrafts.value[tag.id] = tag.name
  editingTagId.value = tag.id
  void nextTick(() => document.getElementById(`tag-name-${tag.id}`)?.focus())
}

function cancelTagEdit(tag: WorkspaceTag) {
  tagDrafts.value[tag.id] = tag.name
  editingTagId.value = null
}

async function deleteTag() {
  const target = tagDeleteTarget.value
  if (!target || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/tags/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
    tagDeleteTarget.value = null
    await refresh()
  } catch {
    error.value = $t('tags.deleteError')
  } finally {
    saving.value = false
  }
}
</script>
