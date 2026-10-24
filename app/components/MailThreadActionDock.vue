<template>
  <Teleport to="body">
    <Transition name="message-action-dock" appear>
      <div class="message-action-dock" :class="{ 'has-feed-edition-navigation': state.feedNavigation }" role="toolbar" :aria-label="$t('mail.messageActions')">
        <nav v-if="state.feedNavigation" class="feed-edition-navigation feed-edition-navigation-dock" :aria-label="$t('mail.feedNavigation')">
          <button class="feed-edition-button" type="button" :aria-label="$t('mail.previousEdition')" :disabled="state.feedNavigation.index <= 0" @click="actions.navigateFeedEdition(-1)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" /></svg>
          </button>
          <span class="feed-edition-position" aria-hidden="true">{{ state.feedNavigation.index + 1 }} / {{ state.feedNavigation.count }}</span>
          <button class="feed-edition-button is-next" type="button" :aria-label="$t('mail.nextEdition')" :disabled="state.feedNavigation.index >= state.feedNavigation.count - 1" @click="actions.navigateFeedEdition(1)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
          </button>
        </nav>
        <div class="message-action-group">
          <button v-if="!state.replyComposerOpen && state.folder !== 'Trash'" class="message-action-reply" type="button" @click="actions.openReplyComposer">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5 3.5 9.5 8 14M4 9.5h7a5.5 5.5 0 0 1 5.5 5.5" /></svg>
            <span>{{ $t('mail.reply') }}</span><kbd>R</kbd>
          </button>
          <button v-if="state.folder !== 'Trash'" class="message-action-button" type="button" :aria-label="$t(state.isMarkingThreadUnseen ? 'messageActions.markingUnseen' : 'messageActions.markUnseen')" :disabled="state.isMarkingThreadUnseen || state.isMovingOpenThread" @click="actions.markOpenThreadUnseen">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 4.5h15v11h-15z" /><path d="m3 5 7 5.5L17 5" /><circle cx="15.5" cy="4" r="2.5" /></svg>
            <span class="message-action-label">{{ $t(state.isMarkingThreadUnseen ? 'messageActions.markingUnseen' : 'messageActions.markUnseen') }}</span><kbd>U</kbd>
          </button>
          <button v-if="state.folder !== 'Trash'" class="message-action-button" type="button" :aria-label="$t('messageActions.forward')" :disabled="state.isMarkingThreadUnseen || state.isMovingOpenThread" @click="actions.forwardActiveMessage">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5 17.5 10 11 16.5v-4c-4.4 0-7 1.2-8.5 4 .2-5.1 2.8-8 8.5-8v-5Z" /></svg>
            <span class="message-action-label">{{ $t('messageActions.forward') }}</span>
          </button>
          <NCombobox
            v-if="state.move.visible"
            class="thread-action-move"
            :items="state.move.options"
            by="value"
            :open="state.move.open"
            :disabled="state.isMarkingThreadUnseen || state.isMovingOpenThread"
            :_combobox-input="{ placeholder: $t('bulk.findFolder'), autocomplete: 'off', leading: 'i-lucide-search' }"
            :_combobox-list="{ align: 'start', side: 'top', sideOffset: 8, class: 'thread-action-move-list z-[120]' }"
            :_combobox-viewport="{ class: 'thread-action-move-viewport' }"
            :_combobox-trigger="{ class: 'thread-action-move-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('messageActions.moveToFolder') }"
            :_combobox-item="{ class: 'thread-action-move-item' }"
            :text-empty="$t('bulk.noFoldersFound')"
            @update:open="actions.setThreadMoveMenuOpen"
            @update:model-value="actions.moveOpenThread"
          >
            <template #trigger>
              <svg class="thread-action-move-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h7l2 2h8v10h-17v-12Z" /><path d="M12 11v5m-2-2 2 2 2-2" /></svg>
              <span class="message-action-label thread-action-move-label">{{ $t('messageActions.move') }}</span><kbd>V</kbd>
            </template>
          </NCombobox>
          <ThreadTagPicker v-if="state.tagPicker" ref="tagPicker" :tags="state.tagPicker.tags" :assigned="state.tagPicker.assigned" :message-ids="state.tagPicker.messageIds" :can-manage="state.tagPicker.canManage" @changed="actions.refreshTagAssignments" />
          <button v-if="state.folder === 'Trash'" class="message-action-button" type="button" :aria-label="$t(state.isSavingScreenerAction ? 'mail.restoring' : 'mail.restore')" :disabled="state.isSavingScreenerAction" @click="actions.restoreTrashedMessage">
            <span class="message-action-icon i-tabler-mailbox" aria-hidden="true" />
            <span class="message-action-label">{{ $t(state.isSavingScreenerAction ? 'mail.restoring' : 'mail.restore') }}</span>
          </button>
          <template v-else>
            <button v-if="state.folder === 'Set Aside'" class="message-action-button" type="button" :aria-label="$t(state.isSavingSetAside ? 'mail.restoring' : 'mail.restoreToMailbox')" :disabled="state.isSavingSetAside" @click="actions.setAsideThread(false)">
              <span class="message-action-icon i-tabler-mailbox" aria-hidden="true" />
              <span class="message-action-label">{{ $t(state.isSavingSetAside ? 'mail.restoring' : 'mail.restoreToMailbox') }}</span><kbd>A</kbd>
            </button>
            <button v-else-if="state.folder === 'Imbox'" class="message-action-button" type="button" :aria-label="state.isSavingSetAside ? $t('mail.setAsideSaving') : $t('bulk.setAside')" :disabled="state.isSavingSetAside" @click="actions.setAsideThread(true)">
              <span class="message-action-icon i-tabler-eggs" aria-hidden="true" />
              <span class="message-action-label">{{ $t(state.isSavingSetAside ? 'mail.setAsideSaving' : 'bulk.setAside') }}</span><kbd>A</kbd>
            </button>
            <button v-else-if="state.folder !== 'Reply Later'" class="message-action-button" type="button" :aria-label="$t(state.hasManualMerges ? 'mail.classify' : 'mail.move')" @click="actions.openClassification">
              <span class="message-action-icon i-tabler-mailbox" aria-hidden="true" />
              <span class="message-action-label">{{ $t(state.hasManualMerges ? 'mail.classify' : 'mail.move') }}</span>
            </button>
            <button v-if="state.folder === 'Reply Later'" class="message-action-button" type="button" :aria-label="$t(state.isSavingReplyLater ? 'mail.replyLaterRemoveSaving' : 'mail.removeFromReplyLater')" :disabled="state.isSavingReplyLater" @click="actions.setReplyLater(false)">
              <span class="message-action-icon i-tabler-message-reply" aria-hidden="true" />
              <span class="message-action-label">{{ $t(state.isSavingReplyLater ? 'mail.replyLaterRemoveSaving' : 'mail.removeFromReplyLater') }}</span><kbd>L</kbd>
            </button>
            <button v-else-if="state.folder !== 'Set Aside'" class="message-action-button" type="button" :aria-label="$t(state.isSavingReplyLater ? 'mail.replyLaterSaving' : 'bulk.replyLater')" :disabled="state.isSavingReplyLater" @click="actions.setReplyLater(true)">
              <span class="message-action-icon i-tabler-message-reply" aria-hidden="true" />
              <span class="message-action-label">{{ $t(state.isSavingReplyLater ? 'mail.replyLaterSaving' : 'bulk.replyLater') }}</span><kbd>L</kbd>
            </button>
          </template>
          <NTooltip v-if="state.showTrash" :content="$t('palette.trashActionDescription')">
            <button class="message-action-trash" type="button" :aria-label="$t('palette.trashTitle')" :disabled="state.isTrashingThread" @click="actions.openTrashDialog">
              <span class="message-action-trash-icon i-icon-park-outline-delete-themes" aria-hidden="true" />
            </button>
          </NTooltip>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import ThreadTagPicker from '~/components/ThreadTagPicker.vue'
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
const tagPicker = ref<{
  openPicker: () => Promise<void>
  closePicker: () => Promise<void>
  isPickerOpen: () => boolean
} | null>(null)

async function openTagPicker() {
  await tagPicker.value?.openPicker()
}

async function closeTagPicker() {
  await tagPicker.value?.closePicker()
}

function isTagPickerOpen() {
  return tagPicker.value?.isPickerOpen() ?? false
}

defineExpose({ openTagPicker, closeTagPicker, isTagPickerOpen })
</script>
