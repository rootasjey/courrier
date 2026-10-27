<template>
  <main class="mail-page workspace-tags-page">
    <section class="workspace-tags-view" aria-labelledby="workspace-tags-title">
      <header class="workspace-tags-heading">
        <div class="workspace-tags-heading-copy">
          <h1 id="workspace-tags-title">{{ $t('tags.title') }}</h1>
          <p>{{ $t('tags.pageDescription') }}</p>
        </div>
        <NuxtLink class="workspace-tags-back" to="/mail/inbox">
          <span class="i-tabler-arrow-left" aria-hidden="true" />
          {{ $t('files.backToInbox') }}
        </NuxtLink>
      </header>

      <section class="workspace-tags-collection" aria-labelledby="workspace-tags-collection-title">
        <header class="workspace-tags-collection-heading">
          <div class="workspace-tags-collection-title">
            <h2 id="workspace-tags-collection-title">{{ $t('tags.listHeading') }}</h2>
            <span class="workspace-tags-list-count">{{ tags.length }}</span>
          </div>
          <button
            v-if="canManage && !editingTagId"
            ref="addTagTrigger"
            class="workspace-tag-add-trigger"
            type="button"
            :aria-expanded="showCreateForm"
            @click="toggleCreateForm"
          >
            <span :class="showCreateForm ? 'i-tabler-minus' : 'i-tabler-plus'" aria-hidden="true" />
            {{ showCreateForm ? $t('tags.cancel') : $t('tags.createHeading') }}
          </button>
        </header>

        <form v-if="canManage && showCreateForm" class="workspace-tag-quick-form" @submit.prevent="createTag">
          <div class="workspace-tag-name-field">
            <input id="new-workspace-tag" ref="newTagNameInput" v-model="newTagName" maxlength="40" :aria-label="$t('tags.name')" :placeholder="$t('tags.namePlaceholder')" autocomplete="off">
          </div>
          <WorkspaceTagColorPicker v-model="newTagColor" :label="$t('tags.color')" />
          <div class="workspace-tag-quick-actions">
            <button class="workspace-tag-cancel-button" type="button" @click="cancelCreateTag">{{ $t('tags.cancel') }}</button>
            <button type="submit" class="workspace-tag-create-button" :disabled="!newTagName.trim() || saving">
              <span class="i-tabler-check" aria-hidden="true" />
              {{ saving ? $t('tags.saving') : $t('tags.create') }}
            </button>
          </div>
        </form>

        <p v-if="error" class="workspace-tags-error" role="alert">{{ error }}</p>
        <p v-if="pending && !initialLoadComplete" class="workspace-tags-loading" role="status">{{ $t('common.loading') }}</p>
        <TransitionGroup v-else name="workspace-tag-row" tag="ul" class="workspace-tags-cloud" :aria-label="$t('tags.title')">
          <li v-if="!tags.length" key="empty" class="workspace-tags-empty-row" role="status">
            <span>{{ canManage ? $t('tags.empty') : $t('tags.emptyReadOnly') }}</span>
          </li>
          <li
            v-for="tag in tags"
            :key="tag.id"
            class="workspace-tag-entry"
            :class="[`tag-color-${editingTagId === tag.id ? tagColorDrafts[tag.id] : tag.color}`, { 'is-editing': editingTagId === tag.id }]"
          >
            <template v-if="editingTagId === tag.id">
              <form class="workspace-tag-inline-editor" @submit.prevent="saveTag(tag)" @keydown.esc.stop.prevent="cancelTagEdit(tag)">
                <label class="workspace-tag-name-field" :for="`tag-name-${tag.id}`">
                  <span>{{ $t('tags.name') }}</span>
                  <input :id="`tag-name-${tag.id}`" v-model="tagDrafts[tag.id]" maxlength="40" autocomplete="off">
                </label>
                <WorkspaceTagColorPicker v-model="tagColorDrafts[tag.id]" :label="$t('tags.color')" />
                <div class="workspace-tag-quick-actions">
                  <button class="workspace-tag-cancel-button" type="button" @click="cancelTagEdit(tag)">{{ $t('tags.cancel') }}</button>
                  <button class="workspace-tag-create-button" type="submit" :disabled="!hasTagDraftChanges(tag) || saving || !tagDrafts[tag.id]?.trim()">
                    <span class="i-tabler-check" aria-hidden="true" />
                    {{ saving ? $t('tags.saving') : $t('tags.saveChanges') }}
                  </button>
                </div>
              </form>
            </template>
            <template v-else>
              <NuxtLink class="workspace-tag-pill" :to="`/mail/inbox?tag=${encodeURIComponent(tag.id)}`">
                <span class="workspace-tag-pill-dot" aria-hidden="true" />
                <span>{{ tag.name }}</span>
              </NuxtLink>
              <NPopover
                v-if="canManage"
                :open="openTagMenuId === tag.id"
                :modal="false"
                :_popover-content="{ side: 'bottom', align: 'end', sideOffset: 6, avoidCollisions: true, 'aria-label': $t('tags.actionsFor', { name: tag.name }) }"
                :una="{ popoverContent: 'workspace-tag-actions-popover topbar-popover-surface z-[120]' }"
                @update:open="(open: boolean) => setTagMenuOpen(tag.id, open)"
              >
                <template #trigger>
                  <button class="workspace-tag-menu-trigger" :class="{ 'is-muted': showCreateForm }" type="button" :disabled="showCreateForm" :tabindex="showCreateForm ? -1 : undefined" :aria-hidden="showCreateForm || undefined" :aria-label="$t('tags.actionsFor', { name: tag.name })" :aria-expanded="openTagMenuId === tag.id">
                    <span class="i-tabler-dots" aria-hidden="true" />
                  </button>
                </template>
                <template #default>
                  <div class="workspace-tag-actions-menu">
                    <button type="button" @click="editTagFromMenu(tag)">
                      <span class="i-tabler-pencil" aria-hidden="true" />
                      {{ $t('tags.edit', { name: tag.name }) }}
                    </button>
                    <button class="is-danger" type="button" @click="deleteTagFromMenu(tag)">
                      <span class="i-tabler-trash" aria-hidden="true" />
                      {{ $t('tags.delete', { name: tag.name }) }}
                    </button>
                  </div>
                </template>
              </NPopover>
            </template>
          </li>
        </TransitionGroup>
      </section>
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
const newTagName = ref('')
const newTagNameInput = ref<HTMLInputElement | null>(null)
const addTagTrigger = ref<HTMLButtonElement | null>(null)
const newTagColor = ref('teal')
const showCreateForm = ref(false)
const saving = ref(false)
const error = ref('')
const editingTagId = ref<string | null>(null)
const openTagMenuId = ref<string | null>(null)
const tagDeleteTarget = ref<WorkspaceTag | null>(null)
const tagDrafts = ref<Record<string, string>>({})
const tagColorDrafts = ref<Record<string, string>>({})
const { data: tagState, pending, refresh } = await useFetch<{ canManage: boolean, canAssign: boolean, tags: WorkspaceTag[] }>('/api/tags', {
  default: () => ({ canManage: false, canAssign: false, tags: [] }),
})
const tags = computed(() => tagState.value?.tags ?? [])
const canManage = computed(() => Boolean(tagState.value?.canManage))
const initialLoadComplete = ref(false)

onMounted(() => window.addEventListener('keydown', handleTagShortcuts, true))
onUnmounted(() => window.removeEventListener('keydown', handleTagShortcuts, true))

watch(pending, (isPending) => {
  if (!isPending) initialLoadComplete.value = true
}, { immediate: true })

watch(tags, (items) => {
  tagDrafts.value = Object.fromEntries(items.map(tag => [tag.id, tag.name]))
  tagColorDrafts.value = Object.fromEntries(items.map(tag => [tag.id, tag.color]))
}, { immediate: true })

async function toggleCreateForm() {
  if (showCreateForm.value) {
    cancelCreateTag()
    return
  }
  showCreateForm.value = true
  error.value = ''
  await nextTick()
  newTagNameInput.value?.focus()
}

function handleTagShortcuts(event: KeyboardEvent) {
  if (event.key === 'Escape' && showCreateForm.value) {
    event.preventDefault()
    event.stopPropagation()
    cancelCreateTag()
    void nextTick(() => addTagTrigger.value?.focus())
    return
  }

  if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat || event.isComposing || showCreateForm.value || editingTagId.value || !canManage.value) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return

  event.preventDefault()
  event.stopPropagation()
  void toggleCreateForm()
}

function cancelCreateTag() {
  showCreateForm.value = false
  newTagName.value = ''
  newTagColor.value = 'teal'
  error.value = ''
}

function setTagMenuOpen(tagId: string, open: boolean) {
  openTagMenuId.value = open ? tagId : null
}

function editTagFromMenu(tag: WorkspaceTag) {
  openTagMenuId.value = null
  showCreateForm.value = false
  beginTagEdit(tag)
}

function deleteTagFromMenu(tag: WorkspaceTag) {
  openTagMenuId.value = null
  tagDeleteTarget.value = tag
}

async function createTag() {
  if (!newTagName.value.trim() || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/tags', { method: 'POST', body: { name: newTagName.value, color: newTagColor.value } })
    showCreateForm.value = false
    newTagName.value = ''
    newTagColor.value = 'teal'
    await refresh()
  } catch {
    error.value = $t('tags.saveError')
  } finally {
    saving.value = false
  }
}

async function saveTag(tag: WorkspaceTag) {
  const name = tagDrafts.value[tag.id]?.trim()
  const color = tagColorDrafts.value[tag.id]
  if (!name || !hasTagDraftChanges(tag) || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/tags/${encodeURIComponent(tag.id)}`, { method: 'PATCH', body: { name, color } })
    editingTagId.value = null
    await refresh()
  } catch {
    error.value = $t('tags.saveError')
  } finally {
    saving.value = false
  }
}

function beginTagEdit(tag: WorkspaceTag) {
  openTagMenuId.value = null
  tagDrafts.value[tag.id] = tag.name
  tagColorDrafts.value[tag.id] = tag.color
  editingTagId.value = tag.id
  void nextTick(() => document.getElementById(`tag-name-${tag.id}`)?.focus())
}

function cancelTagEdit(tag: WorkspaceTag) {
  tagDrafts.value[tag.id] = tag.name
  tagColorDrafts.value[tag.id] = tag.color
  editingTagId.value = null
}

function hasTagDraftChanges(tag: WorkspaceTag) {
  return tagDrafts.value[tag.id]?.trim() !== tag.name || tagColorDrafts.value[tag.id] !== tag.color
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
