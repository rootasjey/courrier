<template>
  <footer class="thread-action-footer" :class="{ 'has-feed-edition-navigation': state.feedNavigation }" :aria-label="$t('mail.messageActions')">
    <nav v-if="state.feedNavigation" class="feed-edition-navigation thread-feed-navigation" :aria-label="$t('mail.feedNavigation')">
      <button class="feed-edition-button" type="button" :aria-label="$t('mail.previousEdition')" :disabled="state.feedNavigation.index <= 0" @click="actions.navigateFeedEdition(-1)">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" /></svg>
      </button>
      <span class="feed-edition-position" aria-hidden="true">{{ state.feedNavigation.index + 1 }} / {{ state.feedNavigation.count }}</span>
      <button class="feed-edition-button is-next" type="button" :aria-label="$t('mail.nextEdition')" :disabled="state.feedNavigation.index >= state.feedNavigation.count - 1" @click="actions.navigateFeedEdition(1)">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
      </button>
    </nav>

    <div class="thread-action-primary-group">
      <button v-if="!state.replyComposerOpen && state.folder !== 'Trash'" class="thread-action-primary" type="button" @click="actions.openReplyComposer">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5 3.5 9.5 8 14M4 9.5h7a5.5 5.5 0 0 1 5.5 5.5" /></svg>
        <span>{{ $t('mail.reply') }}</span><kbd>R</kbd>
      </button>
      <button v-if="state.folder !== 'Trash'" class="thread-action-secondary" type="button" :disabled="state.isMarkingThreadUnseen || state.isMovingOpenThread" @click="actions.forwardActiveMessage">
        <span>{{ $t('messageActions.forward') }}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5 17.5 10 11 16.5v-4c-4.4 0-7 1.2-8.5 4 .2-5.1 2.8-8 8.5-8v-5Z" /></svg>
      </button>

      <NPopover
        :open="moreMenuOpen"
        :modal="false"
        :_popover-content="{ side: 'top', align: 'end', sideOffset: 10, avoidCollisions: true, 'aria-label': $t('mail.moreMessageActions') }"
        :una="{ popoverContent: 'thread-actions-popover topbar-popover-surface z-[120]' }"
        @update:open="moreMenuOpen = $event"
      >
        <template #trigger>
          <button class="thread-action-more-trigger" type="button" aria-haspopup="dialog" :aria-expanded="moreMenuOpen" :aria-label="$t('mail.moreMessageActions')">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="16" cy="10" r="1.2"/></svg>
          </button>
        </template>
        <template #default>
          <section class="thread-action-menu-content">
            <h2>{{ $t('mail.moreMessageActions') }}</h2>

            <button v-if="state.folder !== 'Trash'" class="thread-action-menu-item" type="button" :disabled="state.isMarkingThreadUnseen || state.isMovingOpenThread" @click="markUnseen">
              <span class="i-tabler-mail-down" aria-hidden="true" />
              <span>{{ $t(state.isMarkingThreadUnseen ? 'messageActions.markingUnseen' : 'messageActions.markUnseen') }}</span>
              <kbd>U</kbd>
            </button>

            <NCombobox
              v-if="state.move.visible"
              class="thread-action-move"
              :items="state.move.options"
              by="value"
              :open="state.move.open"
              :disabled="state.isMarkingThreadUnseen || state.isMovingOpenThread"
              :_combobox-input="{ placeholder: $t('bulk.findFolder'), autocomplete: 'off', leading: 'i-lucide-search' }"
              :_combobox-list="{ align: 'start', side: 'top', sideOffset: 8, class: 'thread-action-move-list z-[130]' }"
              :_combobox-viewport="{ class: 'thread-action-move-viewport' }"
              :_combobox-trigger="{ class: 'thread-action-move-trigger thread-action-menu-item', trailing: 'i-lucide-chevron-down', ariaLabel: $t('messageActions.moveToFolder') }"
              :_combobox-item="{ class: 'thread-action-move-item' }"
              :text-empty="$t('bulk.noFoldersFound')"
              @update:open="actions.setThreadMoveMenuOpen"
              @update:model-value="moveOpenThread"
            >
              <template #trigger>
                <span class="i-tabler-folder-symlink" aria-hidden="true" />
                <span>{{ $t('messageActions.move') }}</span>
                <kbd>V</kbd>
              </template>
            </NCombobox>
            <p v-if="state.move.open" class="thread-action-move-shortcuts">
              <span v-for="option in state.move.options" :key="option.value"><kbd>{{ moveShortcutFor(option.value) }}</kbd> {{ option.label }}</span>
            </p>

            <ThreadTagPicker
              v-if="state.tagPicker"
              ref="tagPicker"
              wide-trigger
              :tags="state.tagPicker.tags"
              :assigned="state.tagPicker.assigned"
              :message-ids="state.tagPicker.messageIds"
              :can-manage="state.tagPicker.canManage"
              @changed="actions.refreshTagAssignments"
            />

            <button v-if="state.folder === 'Trash'" class="thread-action-menu-item" type="button" :disabled="state.isSavingScreenerAction" @click="restoreTrashedMessage">
              <span class="i-tabler-mailbox" aria-hidden="true" />
              <span>{{ $t(state.isSavingScreenerAction ? 'mail.restoring' : 'mail.restore') }}</span>
            </button>
            <template v-else>
              <button v-if="state.folder === 'Set Aside'" class="thread-action-menu-item" type="button" :disabled="state.isSavingSetAside" @click="setAsideThread(false)">
                <span class="i-tabler-mailbox" aria-hidden="true" />
                <span>{{ $t(state.isSavingSetAside ? 'mail.restoring' : 'mail.restoreToMailbox') }}</span><kbd>A</kbd>
              </button>
              <button v-else-if="state.folder === 'Imbox'" class="thread-action-menu-item" type="button" :disabled="state.isSavingSetAside" @click="setAsideThread(true)">
                <span class="i-tabler-eggs" aria-hidden="true" />
                <span>{{ $t(state.isSavingSetAside ? 'mail.setAsideSaving' : 'bulk.setAside') }}</span><kbd>A</kbd>
              </button>
              <button v-else-if="state.folder !== 'Reply Later'" class="thread-action-menu-item" type="button" @click="openClassification">
                <span class="i-tabler-mailbox" aria-hidden="true" />
                <span>{{ $t(state.hasManualMerges ? 'mail.classify' : 'mail.move') }}</span>
              </button>

              <button v-if="state.folder === 'Reply Later'" class="thread-action-menu-item" type="button" :disabled="state.isSavingReplyLater" @click="setReplyLater(false)">
                <span class="i-tabler-message-reply" aria-hidden="true" />
                <span>{{ $t(state.isSavingReplyLater ? 'mail.replyLaterRemoveSaving' : 'mail.removeFromReplyLater') }}</span><kbd>L</kbd>
              </button>
              <button v-else-if="state.folder !== 'Set Aside'" class="thread-action-menu-item" type="button" :disabled="state.isSavingReplyLater" @click="setReplyLater(true)">
                <span class="i-tabler-message-reply" aria-hidden="true" />
                <span>{{ $t(state.isSavingReplyLater ? 'mail.replyLaterSaving' : 'bulk.replyLater') }}</span><kbd>L</kbd>
              </button>
            </template>

            <button v-if="state.showTrash" class="thread-action-menu-item is-destructive" type="button" :disabled="state.isTrashingThread" @click="openTrashDialog">
              <span class="i-tabler-trash" aria-hidden="true" />
              <span>{{ $t('bulk.trash') }}</span><kbd>T</kbd>
            </button>
          </section>
        </template>
      </NPopover>
    </div>
  </footer>
</template>

<script setup lang="ts">
import ThreadTagPicker from '~/components/ThreadTagPicker.vue'
import { nextTick, ref } from 'vue'
import type { MailboxFolder, WorkspaceTag } from '~/types/mail'
import type { MailboxKey } from '~/utils/mailbox-routing'

type ThreadActionDockState = {
  folder: MailboxKey
  feedNavigation: { index: number, count: number } | null
  replyComposerOpen: boolean
  isMarkingThreadUnseen: boolean
  isMovingOpenThread: boolean
  move: { visible: boolean, options: { value: MailboxFolder, label: string }[], open: boolean }
  tagPicker: { tags: WorkspaceTag[], assigned: WorkspaceTag[], messageIds: string[], canManage: boolean } | null
  isSavingScreenerAction: boolean
  isSavingSetAside: boolean
  isSavingReplyLater: boolean
  hasManualMerges: boolean
  showTrash: boolean
  isTrashingThread: boolean
}

type ThreadActionDockActions = {
  navigateFeedEdition: (direction: -1 | 1) => void
  openReplyComposer: () => void | Promise<void>
  markOpenThreadUnseen: () => void | Promise<void>
  forwardActiveMessage: () => void
  setThreadMoveMenuOpen: (open: boolean) => void
  moveOpenThread: (folder: MailboxFolder) => void | Promise<void>
  refreshTagAssignments: () => void | Promise<void>
  restoreTrashedMessage: () => void | Promise<void>
  setAsideThread: (isSetAside: boolean) => void | Promise<void>
  openClassification: () => void
  setReplyLater: (isReplyLater: boolean) => void | Promise<void>
  openTrashDialog: () => void
}

const { state, actions } = defineProps<{
  state: ThreadActionDockState
  actions: ThreadActionDockActions
}>()

const { $t } = useI18n()
const moreMenuOpen = ref(false)
const tagPicker = ref<{
  openPicker: () => Promise<void>
  closePicker: () => Promise<void>
  isPickerOpen: () => boolean
} | null>(null)
const moveShortcutKeys: Partial<Record<MailboxFolder, string>> = {
  Imbox: 'I',
  'The Feed': 'F',
  'Paper Trail': 'P',
}

async function closeMenu(action: () => void | Promise<void>) {
  moreMenuOpen.value = false
  await action()
}

function markUnseen() {
  return closeMenu(actions.markOpenThreadUnseen)
}

function moveOpenThread(folder: MailboxFolder) {
  return closeMenu(() => actions.moveOpenThread(folder))
}

function restoreTrashedMessage() {
  return closeMenu(actions.restoreTrashedMessage)
}

function setAsideThread(isSetAside: boolean) {
  return closeMenu(() => actions.setAsideThread(isSetAside))
}

function openClassification() {
  return closeMenu(actions.openClassification)
}

function setReplyLater(isReplyLater: boolean) {
  return closeMenu(() => actions.setReplyLater(isReplyLater))
}

function openTrashDialog() {
  return closeMenu(actions.openTrashDialog)
}

async function openTagPicker() {
  await tagPicker.value?.openPicker()
}

async function openMovePicker() {
  moreMenuOpen.value = true
  await nextTick()
  actions.setThreadMoveMenuOpen(true)
  await nextTick()
  document.querySelector<HTMLInputElement>('.thread-action-move input')?.focus()
}

function moveShortcutFor(folder: MailboxFolder) {
  return moveShortcutKeys[folder] ?? ''
}

async function closeTagPicker() {
  await tagPicker.value?.closePicker()
}

function isTagPickerOpen() {
  return tagPicker.value?.isPickerOpen() ?? false
}

function selectMoveFolder(folder: MailboxFolder) {
  const destination = state.move.options.find(option => option.value === folder)
  if (destination) return moveOpenThread(destination)
}

defineExpose({ openTagPicker, closeTagPicker, isTagPickerOpen, openMovePicker, selectMoveFolder, openTrashDialog })
</script>
