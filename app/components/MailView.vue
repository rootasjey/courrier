<template>
  <main class="mail-page">
    <section v-if="!isReadingMessage" class="mailbox-view" :class="{ 'has-mail-stacks': showSetAsideStack || showReplyLaterStack }" :aria-label="$t('mail.inboxLabel')">
      <header class="inbox-heading">
      <div v-if="!isGlobalSearch" class="heading-actions">
          <template v-if="activeFolder === 'Screener'">
            <div class="screener-header-actions">
              <button class="screener-help-trigger" type="button" :aria-label="$t('mail.screenerShortcuts')" :title="$t('mail.screenerShortcutTitle')" @click="screenerShortcutHelpOpen = true">?</button>
              <button class="screener-done" type="button" @click="doneScreener">{{ $t('mail.screenerDone') }}</button>
            </div>
            <span aria-hidden="true" />
          </template>
          <template v-else>
            <button
              v-if="allScreenerSenders.length"
              class="screener-callout"
              type="button"
              :aria-label="$t(allScreenerSenders.length === 1 ? 'mail.reviewSenderOne' : 'mail.reviewSenderMany', { count: allScreenerSenders.length })"
              @click="navigateToFolder('Screener')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm16 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-1.2A4.8 4.8 0 0 1 6.8 14h.4A4.8 4.8 0 0 1 12 18.8V20m0-1.2a4.8 4.8 0 0 1 4.8-4.8h.4a4.8 4.8 0 0 1 4.8 4.8V20" /></svg>
              <span class="screener-callout-label" aria-hidden="true">{{ $t(allScreenerSenders.length === 1 ? 'mail.reviewSenderOne' : 'mail.reviewSenderMany', { count: allScreenerSenders.length }) }}</span>
              <span class="screener-callout-count" aria-hidden="true">{{ allScreenerSenders.length }}</span>
            </button>
            <button v-if="activeFolder !== 'Set Aside'" class="compose-button" type="button" :title="$t('mail.newMessage')" @click="openNewComposer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span>{{ $t('mail.write') }}</span>
            </button>
          </template>
        </div>
        <h1>{{ isGlobalSearch ? $t('mail.search') : mailboxByName(activeFolder).label }}</h1>
        <p v-if="activeFolder === 'Screener'" class="screener-intro">{{ $t('mail.screenerIntro') }}</p>
      </header>

      <Transition name="thread-selection-bar" appear>
        <div v-if="threadSelectionMode && selectedThreadIds.length" class="thread-selection-bar" role="group" :aria-label="$t('bulk.selectionActions')">
          <span class="thread-selection-count" role="status" aria-live="polite" aria-atomic="true">
            {{ selectedThreadIds.length }} {{ $t(selectedThreadIds.length === 1 ? 'bulk.selectedOne' : 'bulk.selectedMany') }}
          </span>
          <NTooltip :content="$t('bulk.markSeen')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t('bulk.markSeen')" :disabled="isApplyingBulkAction" @click="applyBulkAction('mark-seen')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h12a2 2 0 0 1 2 2v2" /><path d="M3.5 7.5 10 12l4-2.8" /><path d="M3.5 9.5v8a2 2 0 0 0 2 2h6" /><path d="m15 16 2.2 2.2L21 14.5" /></svg>
            </button>
          </NTooltip>
          <NTooltip :content="$t('messageActions.markUnseen')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t('messageActions.markUnseen')" :disabled="isApplyingBulkAction" @click="applyBulkAction('mark-unseen')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h12a2 2 0 0 1 2 2v2" /><path d="M3.5 7.5 10 12l4-2.8" /><path d="M3.5 9.5v8a2 2 0 0 0 2 2h7" /><circle cx="18" cy="17" r="3" /><path d="M18 15.5v1.7" /></svg>
            </button>
          </NTooltip>
          <NTooltip v-if="activeFolder !== 'Reply Later' && activeFolder !== 'Set Aside'" :content="$t('bulk.replyLater')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t('bulk.replyLater')" :disabled="isApplyingBulkAction" @click="applyBulkAction('reply-later', { enabled: true })">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>
            </button>
          </NTooltip>
          <NTooltip v-if="activeFolder === 'Imbox'" :content="$t('bulk.setAside')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t('bulk.setAside')" :disabled="isApplyingBulkAction" @click="applyBulkAction('set-aside', { enabled: true })">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l1 11H3L4 8Z" /><path d="M3.5 8 6 4h12l2.5 4" /><path d="M9 12h6" /></svg>
            </button>
          </NTooltip>
          <NTooltip v-if="activeFolder === 'Reply Later'" :content="$t('bulk.removeReplyLater')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t('bulk.removeReplyLater')" :disabled="isApplyingBulkAction" @click="applyBulkAction('reply-later', { enabled: false })">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 7 7v2" /></svg>
            </button>
          </NTooltip>
          <NTooltip v-if="activeFolder === 'Set Aside'" :content="$t('bulk.returnInbox')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t('bulk.returnInbox')" :disabled="isApplyingBulkAction" @click="applyBulkAction('set-aside', { enabled: false })">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16l1 10H3L4 9Z" /><path d="m9 13 3 3 3-3" /><path d="M12 16V5" /></svg>
            </button>
          </NTooltip>
          <NCombobox
            v-if="['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(activeFolder)"
            class="thread-selection-move"
            :items="bulkMoveOptions"
            by="value"
            :disabled="isApplyingBulkAction"
            :_combobox-input="{ placeholder: $t('bulk.findFolder'), autocomplete: 'off', leading: 'i-lucide-search' }"
            :_combobox-list="{ align: 'start', side: 'top', sideOffset: 8, class: 'thread-selection-move-list z-[120]' }"
            :_combobox-viewport="{ class: 'thread-selection-move-viewport' }"
            :_combobox-trigger="{ class: 'thread-selection-move-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('bulk.move') }"
            :_combobox-item="{ class: 'thread-selection-move-item' }"
            :text-empty="$t('bulk.noFoldersFound')"
            @update:model-value="moveSelectedThreads"
          >
            <template #trigger>
              <svg class="thread-selection-move-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h7l2 2h8v10h-17v-12Z" /><path d="M12 11v5m-2-2 2 2 2-2" /></svg>
              <span>{{ $t('bulk.move') }}</span>
            </template>
          </NCombobox>
          <NTooltip :content="$t('bulk.trash')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action thread-selection-trash" :aria-label="$t('bulk.trash')" :disabled="isApplyingBulkAction" @click="bulkTrashDialogOpen = true">
              <span class="thread-selection-delete-icon i-icon-park-outline-delete-themes" aria-hidden="true" />
            </button>
          </NTooltip>
          <NTooltip v-if="selectedThreadIds.length > 1" :content="$t(isMergingThreads ? 'mail.merging' : 'bulk.merge')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
            <button type="button" class="thread-selection-action" :aria-label="$t(isMergingThreads ? 'mail.merging' : 'bulk.merge')" :disabled="isApplyingBulkAction || isMergingThreads" @click="mergeDialogOpen = true">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 6h3a4 4 0 0 1 4 4v5.8M8.2 6H10a5 5 0 0 1 5 5" /></svg>
            </button>
          </NTooltip>
          <ThreadTagPicker v-if="canAssignTags" :tags="workspaceTags" :assigned="selectedThreadTags" :message-ids="selectedThreadMessageIds" @changed="refreshTagAssignments" />
          <button type="button" class="thread-selection-cancel" :disabled="isApplyingBulkAction" @click="clearThreadSelection">{{ $t('bulk.cancel') }}</button>
        </div>
      </Transition>

      <div v-if="classificationFeedback || undoClassificationId || classificationActionError || screenerActionError || bulkActionFeedback || bulkActionError || threadMergeFeedback || threadMergeError || paletteFeedback || paletteError" class="action-feedback">
        <p v-if="classificationFeedback" class="classification-feedback" role="status">{{ classificationFeedback }}</p>
        <button v-if="undoClassificationId" class="undo-action" type="button" :disabled="isUndoingClassification" @click="undoSenderRule">
          {{ isUndoingClassification ? $t('mail.undoing') : $t('mail.undoClassification') }}
        </button>
        <p v-if="classificationActionError" class="action-feedback-error" role="alert">{{ classificationActionError }}</p>
        <p v-if="screenerActionError" class="action-feedback-error" role="alert">{{ screenerActionError }}</p>
        <p v-if="bulkActionFeedback" class="classification-feedback" role="status">{{ bulkActionFeedback }}</p>
        <p v-if="bulkActionError" class="action-feedback-error" role="alert">{{ bulkActionError }}</p>
        <p v-if="threadMergeFeedback" class="classification-feedback" role="status">{{ threadMergeFeedback }}</p>
        <p v-if="threadMergeError" class="action-feedback-error" role="alert">{{ threadMergeError }}</p>
        <p v-if="paletteFeedback" class="classification-feedback" role="status">{{ paletteFeedback }}</p>
        <p v-if="paletteError" class="action-feedback-error" role="alert">{{ paletteError }}</p>
      </div>

      <div v-if="inboxMessagesError" class="empty-list error-state" role="alert">
        <strong>{{ $t('mail.loadErrorTitle') }}</strong>
        <span>{{ $t('mail.loadErrorBody') }}</span>
        <button class="fixture-button" type="button" :disabled="isRefreshingInbox" @click="retryInboxLoad">
          {{ isRefreshingInbox ? $t('mail.loading') : $t('mail.retry') }}
        </button>
      </div>

      <section v-else-if="isGlobalSearch" class="search-results" :aria-label="$t('mail.searchResults')">
        <p class="search-results-summary" aria-live="polite">
          <span v-if="searchLoading">{{ $t('mail.searching') }}</span>
          <span v-else>{{ $t(searchTotal === 1 ? 'mail.searchSummaryOne' : 'mail.searchSummaryMany', { messages: searchTotal, threads: globalSearchThreads.length }) }}</span>
        </p>
        <p v-if="searchExceedsLimit" class="search-limit-notice" role="status">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8.8 3.3a1.4 1.4 0 0 1 2.4 0l6.1 10.6a1.4 1.4 0 0 1-1.2 2.1H3.9a1.4 1.4 0 0 1-1.2-2.1z" />
            <path d="M10 7v4" />
            <circle cx="10" cy="13.7" r=".6" fill="currentColor" stroke="none" />
          </svg>
          <span>{{ $t('mail.searchLimit') }}</span>
        </p>
        <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>
        <p v-else-if="searchLoading && !globalSearchThreads.length" class="search-empty">{{ $t('mail.searchingMessages') }}</p>
        <p v-else-if="!globalSearchThreads.length" class="search-empty">{{ $t('mail.searchNoResults', { query: search.trim() }) }}</p>
        <div v-else class="thread-list search-result-list" role="list">
          <div v-for="thread in globalSearchThreads" :key="thread.id" role="listitem">
            <button class="thread-row search-result-row" type="button" @click="openMessage(thread.latest)">
                <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }" :title="thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : undefined">
                <MailSenderAvatar :initials="thread.latest.initials" :color="thread.latest.color" v-bind="threadAvatarFor(thread.latest)" />
                <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
              </span>
              <span class="thread-content">
                <span class="thread-subject">{{ thread.subject }}</span>
                <span class="thread-preview"><span class="search-folder-label">{{ mailboxByName(thread.latest.folder).label }}</span><span aria-hidden="true"> · </span><span class="thread-sender-badge">{{ thread.latest.sender }}</span><span aria-hidden="true"> · </span>{{ thread.snippet || thread.latest.preview }}</span>
              </span>
              <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
              <time class="thread-date" :datetime="thread.latest.timestamp" :title="absoluteMailDate(thread.latest.timestamp)">{{ relativeMailDate(thread.latest.timestamp) }}</time>
            </button>
          </div>
        </div>
        <button v-if="searchHasMore" class="search-load-more" type="button" :disabled="searchLoading" @click="loadMoreSearchResults">
          {{ searchLoading ? $t('mail.loading') : $t('mail.showMoreResults') }}
        </button>
      </section>

      <MailScreenerPanel
        v-else-if="activeFolder === 'Screener'"
        :model="mailScreener"
        :folders="mailboxes"
        :absolute-mail-date="absoluteMailDate"
        :relative-mail-date="relativeMailDate"
        :thread-avatar-for="threadAvatarFor"
        :open-message="openMessage"
      />

      <template v-else-if="activeFolder === 'Imbox' && visibleThreads.length">
        <section v-if="newThreads.length" class="message-group message-group-new" aria-labelledby="new-messages-heading">
          <header class="group-heading">
            <h2 id="new-messages-heading">{{ $t('mail.newMessages') }}</h2>
          </header>
          <div class="thread-list" role="list">
            <div v-for="thread in newThreads" :key="thread.id" class="thread-selection-row" :class="{ 'is-thread-selected': selectedThreadIds.includes(thread.id), 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :data-thread-selection-id="thread.id" :aria-current="keyboardSelectionThreadId === thread.id ? 'true' : undefined" role="listitem">
              <span class="unread-indicator" :class="{ 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :aria-label="$t(thread.unreadCount === 1 ? 'mail.unreadOne' : 'mail.unreadMany', { count: thread.unreadCount })">
                <svg v-if="keyboardSelectionThreadId === thread.id" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg>
              </span>
              <button class="thread-avatar-trigger" :class="{ 'is-selected': threadSelectionMode && selectedThreadIds.includes(thread.id), 'is-merged': thread.manualMergeIds.length }" type="button" :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(thread.id) ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')" :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(thread.id) : undefined" @click="handleThreadAvatarClick(thread.id, $event)">
                <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
                  <span v-if="threadSelectionMode && selectedThreadIds.includes(thread.id)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                  <MailSenderAvatar v-else :initials="thread.latest.initials" :color="thread.latest.color" v-bind="threadAvatarFor(thread.latest)" />
                  <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
                </span>
              </button>
              <MailboxThreadSummary :subject="thread.subject" :sender="thread.latest.sender" :preview="thread.latest.preview" :timestamp="thread.latest.timestamp" :display-date="relativeMailDate(thread.latest.timestamp)" :absolute-date="absoluteMailDate(thread.latest.timestamp)" :participants="otherThreadParticipants(thread)" :attachment-count="threadAttachmentCount(thread)" :message-count="thread.messages.length" :tags="thread.tags" :new-message-label="['Set Aside', 'Reply Later'].includes(activeFolder) && thread.unreadCount && thread.messages.length > 1 ? $t('mail.newMessageInThread') : ''" @open="handleThreadRowClick(thread, $event)" />
            </div>
          </div>
        </section>

        <section v-if="previouslySeenThreads.length" class="message-group message-group-seen" aria-labelledby="seen-messages-heading">
          <header class="group-heading">
            <h2 id="seen-messages-heading">{{ $t('mail.previouslySeen') }}</h2>
          </header>
          <div class="thread-list" role="list">
            <div v-for="thread in previouslySeenThreads" :key="thread.id" class="thread-selection-row" :class="{ 'is-thread-selected': selectedThreadIds.includes(thread.id), 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :data-thread-selection-id="thread.id" :aria-current="keyboardSelectionThreadId === thread.id ? 'true' : undefined" role="listitem">
              <span v-if="keyboardSelectionThreadId === thread.id" class="thread-selection-cursor" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg></span>
              <button class="thread-avatar-trigger" :class="{ 'is-selected': threadSelectionMode && selectedThreadIds.includes(thread.id), 'is-merged': thread.manualMergeIds.length }" type="button" :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(thread.id) ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')" :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(thread.id) : undefined" @click="handleThreadAvatarClick(thread.id, $event)">
                <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
                  <span v-if="threadSelectionMode && selectedThreadIds.includes(thread.id)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                  <MailSenderAvatar v-else :initials="thread.latest.initials" :color="thread.latest.color" v-bind="threadAvatarFor(thread.latest)" />
                  <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
                </span>
              </button>
              <MailboxThreadSummary :subject="thread.subject" :sender="thread.latest.sender" :preview="thread.latest.preview" :timestamp="thread.latest.timestamp" :display-date="relativeMailDate(thread.latest.timestamp)" :absolute-date="absoluteMailDate(thread.latest.timestamp)" :participants="otherThreadParticipants(thread)" :attachment-count="threadAttachmentCount(thread)" :message-count="thread.messages.length" :tags="thread.tags" :new-message-label="['Set Aside', 'Reply Later'].includes(activeFolder) && thread.unreadCount && thread.messages.length > 1 ? $t('mail.newMessageInThread') : ''" @open="handleThreadRowClick(thread, $event)" />
            </div>
          </div>
        </section>
      </template>

      <div v-else-if="activeFolder === 'The Feed' && visibleFeedEditions.length" class="thread-list other-folder-list feed-edition-list" role="list">
        <div
          v-for="message in visibleFeedEditions"
          :key="message.id"
          class="other-thread-row thread-selection-row feed-edition-row"
          :class="{ 'is-thread-selected': selectedThreadIds.includes(message.threadId), 'is-selection-cursor': keyboardSelectionThreadId === message.threadId }"
          :data-thread-selection-id="message.threadId"
          :aria-current="keyboardSelectionThreadId === message.threadId ? 'true' : undefined"
          role="listitem"
        >
          <span v-if="!message.isRead" class="unread-indicator" :aria-label="$t('mail.unreadOne', { count: 1 })" />
          <span v-else-if="keyboardSelectionThreadId === message.threadId" class="thread-selection-cursor" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg></span>
          <button
            v-if="canSelectThreads"
            class="thread-avatar-trigger"
            :class="{ 'is-selected': threadSelectionMode && selectedThreadIds.includes(message.threadId), 'is-merged': message.manualMergeIds.length }"
            type="button"
            :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(message.threadId) ? 'mail.deselectThread' : 'mail.selectThread', { subject: message.subject }) + (message.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')"
            :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(message.threadId) : undefined"
            @click="handleThreadAvatarClick(message.threadId, $event)"
          >
            <span class="thread-avatar-wrap" :class="{ 'is-merged': message.manualMergeIds.length }">
              <span v-if="threadSelectionMode && selectedThreadIds.includes(message.threadId)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
              <MailSenderAvatar v-else :initials="message.initials" :color="message.color" v-bind="threadAvatarFor(message)" />
              <span v-if="message.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
            </span>
          </button>
          <MailboxThreadSummary
            :subject="message.subject"
            :sender="message.sender"
            :preview="message.preview"
            :timestamp="message.timestamp"
            :display-date="relativeMailDate(message.timestamp)"
            :absolute-date="absoluteMailDate(message.timestamp)"
            :participants="[]"
            :attachment-count="message.attachments.length"
            :message-count="1"
            :tags="message.tags"
            @open="handleFeedEditionOpen(message, $event)"
          />
        </div>
      </div>

      <div v-else-if="activeFolder !== 'Screener' && visibleThreads.length" class="thread-list other-folder-list" role="list">
        <div v-for="thread in visibleThreads" :key="thread.id" class="other-thread-row thread-selection-row" :class="{ 'is-thread-selected': selectedThreadIds.includes(thread.id), 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :data-thread-selection-id="thread.id" :aria-current="keyboardSelectionThreadId === thread.id ? 'true' : undefined" role="listitem">
          <span v-if="thread.unreadCount" class="unread-indicator" :class="{ 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :aria-label="$t(thread.unreadCount === 1 ? 'mail.unreadOne' : 'mail.unreadMany', { count: thread.unreadCount })">
            <svg v-if="keyboardSelectionThreadId === thread.id" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg>
          </span>
          <span v-else-if="keyboardSelectionThreadId === thread.id" class="thread-selection-cursor" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg></span>
          <button v-if="canSelectThreads" class="thread-avatar-trigger" :class="{ 'is-selected': threadSelectionMode && selectedThreadIds.includes(thread.id), 'is-merged': thread.manualMergeIds.length }" type="button" :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(thread.id) ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')" :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(thread.id) : undefined" @click="handleThreadAvatarClick(thread.id, $event)">
            <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
              <span v-if="threadSelectionMode && selectedThreadIds.includes(thread.id)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
              <MailSenderAvatar v-else :initials="thread.latest.initials" :color="thread.latest.color" v-bind="threadAvatarFor(thread.latest)" />
              <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
            </span>
          </button>
          <MailboxThreadSummary :subject="thread.subject" :sender="thread.latest.sender" :preview="thread.latest.preview" :timestamp="thread.latest.timestamp" :display-date="relativeMailDate(thread.latest.timestamp)" :absolute-date="absoluteMailDate(thread.latest.timestamp)" :participants="otherThreadParticipants(thread)" :attachment-count="threadAttachmentCount(thread)" :message-count="thread.messages.length" :tags="thread.tags" :new-message-label="['Set Aside', 'Reply Later'].includes(activeFolder) && thread.unreadCount && thread.messages.length > 1 ? $t('mail.newMessageInThread') : ''" @open="handleThreadRowClick(thread, $event)" />
          <button v-if="activeFolder === 'Trash'" class="screener-restore trash-restore" type="button" :disabled="isSavingScreenerAction" @click="restoreTrashedMessage(thread.latest)">{{ $t('mail.restore') }}</button>
        </div>
      </div>

      <div v-else class="empty-list">
        <svg class="empty-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8.5" /><path d="m20 20 6 6" /></svg>
        <strong>{{ $t(activeFolder === 'Screener' ? 'mail.emptyScreenerTitle' : activeFolder === 'Trash' ? 'mail.emptyTrashTitle' : activeFolder === 'Set Aside' ? 'mail.emptySetAsideTitle' : activeFolder === 'Reply Later' ? 'mail.emptyReplyLaterTitle' : 'mail.emptyFolderTitle') }}</strong>
        <span>{{ $t(search ? 'mail.emptySearchHint' : activeFolder === 'Screener' ? 'mail.emptyScreenerHint' : activeFolder === 'Trash' ? 'mail.emptyTrashHint' : activeFolder === 'Set Aside' ? 'mail.emptySetAsideHint' : activeFolder === 'Reply Later' ? 'mail.emptyReplyLaterHint' : 'mail.emptyFolderHint') }}</span>
        <button v-if="isDevelopment && activeFolder === 'Imbox' && !search" class="fixture-button" type="button" :disabled="isImportingFixture" @click="importFixture">
          {{ isImportingFixture ? $t('mail.importFixture') : $t('mail.loadFixture') }}
        </button>
        <span v-if="fixtureError" class="fixture-error" role="alert">{{ fixtureError }}</span>
      </div>

      <section v-if="showSetAsideStack" class="mail-stack set-aside-stack" data-stack-kind="set-aside" :class="{ 'is-expanded': isSetAsideStackExpanded, 'is-paired': showReplyLaterStack }" :style="{ '--set-aside-expanded-height': setAsideStackExpandedHeight }" :aria-label="$t('mail.setAsideStackLabel')">
        <div class="set-aside-stack-stage">
          <div id="set-aside-stack-expanded" class="set-aside-stack-expanded" role="group" :aria-label="$t(isSetAsideStackExpanded ? 'mail.setAsideStackExpanded' : 'mail.setAsideStackCollapsed')">
            <div class="set-aside-stack-cards" :class="{ 'is-expanded': isSetAsideStackExpanded }">
              <button
                v-for="(thread, index) in setAsideStackPreview"
                :key="thread.id"
                class="set-aside-stack-card"
                type="button"
                :class="{ 'is-front-card': index === 0 }"
                :aria-label="!isSetAsideStackExpanded && index === 0 ? $t('mail.expandSetAsideStack') : undefined"
                :aria-hidden="!isSetAsideStackExpanded && index > 0 ? 'true' : undefined"
                :tabindex="!isSetAsideStackExpanded && index > 0 ? -1 : undefined"
                :style="{ '--stack-index': index, '--stack-rotation': `${index % 2 ? 0.15 : -0.1}deg`, '--stack-offset': `${index % 2 ? 3 : -2}px`, zIndex: setAsideStackPreview.length - index + 1 }"
                @click="openOrFollowStackCard(isSetAsideStackExpanded, 'set-aside', thread)"
              >
                <MailSenderAvatar class="set-aside-stack-avatar" :initials="thread.latest.initials" :color="thread.latest.color" v-bind="threadAvatarFor(thread.latest)" />
                <span class="set-aside-stack-copy">
                  <strong>{{ thread.subject }}</strong>
                  <span>{{ thread.latest.sender }} · {{ thread.latest.preview }}</span>
                </span>
                <time :datetime="thread.latest.timestamp" :title="absoluteMailDate(thread.latest.timestamp)">{{ relativeMailDate(thread.latest.timestamp) }}</time>
                <span v-if="!isSetAsideStackExpanded && index === 0" class="set-aside-stack-count">{{ setAsideThreads.length }}</span>
              </button>
            </div>
            <NuxtLink class="set-aside-stack-all" :class="{ 'is-visible': isSetAsideStackExpanded }" :aria-hidden="!isSetAsideStackExpanded ? 'true' : undefined" :tabindex="isSetAsideStackExpanded ? undefined : -1" :to="mailboxPath('Set Aside')">{{ $t('mail.viewSetAside') }} <span aria-hidden="true">→</span></NuxtLink>
          </div>
        </div>
        <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ $t(isSetAsideStackExpanded ? 'mail.setAsideStackExpanded' : 'mail.setAsideStackCollapsed') }}.</span>
      </section>

      <section v-if="showReplyLaterStack" class="mail-stack set-aside-stack reply-later-stack" data-stack-kind="reply-later" :class="{ 'is-expanded': isReplyLaterStackExpanded, 'is-paired': showSetAsideStack }" :style="{ '--set-aside-expanded-height': replyLaterStackExpandedHeight }" :aria-label="$t('mail.replyLaterStackLabel')">
        <div class="set-aside-stack-stage">
          <div id="reply-later-stack-expanded" class="set-aside-stack-expanded" role="group" :aria-label="$t(isReplyLaterStackExpanded ? 'mail.replyLaterStackExpanded' : 'mail.replyLaterStackCollapsed')">
            <div class="set-aside-stack-cards" :class="{ 'is-expanded': isReplyLaterStackExpanded }">
              <button
                v-for="(thread, index) in replyLaterStackPreview"
                :key="thread.id"
                class="set-aside-stack-card reply-later-stack-card"
                type="button"
                :class="{ 'is-front-card': index === 0 }"
                :aria-label="!isReplyLaterStackExpanded && index === 0 ? $t('mail.expandReplyLaterStack') : undefined"
                :aria-hidden="!isReplyLaterStackExpanded && index > 0 ? 'true' : undefined"
                :tabindex="!isReplyLaterStackExpanded && index > 0 ? -1 : undefined"
                :style="{ '--stack-index': index, '--stack-rotation': `${index % 2 ? 0.15 : -0.1}deg`, '--stack-offset': `${index % 2 ? 3 : -2}px`, zIndex: replyLaterStackPreview.length - index + 1 }"
                @click="openOrFollowStackCard(isReplyLaterStackExpanded, 'reply-later', thread)"
              >
                <MailSenderAvatar class="set-aside-stack-avatar" :initials="thread.latest.initials" :color="thread.latest.color" v-bind="threadAvatarFor(thread.latest)" />
                <span class="set-aside-stack-copy">
                  <strong>{{ thread.subject }}</strong>
                  <span>{{ thread.latest.sender }} · {{ thread.latest.preview }}</span>
                </span>
                <time :datetime="thread.latest.timestamp" :title="absoluteMailDate(thread.latest.timestamp)">{{ relativeMailDate(thread.latest.timestamp) }}</time>
                <span v-if="!isReplyLaterStackExpanded && index === 0" class="set-aside-stack-count reply-later-stack-count">{{ replyLaterThreads.length }}</span>
              </button>
            </div>
            <NuxtLink class="set-aside-stack-all reply-later-stack-all" :class="{ 'is-visible': isReplyLaterStackExpanded }" :aria-hidden="!isReplyLaterStackExpanded ? 'true' : undefined" :tabindex="isReplyLaterStackExpanded ? undefined : -1" :to="mailboxPath('Reply Later')">{{ $t('mail.viewReplyLater') }} <span aria-hidden="true">→</span></NuxtLink>
          </div>
        </div>
        <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ $t(isReplyLaterStackExpanded ? 'mail.replyLaterStackExpanded' : 'mail.replyLaterStackCollapsed') }}.</span>
      </section>
    </section>

    <section v-else-if="selectedMessage" class="reading-column" :aria-label="$t('mail.selectedMessage')">
      <div class="thread-subject-header">
        <div v-if="isEditingThreadSubject" class="thread-subject-editor">
          <form @submit.prevent="saveThreadSubject">
            <input
              ref="threadSubjectInput"
              v-model="threadSubjectDraft"
              class="thread-subject-input"
              type="text"
              maxlength="200"
              :aria-label="$t('rename.input')"
              autofocus
            >
            <div class="thread-subject-editor-actions">
              <span v-if="threadSubjectSaveError" class="thread-subject-error" role="alert">{{ threadSubjectSaveError }}</span>
              <button type="button" class="thread-subject-cancel" @click="cancelThreadSubjectEdit">{{ $t('rename.cancel') }}</button>
              <button type="submit" class="thread-subject-save" :disabled="isSavingThreadSubject">
                {{ isSavingThreadSubject ? $t('rename.saving') : $t('rename.save') }}
              </button>
            </div>
          </form>
          <p>{{ $t('rename.privacy') }}</p>
        </div>
        <div v-else class="message-subject-heading">
          <h1 ref="threadSubjectHeading" class="message-subject" @mouseup="updateSubjectSelection" @keyup="updateSubjectSelection" @contextmenu="openSubjectContextMenu">
            {{ isFeedReader ? activeThreadMessage?.subject : selectedThread?.messages.find(message => message.threadSubject)?.threadSubject || chronologicalMessages[0]?.subject || selectedMessage.subject }}
          </h1>
          <NTooltip v-if="subjectSelection.visible" :content="$t('rename.action')">
            <button class="thread-subject-selection-edit" type="button" :aria-label="$t('rename.action')" :style="{ left: `${subjectSelection.left}px`, top: `${subjectSelection.top}px` }" @mousedown.prevent @click="beginThreadSubjectEdit">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13.5 3.5 3 3M4 16l3.6-.8L16 6.8a2.1 2.1 0 0 0-3-3l-8.4 8.4L4 16Z" /></svg>
            </button>
          </NTooltip>
          <div v-if="subjectContextMenu.open" class="thread-subject-context-menu" role="menu" :style="{ left: `${subjectContextMenu.left}px`, top: `${subjectContextMenu.top}px` }" @pointerdown.stop>
            <button type="button" role="menuitem" @click="beginThreadSubjectEdit">{{ $t('rename.action') }}</button>
          </div>
        </div>
      </div>
      <div v-if="threadActionFeedback" class="thread-action-notice" role="status">{{ threadActionFeedback }}</div>
      <div v-if="threadActionError" class="thread-action-notice is-error" role="alert">{{ threadActionError }}</div>
      <div v-if="messageReadError" class="message-read-error" role="alert">
        <span>{{ messageReadError }}</span>
        <button v-if="selectedThread?.unreadCount" type="button" @click="retryMarkRead">{{ $t('mail.retryMarkRead') }}</button>
      </div>

      <article class="message-paper" :class="{ 'feed-reader-paper': isFeedReader, 'inbox-reader-paper': isInboxReader }" :aria-label="isFeedReader && activeThreadMessage ? $t('mail.messageFrom', { sender: activeThreadMessage.sender }) : undefined">
        <div v-if="!isFeedReader && selectedThread?.manualMergeIds.length" class="merged-thread-control">
          <span>{{ $t('mail.mergedConversationNote') }}</span>
          <button type="button" class="thread-split-button" :disabled="isSplittingThread" @click="splitDialogOpen = true">
            {{ isSplittingThread ? $t('mail.splitting') : $t('mail.splitThreads') }}
          </button>
        </div>
        <div v-if="isFeedReader && activeThreadMessage" class="feed-reader-content">
          <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ feedEditionAnnouncement }}</span>

          <header class="feed-issue-sender">
            <div class="message-meta">
              <NuxtLink v-if="!activeThreadMessage.isOutgoing" class="sender-profile-avatar" :to="senderPath(activeThreadMessage.address)" :aria-label="$t('mail.openSenderPage', { sender: activeThreadMessage.sender })">
                <MailSenderAvatar class="meta-avatar" :initials="activeThreadMessage.initials" :color="activeThreadMessage.color" v-bind="senderAvatarFor(activeThreadMessage)" />
              </NuxtLink>
              <span v-else class="sender-profile-avatar" aria-hidden="true">
                <MailSenderAvatar class="meta-avatar" :initials="activeThreadMessage.initials" :color="activeThreadMessage.color" v-bind="senderAvatarFor(activeThreadMessage)" />
              </span>
              <span class="meta-copy">
                <NuxtLink v-if="!activeThreadMessage.isOutgoing" class="sender-profile-name" :to="senderPath(activeThreadMessage.address)">{{ activeThreadMessage.sender }}</NuxtLink>
                <span v-else class="sender-profile-name">{{ activeThreadMessage.sender }}</span>
                <span v-if="activeThreadMessage.isOutgoing" class="sender-recipient-links">
                  {{ $t('mail.recipient') }}
                  <template v-if="recipientAddresses(activeThreadMessage.recipient).length">
                    <NuxtLink v-for="email in recipientAddresses(activeThreadMessage.recipient)" :key="email" class="sender-profile-link" :to="senderPath(email)">{{ email }}</NuxtLink>
                  </template>
                  <span v-else>{{ activeThreadMessage.recipient }}</span>
                </span>
                <NuxtLink v-else class="sender-profile-link" :to="senderPath(activeThreadMessage.address)">{{ activeThreadMessage.address }}</NuxtLink>
              </span>
            </div>
          </header>
          <div class="feed-issue-body" @touchstart.passive="rememberFeedTouch" @touchend.passive="finishFeedTouch" @touchcancel.passive="feedTouchOrigin = null">
            <div class="feed-issue-text">
              <p v-if="activeThreadMessage.body === undefined && isThreadContentLoading" role="status">{{ $t('mail.loading') }}</p>
              <p v-else-if="activeThreadMessage.body === undefined" role="alert">{{ $t('mail.loadErrorBody') }}</p>
              <template v-else>
                <p v-for="(paragraph, paragraphIndex) in activeThreadMessage.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p>
                <p v-if="!activeThreadMessage.body.trim()" class="feed-empty-body">{{ $t('mail.emptyMessageBody') }}</p>
              </template>
            </div>
            <div v-if="activeThreadMessage.attachments.length" class="attachment-list" :aria-label="$t('mail.attachments')">
              <span class="attachment-heading">{{ $t(activeThreadMessage.attachments.length === 1 ? 'mail.attachmentCountOne' : 'mail.attachmentCountMany', { count: activeThreadMessage.attachments.length }) }}</span>
              <a v-for="attachment in activeThreadMessage.attachments" :key="attachment.id" class="attachment-item" :href="'/api/attachments/' + attachment.id" :download="attachment.filename" :aria-label="$t('mail.downloadAttachment', { filename: attachment.filename })">
                <span aria-hidden="true">↳</span>
                <strong>{{ attachment.filename }}</strong>
                <span>{{ Math.max(1, Math.round(attachment.sizeBytes / 1024)) }} Ko</span>
              </a>
            </div>
          </div>
          <div class="feed-issue-date">
            <NTooltip :content="absoluteMailDate(activeThreadMessage.timestamp)">
              <time :datetime="activeThreadMessage.timestamp">{{ relativeMailDate(activeThreadMessage.timestamp) }}</time>
            </NTooltip>
          </div>
        </div>

        <div v-else class="thread-carousel">
          <div v-if="chronologicalMessages.length > 1" class="thread-carousel-header">
            <div class="thread-carousel-status">
              <span class="thread-carousel-position" aria-live="polite">{{ $t('mail.messagePosition', { current: activeThreadMessageIndex + 1, total: chronologicalMessages.length }) }}</span>
              <NTooltip :content="$t(isReadingAll ? 'mail.readOneAtATime' : 'mail.readWholeConversation')">
                <button
                  class="thread-read-all"
                  type="button"
                  :aria-label="$t(isReadingAll ? 'mail.readOneAtATime' : 'mail.readWholeConversation')"
                  :aria-pressed="isReadingAll"
                  @click="toggleReadAll"
                >
                  <svg v-if="!isReadingAll" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M6 3.5h8.5A1.5 1.5 0 0 1 16 5v10.5M4.5 6H13a1.5 1.5 0 0 1 1.5 1.5V17H6a1.5 1.5 0 0 1-1.5-1.5z" />
                    <path d="M7 9h5.5M7 12h5.5" />
                  </svg>
                  <svg v-else viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="3.5" y="4" width="13" height="12" rx="1.5" />
                    <path d="M6.5 8h7M6.5 11h7" />
                  </svg>
                </button>
              </NTooltip>
            </div>
          </div>

          <div
            v-if="chronologicalMessages.length > 1"
            class="thread-carousel-navigation"
            :style="{ '--thread-navigation-width': Math.min(chronologicalMessages.length * 240 + 96, 1050) + 'px' }"
            :aria-label="$t('mail.conversationNavigation')"
          >
            <button
              class="thread-carousel-arrow"
              type="button"
              :aria-label="$t('mail.previousMessage')"
              :disabled="activeThreadMessageIndex <= 0"
              @click="navigateThreadMessage(-1)"
            >‹</button>
            <div
              class="thread-message-rail-viewport"
              :class="{ 'can-scroll-start': railCanScrollStart, 'can-scroll-end': railCanScrollEnd }"
            >
              <span v-if="railCanScrollStart" class="thread-message-rail-fade thread-message-rail-fade-start" aria-hidden="true" />
              <div ref="threadMessageRail" class="thread-message-rail" role="group" :aria-label="$t('mail.conversationMessages')" @scroll="updateThreadRailOverflow">
                <button
                  v-for="(message, index) in chronologicalMessages"
                  :id="'thread-message-tab-' + message.id"
                  :key="message.id"
                  class="thread-message-tab"
                  :class="message.id === activeThreadMessage?.id ? 'is-active' : undefined"
                  type="button"
                  :aria-pressed="message.id === activeThreadMessage?.id"
                  @click="selectThreadMessage(message.id)"
                >
                  <span class="thread-tab-heading">
                    <MailSenderAvatar class="thread-tab-avatar" :initials="message.initials" :color="message.color" v-bind="senderAvatarFor(message)" />
                    <span class="thread-tab-sender">{{ message.sender }}</span>
                    <NTooltip :content="absoluteMailDate(message.timestamp)">
                      <time :datetime="message.timestamp">{{ relativeMailDate(message.timestamp) }}</time>
                    </NTooltip>
                  </span>
                  <span class="thread-tab-preview">{{ message.preview || $t('mail.emptyMessageBody') }}</span>
                  <span class="sr-only">{{ $t('mail.messagePosition', { current: index + 1, total: chronologicalMessages.length }) }}</span>
                </button>
              </div>
              <span v-if="railCanScrollEnd" class="thread-message-rail-fade thread-message-rail-fade-end" aria-hidden="true" />
            </div>
            <button
              class="thread-carousel-arrow"
              type="button"
              :aria-label="$t('mail.nextMessage')"
              :disabled="activeThreadMessageIndex >= chronologicalMessages.length - 1"
              @click="navigateThreadMessage(1)"
            >›</button>
          </div>

          <div v-if="!isReadingAll" class="thread-carousel-stage" aria-live="polite">
            <Transition :name="threadSlideDirection > 0 ? 'message-slide-next' : 'message-slide-prev'" mode="out-in">
            <MailThreadMessageCard
              v-if="activeThreadMessage"
              :key="activeThreadMessage.id"
              :message="activeThreadMessage"
              :is-inbox-reader="isInboxReader"
              :is-loading="isThreadContentLoading"
              :show-back-button="isInboxReader"
              :folder-label="mailboxByName(activeFolder).label"
              :avatar="senderAvatarFor(activeThreadMessage)"
              :participants="selectedThreadParticipants"
              :show-participants="selectedThreadParticipants.length > 1"
              @close="closeMessage"
            />
            </Transition>
          </div>

          <div v-else class="thread-full-thread">
            <MailThreadMessageCard
              v-for="(message, index) in chronologicalMessages"
              :key="message.id"
              variant="full"
              :message="message"
              :is-inbox-reader="isInboxReader"
              :is-loading="isThreadContentLoading"
              :is-selected="message.id === activeThreadMessage?.id"
              :show-back-button="isInboxReader && index === 0"
              :folder-label="mailboxByName(activeFolder).label"
              :avatar="senderAvatarFor(message)"
              :participants="selectedThreadParticipants"
              :show-participants="index === chronologicalMessages.length - 1 && selectedThreadParticipants.length > 1"
              @close="closeMessage"
            />
          </div>
        </div>
      </article>

      <form v-if="replyComposerOpen" class="reply-composer" @submit.prevent="requestReplySend">
        <div class="reply-composer-to"><span>{{ $t('mail.recipient') }}</span><strong>{{ replyRecipient }}</strong></div>
        <label class="sr-only" for="reply-body">{{ $t('mail.yourReply') }}</label>
        <textarea id="reply-body" v-model="replyBody" autofocus :placeholder="$t('mail.replyPlaceholder')" :disabled="replyLoading || replySending || replyDraftStatus === 'sending'" />
        <p v-if="replyError" class="reply-error" role="alert">{{ replyError }}</p>
        <div class="reply-composer-footer">
          <span class="reply-save-status" role="status">{{ replyLoading ? $t('mail.replyLoading') : replyDraftStatus === 'sending' ? $t('mail.replyAlreadySending') : replySaving ? $t('mail.saving') : replySaved ? $t('mail.replySaved') : $t('mail.replyNotSaved') }}</span>
          <button type="button" class="reply-secondary" :disabled="replySending" @click="replyComposerOpen = false">{{ $t('mail.reduce') }}</button>
          <button type="submit" class="reply-send" :disabled="replySending || replySaving || replyDraftStatus === 'sending' || !replyBody.trim()">
            {{ replySending ? $t('mail.sending') : $t('palette.send') }}
          </button>
        </div>
      </form>
      <Teleport to="body">
        <Transition name="message-action-dock" appear>
          <div class="message-action-dock" :class="{ 'has-feed-edition-navigation': isFeedReader && activeThreadMessage }" role="toolbar" :aria-label="$t('mail.messageActions')">
            <nav v-if="isFeedReader && activeThreadMessage" class="feed-edition-navigation feed-edition-navigation-dock" :aria-label="$t('mail.feedNavigation')">
              <button class="feed-edition-button" type="button" :aria-label="$t('mail.previousEdition')" :disabled="feedEditionIndex <= 0" @click="navigateFeedEdition(-1)">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" /></svg>
              </button>
              <span class="feed-edition-position" aria-hidden="true">{{ feedEditionIndex + 1 }} / {{ feedEditions.length }}</span>
              <button class="feed-edition-button is-next" type="button" :aria-label="$t('mail.nextEdition')" :disabled="feedEditionIndex >= feedEditions.length - 1" @click="navigateFeedEdition(1)">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
              </button>
            </nav>
            <div class="message-action-group">
              <button v-if="!replyComposerOpen && activeFolder !== 'Trash'" class="message-action-reply" type="button" @click="openReplyComposer">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5 3.5 9.5 8 14M4 9.5h7a5.5 5.5 0 0 1 5.5 5.5" /></svg>
                <span>{{ $t('mail.reply') }}</span><kbd>R</kbd>
              </button>
              <button v-if="activeFolder !== 'Trash'" class="message-action-button" type="button" :aria-label="$t(isMarkingThreadUnseen ? 'messageActions.markingUnseen' : 'messageActions.markUnseen')" :disabled="isMarkingThreadUnseen || isMovingOpenThread" @click="markOpenThreadUnseen">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 4.5h15v11h-15z" /><path d="m3 5 7 5.5L17 5" /><circle cx="15.5" cy="4" r="2.5" /></svg>
                <span class="message-action-label">{{ isMarkingThreadUnseen ? $t('messageActions.markingUnseen') : $t('messageActions.markUnseen') }}</span><kbd>U</kbd>
              </button>
              <button v-if="activeFolder !== 'Trash'" class="message-action-button" type="button" :aria-label="$t('messageActions.forward')" :disabled="isMarkingThreadUnseen || isMovingOpenThread" @click="forwardActiveMessage">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5 17.5 10 11 16.5v-4c-4.4 0-7 1.2-8.5 4 .2-5.1 2.8-8 8.5-8v-5Z" /></svg>
                <span class="message-action-label">{{ $t('messageActions.forward') }}</span>
              </button>
              <NCombobox
                v-if="['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(activeFolder)"
                class="thread-action-move"
                :items="bulkMoveOptions"
                by="value"
                :open="threadMoveMenuOpen"
                :disabled="isMarkingThreadUnseen || isMovingOpenThread"
                :_combobox-input="{ placeholder: $t('bulk.findFolder'), autocomplete: 'off', leading: 'i-lucide-search' }"
                :_combobox-list="{ align: 'start', side: 'top', sideOffset: 8, class: 'thread-action-move-list z-[120]' }"
                :_combobox-viewport="{ class: 'thread-action-move-viewport' }"
                :_combobox-trigger="{ class: 'thread-action-move-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('messageActions.moveToFolder') }"
                :_combobox-item="{ class: 'thread-action-move-item' }"
                :text-empty="$t('bulk.noFoldersFound')"
                @update:open="setThreadMoveMenuOpen"
                @update:model-value="moveOpenThread"
              >
                <template #trigger>
                  <svg class="thread-action-move-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h7l2 2h8v10h-17v-12Z" /><path d="M12 11v5m-2-2 2 2 2-2" /></svg>
                  <span class="message-action-label thread-action-move-label">{{ $t('messageActions.move') }}</span><kbd>V</kbd>
                </template>
              </NCombobox>
              <ThreadTagPicker v-if="canAssignTags && selectedThread" ref="threadTagPicker" :tags="workspaceTags" :assigned="selectedThread.tags" :message-ids="selectedThread.messages.map(message => message.id)" :can-manage="canManageTags" @changed="refreshTagAssignments" />
              <button v-if="activeFolder === 'Trash'" class="message-action-button" type="button" :aria-label="$t(isSavingScreenerAction ? 'mail.restoring' : 'mail.restore')" :disabled="isSavingScreenerAction" @click="restoreTrashedMessage(activeThreadMessage || selectedMessage)">
                <span class="message-action-icon i-tabler-mailbox" aria-hidden="true" />
                <span class="message-action-label">{{ isSavingScreenerAction ? $t('mail.restoring') : $t('mail.restore') }}</span>
              </button>
              <template v-else>
                <button v-if="activeFolder === 'Set Aside'" class="message-action-button" type="button" :aria-label="$t(isSavingSetAside ? 'mail.restoring' : 'mail.restoreToMailbox')" :disabled="isSavingSetAside" @click="setAsideThread(false)">
                  <span class="message-action-icon i-tabler-mailbox" aria-hidden="true" />
                  <span class="message-action-label">{{ isSavingSetAside ? $t('mail.restoring') : $t('mail.restoreToMailbox') }}</span><kbd>A</kbd>
                </button>
                <button v-else-if="activeFolder === 'Imbox'" class="message-action-button" type="button" :aria-label="isSavingSetAside ? $t('mail.setAsideSaving') : $t('bulk.setAside')" :disabled="isSavingSetAside" @click="setAsideThread(true)">
                  <span class="message-action-icon i-tabler-eggs" aria-hidden="true" />
                  <span class="message-action-label">{{ isSavingSetAside ? $t('mail.setAsideSaving') : $t('bulk.setAside') }}</span><kbd>A</kbd>
                </button>
                <button v-else-if="activeFolder !== 'Reply Later'" class="message-action-button" type="button" :aria-label="$t(selectedThread?.manualMergeIds.length ? 'mail.classify' : 'mail.move')" @click="openClassification(activeThreadMessage || selectedMessage)">
                  <span class="message-action-icon i-tabler-mailbox" aria-hidden="true" />
                  <span class="message-action-label">{{ $t(selectedThread?.manualMergeIds.length ? 'mail.classify' : 'mail.move') }}</span>
                </button>
                <button v-if="activeFolder === 'Reply Later'" class="message-action-button" type="button" :aria-label="$t(isSavingReplyLater ? 'mail.replyLaterRemoveSaving' : 'mail.removeFromReplyLater')" :disabled="isSavingReplyLater" @click="setReplyLater(false)">
                  <span class="message-action-icon i-tabler-message-reply" aria-hidden="true" />
                  <span class="message-action-label">{{ isSavingReplyLater ? $t('mail.replyLaterRemoveSaving') : $t('mail.removeFromReplyLater') }}</span><kbd>L</kbd>
                </button>
                <button v-else-if="activeFolder !== 'Set Aside'" class="message-action-button" type="button" :aria-label="$t(isSavingReplyLater ? 'mail.replyLaterSaving' : 'bulk.replyLater')" :disabled="isSavingReplyLater" @click="setReplyLater(true)">
                  <span class="message-action-icon i-tabler-message-reply" aria-hidden="true" />
                  <span class="message-action-label">{{ isSavingReplyLater ? $t('mail.replyLaterSaving') : $t('bulk.replyLater') }}</span><kbd>L</kbd>
                </button>
              </template>
              <NTooltip v-if="['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(activeFolder)" :content="$t('palette.trashActionDescription')">
                <button class="message-action-trash" type="button" :aria-label="$t('palette.trashTitle')" :disabled="isTrashingThread" @click="threadTrashDialogOpen = true">
                  <span class="message-action-trash-icon i-icon-park-outline-delete-themes" aria-hidden="true" />
                </button>
              </NTooltip>
            </div>
          </div>
        </Transition>
      </Teleport>
    </section>

    <NDialog
      :open="threadTrashDialogOpen"
      :title="$t('palette.trashTitle')"
      :description="$t('palette.trashDescriptionOne')"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!isTrashingThread) threadTrashDialogOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('palette.trashTitle') }}</NDialogTitle>
          <NDialogDescription>{{ $t('palette.trashDescriptionOne') }}</NDialogDescription>
        </header>
        <p v-if="bulkActionError" class="action-feedback-error" role="alert">{{ bulkActionError }}</p>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="isTrashingThread" @click="threadTrashDialogOpen = false">{{ $t('palette.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="isTrashingThread" @click="trashOpenThread">
            {{ isTrashingThread ? $t('palette.applying') : $t('palette.confirmTrash') }}
          </button>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="bulkTrashDialogOpen"
      :title="$t('palette.trashTitle')"
      :description="$t(selectedThreadIds.length === 1 ? 'palette.trashDescriptionOne' : 'palette.trashDescriptionMany', { count: selectedThreadIds.length })"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog thread-trash-dialog' }"
      @update:open="(open: boolean) => { if (!isApplyingBulkAction) bulkTrashDialogOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <NDialogTitle class="dialog-title">{{ $t('palette.trashTitle') }}</NDialogTitle>
          <NDialogDescription>{{ $t(selectedThreadIds.length === 1 ? 'palette.trashDescriptionOne' : 'palette.trashDescriptionMany', { count: selectedThreadIds.length }) }}</NDialogDescription>
        </header>
        <p v-if="bulkActionError" class="action-feedback-error" role="alert">{{ bulkActionError }}</p>
        <div class="dialog-actions">
          <button class="dialog-cancel" type="button" :disabled="isApplyingBulkAction" @click="bulkTrashDialogOpen = false">{{ $t('palette.cancel') }}</button>
          <button class="dialog-danger" type="button" :disabled="isApplyingBulkAction" @click="applyBulkAction('trash')">
            {{ isApplyingBulkAction ? $t('palette.applying') : $t('palette.confirmTrash') }}
          </button>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="Boolean(classificationTarget)"
      :title="$t('mail.classifyDialogTitle')"
      :description="classificationTarget ? `${classificationTarget.sender} — ${classificationTarget.address}` : undefined"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog' }"
      @update:open="(open: boolean) => { if (!open && !isSavingClassification) classificationTarget = null }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">{{ $t(classificationTarget?.folder === 'Screener' ? 'mail.newSender' : 'mail.classification') }}</p>
          <NDialogTitle class="dialog-title">{{ $t('mail.classifyDialogTitle') }}</NDialogTitle>
          <NDialogDescription class="sr-only">{{ $t('mail.chooseDestinationDescription') }}</NDialogDescription>
          <p class="dialog-sender">{{ classificationTarget?.sender }} <span>{{ classificationTarget?.address }}</span></p>
        </header>

        <fieldset class="classification-scope">
          <legend>{{ $t('mail.scope') }}</legend>
          <label v-if="selectedThread?.manualMergeIds.length" class="scope-option">
            <input v-model="classificationScope" type="radio" value="group">
            <span><strong>{{ $t('mail.thisConversation') }}</strong><small>{{ $t('mail.currentMessagesOnly') }}</small></span>
          </label>
          <label v-if="!selectedThread?.manualMergeIds.length" class="scope-option">
            <input v-model="classificationScope" type="radio" value="sender">
            <span><strong>{{ $t('mail.sender') }}</strong><small>{{ $t('mail.senderExistingAndFuture') }}</small></span>
          </label>
          <label v-if="!selectedThread?.manualMergeIds.length" class="scope-option">
            <input v-model="classificationScope" type="radio" value="message">
            <span><strong>{{ $t('mail.thisMessageOnly') }}</strong><small>{{ $t(classificationTarget?.hasSenderRule ? 'mail.futureFollowRule' : 'mail.othersRemainScreener') }}</small></span>
          </label>
          <p v-if="selectedThread?.manualMergeIds.length" class="classification-scope-note">
            {{ $t('mail.mergedClassificationWarning') }}
          </p>
        </fieldset>

        <fieldset class="classification-destinations">
          <legend>{{ $t('mail.folderDestination') }}</legend>
          <label v-for="folder in folders.filter(item => item.name !== 'Screener' && item.name !== 'Trash' && item.name !== 'Set Aside' && item.name !== 'Reply Later')" :key="folder.name" class="destination-option" :class="{ 'is-picked': classificationFolder === folder.name }">
            <input v-model="classificationFolder" type="radio" :value="folder.name">
            <span><strong>{{ folder.label }}</strong><small>{{ folder.description }}</small></span>
          </label>
        </fieldset>

        <p v-if="classificationError" class="dialog-error" role="alert">{{ classificationError }}</p>
        <footer class="dialog-actions">
          <NDialogClose as-child>
            <button class="dialog-cancel" type="button" :disabled="isSavingClassification">{{ $t('mail.cancel') }}</button>
          </NDialogClose>
          <button class="dialog-save" type="button" :disabled="isSavingClassification" @click="saveClassification">
            {{ $t(isSavingClassification ? 'mail.classifying' : classificationScope === 'sender' ? 'mail.classifySender' : classificationScope === 'group' ? 'mail.moveConversation' : 'mail.moveMessage') }}
          </button>
        </footer>
      </template>
    </NDialog>

    <NDialog
      :open="replySendConfirmOpen"
      :title="$t('mail.sendReplyTitle')"
      :description="$t('mail.verifyRecipient')"
      :_dialog-content="{ class: 'classification-dialog reply-confirm-dialog' }"
      @update:open="(open: boolean) => { replySendConfirmOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">{{ $t('mail.sendCheck') }}</p>
          <NDialogTitle class="dialog-title">{{ $t('mail.sendReplyTitle') }}</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">{{ $t('mail.replyWillSend', { recipient: replyRecipient }) }}</NDialogDescription>
        </header>
        <footer class="dialog-actions">
          <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="replySending">{{ $t('mail.continueWriting') }}</button></NDialogClose>
          <button class="dialog-save" type="button" :disabled="replySending" @click="sendReply">{{ replySending ? $t('mail.sending') : $t('palette.send') }}</button>
        </footer>
      </template>
    </NDialog>

    <NDialog
      :open="mergeDialogOpen"
      :title="$t('mail.mergeTitle')"
      :description="$t('mail.mergeDescription', { count: selectedThreadIds.length })"
      :_dialog-content="{ class: 'classification-dialog thread-merge-dialog' }"
      @update:open="(open: boolean) => { if (!isMergingThreads) mergeDialogOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">{{ mailboxByName(activeFolder).label }}</p>
          <NDialogTitle class="dialog-title">{{ $t('mail.mergeTitle') }}</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">{{ $t('mail.mergeDescriptionDetailed', { count: selectedThreadIds.length }) }}</NDialogDescription>
        </header>
        <p v-if="threadMergeError" class="dialog-error" role="alert">{{ threadMergeError }}</p>
        <footer class="dialog-actions">
          <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="isMergingThreads">{{ $t('mail.cancel') }}</button></NDialogClose>
          <button class="dialog-save" type="button" :disabled="isMergingThreads" @click="mergeSelectedThreads">{{ isMergingThreads ? $t('mail.merging') : $t('mail.mergeThreads') }}</button>
        </footer>
      </template>
    </NDialog>

    <NDialog
      :open="splitDialogOpen"
      :title="$t('mail.splitTitle')"
      :description="$t('mail.splitDescription')"
      :_dialog-content="{ class: 'classification-dialog thread-merge-dialog' }"
      @update:open="(open: boolean) => { if (!isSplittingThread) splitDialogOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">{{ $t('mail.mergedConversation') }}</p>
          <NDialogTitle class="dialog-title">{{ $t('mail.splitTitle') }}</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">{{ $t('mail.splitDescription') }}</NDialogDescription>
        </header>
        <p v-if="threadMergeError" class="dialog-error" role="alert">{{ threadMergeError }}</p>
        <footer class="dialog-actions">
          <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="isSplittingThread">{{ $t('mail.cancel') }}</button></NDialogClose>
          <button class="dialog-save" type="button" :disabled="isSplittingThread" @click="splitSelectedThread">{{ isSplittingThread ? $t('mail.splitting') : $t('mail.splitThreads') }}</button>
        </footer>
      </template>
    </NDialog>

    <OutgoingComposer v-if="composeOpen" v-model:open="composeOpen" :draft-id="composeDraftId" :initial-draft="composeInitialDraft" @sent="onOutgoingMessageSent" @show-drafts="goToDrafts" />
  </main>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import MailThreadMessageCard from '~/components/MailThreadMessageCard.vue'
import MailboxThreadSummary from '~/components/MailboxThreadSummary.vue'
import MailScreenerPanel from '~/components/MailScreenerPanel.vue'
import ThreadTagPicker from '~/components/ThreadTagPicker.vue'
import { useMailViewSearch, type SearchHit } from '~/composables/useMailViewSearch'
import { useMailScreener } from '~/composables/useMailScreener'
import { useMailReply } from '~/composables/useMailReply'
import { useMailThreadSelection } from '~/composables/useMailThreadSelection'
import { useMailThreadCollections } from '~/composables/useMailThreadCollections'
import { useMailThreadSubject } from '~/composables/useMailThreadSubject'
import { useMailThreadActions } from '~/composables/useMailThreadActions'
import { useScreenerKeyboardShortcuts } from '~/composables/useScreenerKeyboardShortcuts'
import { mailboxByName, mailboxFromPath, mailboxPath, mailboxes, senderPath, threadIdFromPath, threadPath, type MailboxKey } from '~/utils/mailbox-routing'

const OutgoingComposer = defineAsyncComponent(() => import('~/components/OutgoingComposer.vue'))

type Folder = MailboxKey
type StoredFolder = Exclude<Folder, 'Set Aside' | 'Reply Later'>
type MailboxFolder = Exclude<Folder, 'Screener' | 'Trash' | 'Set Aside' | 'Reply Later'>

type InboxMessage = {
  id: string
  threadId: string
  threadSubject: string | null
  manualMergeIds: string[]
  tags: WorkspaceTag[]
  sender: string
  address: string
  subject: string
  preview: string
  date: string
  timestamp: string
  folder: StoredFolder
  screenerState: 'pending' | 'cleared' | 'blocked'
  hasSenderRule: boolean
  senderRuleFolder: MailboxFolder | null
  isBlockedSender: boolean
  isRead: boolean
  isSetAside: boolean
  isReplyLater: boolean
  isOutgoing: boolean
  recipient: string
  mailboxDomain: string
  initials: string
  color: string
  body?: string
  htmlBody?: string
  attachments: { id: string, filename: string, mimeType: string, sizeBytes: number }[]
}

type MessageThread = {
  id: string
  messages: InboxMessage[]
  latest: InboxMessage
  subject: string
  unreadCount: number
  manualMergeIds: string[]
  tags: WorkspaceTag[]
}

type WorkspaceTag = { id: string, name: string, color: string }

type ThreadParticipant = {
  address: string
  name: string
  initials: string
  color: 'terracotta' | 'blue' | 'green' | 'gold'
  avatarUrl?: string | null
  logoUrl?: string | null
}

type SearchThread = MessageThread & {
  snippet: string
}

function recipientAddresses(value: string) {
  const matches = value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi) || []
  return [...new Set(matches.map(address => address.trim().toLocaleLowerCase('en-US')))]
}

const accountSession = useState<{ user: { email: string } } | null>('courrier-account-session', () => null)

function threadParticipants(thread: MessageThread): ThreadParticipant[] {
  const currentAddress = accountSession.value?.user.email.trim().toLocaleLowerCase('en-US')
  const participants = new Map<string, Omit<ThreadParticipant, 'initials'>>()
  const colors: ThreadParticipant['color'][] = ['terracotta', 'blue', 'green', 'gold']
  const stableColor = (address: string, preferred?: string): ThreadParticipant['color'] => {
    if (preferred && colors.includes(preferred as ThreadParticipant['color'])) return preferred as ThreadParticipant['color']
    const hash = [...address].reduce((value, char) => (value * 31 + char.charCodeAt(0)) | 0, 7)
    return colors[Math.abs(hash) % colors.length]!
  }

  for (const message of thread.messages) {
    const senderAddress = message.address.trim().toLocaleLowerCase('en-US')
    if (!message.isOutgoing && senderAddress && senderAddress !== currentAddress && !participants.has(senderAddress)) {
      participants.set(senderAddress, { address: senderAddress, name: message.sender || senderAddress, color: stableColor(senderAddress, message.color) })
    }

    for (const address of recipientAddresses(message.recipient)) {
      if (address === currentAddress || participants.has(address)) continue
      const knownSender = thread.messages.find(candidate => candidate.address.trim().toLocaleLowerCase('en-US') === address)
      participants.set(address, { address, name: knownSender?.sender || address, color: stableColor(address, knownSender?.color) })
    }
  }

  return [...participants.values()].map((participant) => {
    const words = participant.name.split(/\s+/).filter(Boolean)
    const initials = words.length > 1
      ? `${words[0]?.[0] || ''}${words.at(-1)?.[0] || ''}`
      : (words[0] || participant.address).slice(0, 2)
    return {
      ...participant,
      initials: initials.toLocaleUpperCase('fr'),
      ...participantAvatars.value[participant.address],
    }
  })
}

function threadAttachmentCount(thread: MessageThread) {
  return thread.messages.reduce((total, message) => total + message.attachments.length, 0)
}

function uniqueTags(tags: WorkspaceTag[]) {
  return [...new Map(tags.map(tag => [tag.id, tag])).values()]
}

function otherThreadParticipants(thread: MessageThread) {
  const latestSender = thread.latest.address.trim().toLocaleLowerCase('en-US')
  return threadParticipants(thread).filter(participant => participant.address !== latestSender)
}

const folders = mailboxes
const { $t } = useI18n()
const { locale } = useI18nLocale()
const route = useRoute()
const router = useRouter()
const activeFolder = computed(() => mailboxFromPath(route.path))
const selectedTagId = computed(() => typeof route.query.tag === 'string' ? route.query.tag : '')
const searchExceedsLimit = computed(() => search.value.trim().length > 200)
const search = computed({
  get: () => typeof route.query.q === 'string' ? route.query.q : '',
  set: (value: string) => {
    const query = { ...route.query }
    if (value.trim()) query.q = value
    else delete query.q
    if (value !== search.value) void router.replace({ path: route.path, query })
  },
})
const {
  isGlobalSearch,
  loadMoreSearchResults,
  searchError,
  searchHasMore,
  searchLoading,
  searchResults,
  searchTotal,
} = useMailViewSearch(search, activeFolder)
const selectedId = computed(() => threadIdFromPath(route.path))
const isReadingMessage = computed(() => Boolean(selectedId.value))
const threadTagPicker = ref<{
  openPicker: () => Promise<void>
  closePicker: () => Promise<void>
  isPickerOpen: () => boolean
} | null>(null)
const openedFromList = ref(false)
const classificationTarget = ref<InboxMessage | null>(null)
const classificationScope = ref<'sender' | 'message' | 'group'>('sender')
const classificationFolder = ref<MailboxFolder>('Imbox')
const screenerActionError = ref('')
const isSetAsideStackExpanded = ref(false)
const isReplyLaterStackExpanded = ref(false)
const viewportHeight = ref(800)
const threadMergeFeedback = ref('')
const threadMergeError = ref('')
const activityRefreshRevision = useState('courrier-activity-refresh-revision', () => 0)
const mailStateRefreshRevision = useState('courrier-mail-state-refresh-revision', () => 0)
const isSavingScreenerAction = ref(false)
const isSavingSetAside = ref(false)
const isSavingReplyLater = ref(false)
const isSavingClassification = ref(false)
const isUndoingClassification = ref(false)
const undoClassificationId = useState('courrier-undo-classification-id', () => '')
const classificationError = ref('')
const classificationFeedback = useState('courrier-classification-feedback', () => '')
const classificationActionError = useState('courrier-classification-action-error', () => '')
const messageReadError = ref('')
const isRefreshingInbox = ref(false)
const composeOpen = ref(false)
const composeDraftId = ref<string | null>(null)
const composeInitialDraft = ref<{ to: string, subject: string, body: string } | null>(null)
const composeDraftRequest = useState<{ to: string, subject: string, body: string } | null>('courrier-compose-draft-request', () => null)
const isDevelopment = import.meta.dev
const composeRequest = useState('courrier-compose-request', () => 0)
const paletteContext = useState<{ source: MailboxKey, threadIds: string[], screenerPendingCount: number }>('courrier-palette-context', () => ({ source: 'Imbox', threadIds: [], screenerPendingCount: 0 }))
const screenerClearRequest = useState('courrier-screener-clear-request', () => 0)
const paletteFeedback = useState('courrier-palette-feedback', () => '')
const paletteError = useState('courrier-palette-error', () => '')
let lastComposeRequest = composeRequest.value
let lastScreenerClearRequest = screenerClearRequest.value
const isImportingFixture = ref(false)
const fixtureError = ref('')
let undoTimer: ReturnType<typeof setTimeout> | undefined

function openNewComposer() {
  composeDraftId.value = null
  composeInitialDraft.value = null
  composeOpen.value = true
}

function relativeMailDate(timestamp: string) {
  const time = new Date(timestamp).getTime()
  if (!Number.isFinite(time)) return ''

  const difference = time - Date.now()
  const absoluteDifference = Math.abs(difference)
  const units: { unit: Intl.RelativeTimeFormatUnit, milliseconds: number }[] = [
    { unit: 'year', milliseconds: 31_536_000_000 },
    { unit: 'month', milliseconds: 2_592_000_000 },
    { unit: 'week', milliseconds: 604_800_000 },
    { unit: 'day', milliseconds: 86_400_000 },
    { unit: 'hour', milliseconds: 3_600_000 },
    { unit: 'minute', milliseconds: 60_000 },
    { unit: 'second', milliseconds: 1_000 },
  ]
  const { unit, milliseconds } = units.find(candidate => absoluteDifference >= candidate.milliseconds) ?? units.at(-1)!
  const value = Math.round(difference / milliseconds)
  return new Intl.RelativeTimeFormat(locale.value || 'fr', { numeric: 'auto', style: 'short' }).format(value, unit)
}

function absoluteMailDate(timestamp: string) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value || 'fr', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date)
}

function forwardActiveMessage() {
  const message = activeThreadMessage.value || selectedMessage.value
  if (!message) return
  threadActionError.value = ''
  threadActionFeedback.value = ''
  composeDraftId.value = null
  composeInitialDraft.value = {
    to: '',
    subject: $t('mail.forwardSubject', { subject: message.subject }),
    body: [
      $t('mail.forwardedMessageHeader'),
      $t('mail.forwardedFrom', { sender: message.sender, address: message.address }),
      $t('mail.forwardedDate', { date: absoluteMailDate(message.timestamp) }),
      $t('mail.forwardedSubject', { subject: message.subject }),
      '',
      message.body ?? '',
    ].join('\n'),
  }
  composeOpen.value = true
}

async function goToDrafts() {
  composeOpen.value = false
  if (route.path !== '/mail/drafts') await router.push('/mail/drafts')
}

async function onOutgoingMessageSent() {
  try {
    await refreshMessages()
  } catch {
    classificationActionError.value = $t('mail.messageSentReloadError')
  }
}

const { data: inboxMessages, refresh: refreshInboxMessages, error: inboxMessagesError } = await useFetch<InboxMessage[]>('/api/messages', {
  default: () => [],
})
const { data: workspaceTagState, refresh: refreshWorkspaceTagState } = await useFetch<{ canManage: boolean, canAssign: boolean, tags: WorkspaceTag[] }>('/api/tags', {
  default: () => ({ canManage: false, canAssign: false, tags: [] }),
})
const workspaceTags = computed(() => workspaceTagState.value?.tags ?? [])
const canManageTags = computed(() => Boolean(workspaceTagState.value?.canManage))
const canAssignTags = computed(() => Boolean(workspaceTagState.value?.canAssign))

async function refreshTagAssignments() {
  const threadId = selectedId.value
  if (threadId) threadContentLoadingId.value = threadId

  try {
    await Promise.all([refreshInboxMessages(), refreshWorkspaceTagState()])
    if (threadId) await loadThreadContent(threadId)
  } finally {
    if (threadId && threadContentLoadingId.value === threadId && !threadContentRequests.has(threadId)) {
      threadContentLoadingId.value = ''
    }
  }
}

const threadContentLoadingId = ref('')
const threadContentRequests = new Map<string, Promise<void>>()
const isThreadContentLoading = computed(() => Boolean(selectedId.value) && threadContentLoadingId.value === selectedId.value)

async function loadThreadContent(threadId: string) {
  const messages = (inboxMessages.value ?? []).filter(message => message.threadId === threadId)
  if (!messages.length || messages.every(message => message.body !== undefined)) return

  const pendingRequest = threadContentRequests.get(threadId)
  if (pendingRequest) return pendingRequest

  threadContentLoadingId.value = threadId
  const request = (async () => {
    try {
      const details = await $fetch<InboxMessage[]>('/api/messages', {
        query: { includeBody: 'true', threadId },
      })
      const detailsById = new Map(details.map(message => [message.id, message]))
      inboxMessages.value = (inboxMessages.value ?? []).map((message) => {
        const detail = detailsById.get(message.id)
        return detail
          ? { ...message, body: detail.body ?? '', htmlBody: detail.htmlBody ?? '' }
          : message
      })
    } catch {
      // The reader shows a localized retry hint when the content is still missing.
    } finally {
      if (threadContentLoadingId.value === threadId) threadContentLoadingId.value = ''
      threadContentRequests.delete(threadId)
    }
  })()
  threadContentRequests.set(threadId, request)
  return request
}

async function refreshMessages() {
  await refreshInboxMessages()
  if (selectedId.value) await loadThreadContent(selectedId.value)
}

const mailScreener = useMailScreener({
  messages: inboxMessages,
  search,
  activeFolder,
  isSaving: isSavingScreenerAction,
  actionError: screenerActionError,
  refreshMessages,
  showClassificationFeedback,
  clearClassificationTarget: () => { classificationTarget.value = null },
})
const {
  view: screenerView,
  selectedAddress: selectedScreenerAddress,
  openOptionsFor: openScreenerOptionsFor,
  clearDialogOpen: screenerClearDialogOpen,
  shortcutHelpOpen: screenerShortcutHelpOpen,
  destination: screenerDestination,
  scope: screenerScope,
  isClearing: isClearingScreener,
  allSenders: allScreenerSenders,
  historySenders: screenerHistorySenders,
  senders: screenerSenders,
  visibleHistory: visibleScreenerHistory,
  toggleOptions: toggleScreenerOptions,
  requestClear: requestClearScreener,
  applyChoice: applyScreenerChoice,
  blockSender: blockScreenerSender,
  trashMessage: trashScreenerMessage,
  clearAll: clearAllScreener,
  restoreSender: restoreScreenerSender,
} = mailScreener

watch(mailStateRefreshRevision, () => {
  void refreshMessages()
})

watch(composeRequest, (request) => {
  if (request === lastComposeRequest) return
  lastComposeRequest = request
  openNewComposer()
})

watch(screenerClearRequest, (request) => {
  if (request === lastScreenerClearRequest) return
  lastScreenerClearRequest = request
  if (activeFolder.value === 'Screener' && screenerView.value === 'pending') requestClearScreener()
})

watch(composeDraftRequest, (draft) => {
  if (!draft) return
  composeDraftId.value = null
  composeInitialDraft.value = { ...draft }
  composeOpen.value = true
  composeDraftRequest.value = null
}, { immediate: true })

const bulkMoveDestinations = computed<MailboxFolder[]>(() => {
  const destinations: MailboxFolder[] = ['Imbox', 'The Feed', 'Paper Trail']
  return activeFolder.value === 'Reply Later' || activeFolder.value === 'Set Aside'
    ? destinations
    : destinations.filter(folder => folder !== activeFolder.value)
})

const bulkMoveOptions = computed(() => bulkMoveDestinations.value.map(folder => ({
  value: folder,
  label: mailboxByName(folder).label,
})))

const {
  folderMessages,
  folderThreads,
  visibleThreads,
  feedEditions,
  visibleFeedEditions,
  setAsideThreads,
  replyLaterThreads,
} = useMailThreadCollections({
  messages: inboxMessages,
  activeFolder,
  search,
  selectedTagId,
})

const participantAvatars = ref<Record<string, { avatarUrl: string | null, logoUrl: string | null }>>({})
const stackPreviewLimit = computed(() => Math.max(1, Math.min(5, Math.floor((viewportHeight.value - 148) / 70) + 1)))
const setAsideStackPreview = computed(() => setAsideThreads.value.slice(0, stackPreviewLimit.value))
const setAsideStackExpandedHeight = computed(() =>
  `${76 + setAsideStackPreview.value.length * 70}px`)
const showSetAsideStack = computed(() => activeFolder.value === 'Imbox'
  && !isGlobalSearch.value
  && !threadSelectionMode.value
  && setAsideThreads.value.length > 0)
const replyLaterStackPreview = computed(() => replyLaterThreads.value.slice(0, stackPreviewLimit.value))
const replyLaterStackExpandedHeight = computed(() => `${76 + replyLaterStackPreview.value.length * 70}px`)
const showReplyLaterStack = computed(() => activeFolder.value === 'Imbox'
  && !isGlobalSearch.value
  && !threadSelectionMode.value
  && replyLaterThreads.value.length > 0)
const canSelectThreads = computed(() => !isGlobalSearch.value
  && activeFolder.value !== 'Screener'
  && activeFolder.value !== 'Trash'
  && visibleThreads.value.length > 0)
const canNavigateThreads = computed(() => !isGlobalSearch.value
  && activeFolder.value !== 'Screener'
  && visibleThreads.value.length > 0)
const globalSearchThreads = computed<SearchThread[]>(() => {
  const messages = inboxMessages.value ?? []
  const messagesById = new Map(messages.map(message => [message.id, message]))
  const groups = new Map<string, { latest: InboxMessage, messages: InboxMessage[], snippet: string, subject: string }>()

  for (const hit of searchResults.value) {
    const matchedMessage = messagesById.get(hit.id)
    if (!matchedMessage) continue

    const key = `${hit.folder}\u0000${hit.threadId}`
    const existing = groups.get(key)
    if (existing) continue

    const threadMessages = messages.filter(message => message.folder === hit.folder && message.threadId === hit.threadId)
    groups.set(key, {
      latest: matchedMessage,
      messages: threadMessages,
      snippet: hit.snippet,
      subject: threadMessages.find(message => message.threadSubject)?.threadSubject || matchedMessage.subject,
    })
  }

  const result = [...groups.entries()].map(([id, group]) => ({
    id,
    messages: group.messages,
    latest: group.latest,
    subject: group.subject,
    unreadCount: group.messages.filter(message => !message.isRead).length,
    manualMergeIds: [...new Set(group.messages.flatMap(message => message.manualMergeIds))],
    tags: uniqueTags(group.messages.flatMap(message => message.tags)),
    snippet: group.snippet,
  }))
  return selectedTagId.value ? result.filter(thread => thread.tags.some(tag => tag.id === selectedTagId.value)) : result
})

const newThreads = computed(() => visibleThreads.value.filter(thread => thread.unreadCount > 0))
const previouslySeenThreads = computed(() => visibleThreads.value.filter(thread => thread.unreadCount === 0))
const selectableThreads = computed(() => activeFolder.value === 'Imbox'
  ? [...newThreads.value, ...previouslySeenThreads.value]
  : visibleThreads.value)

const mailThreadSelection = useMailThreadSelection({
  threads: selectableThreads,
  onSelectionChange: () => { threadMergeError.value = '' },
})
const {
  selecting: threadSelectionMode,
  selectedIds: selectedThreadIds,
  keyboardCursorId: keyboardSelectionThreadId,
  start: startThreadSelection,
  toggle: toggleThreadSelection,
  clear: clearThreadSelection,
  moveCursor: moveSelectionCursor,
} = mailThreadSelection
const selectedThreads = computed(() => selectableThreads.value.filter(thread => selectedThreadIds.value.includes(thread.id)))
const selectedThreadMessageIds = computed(() => [...new Set(selectedThreads.value.flatMap(thread => thread.messages.map(message => message.id)))])
const selectedThreadTags = computed(() => {
  if (!selectedThreads.value.length) return []
  const commonIds = new Set(selectedThreads.value[0]!.tags.map(tag => tag.id))
  for (const thread of selectedThreads.value.slice(1)) {
    for (const id of [...commonIds]) if (!thread.tags.some(tag => tag.id === id)) commonIds.delete(id)
  }
  return selectedThreads.value[0]!.tags.filter(tag => commonIds.has(tag.id))
})

watch([activeFolder, isGlobalSearch], () => {
  clearThreadSelection()
  threadMergeFeedback.value = ''
  threadMergeError.value = ''
})

watch([activeFolder, selectedThreadIds, selectedId], () => {
  paletteContext.value = {
    source: activeFolder.value,
    threadIds: selectedThreadIds.value.length
      ? [...selectedThreadIds.value]
      : selectedId.value ? [selectedId.value] : [],
    screenerPendingCount: paletteContext.value.screenerPendingCount,
  }
}, { immediate: true, deep: true })

watch(() => allScreenerSenders.value.length, (count) => {
  paletteContext.value = { ...paletteContext.value, screenerPendingCount: count }
}, { immediate: true })

const participantAvatarAddresses = computed(() => {
  const currentAddress = accountSession.value?.user.email.trim().toLocaleLowerCase('en-US')
  const displayedThreads = isGlobalSearch.value
    ? globalSearchThreads.value
    : visibleThreads.value
  const displayedMessages = displayedThreads.flatMap(thread => thread.messages)
  if (activeFolder.value === 'Screener') {
    displayedMessages.push(...screenerSenders.value.map(sender => sender.latest))
    displayedMessages.push(...visibleScreenerHistory.value.map(sender => sender.latest))
  }
  if (activeFolder.value === 'Imbox' && !isGlobalSearch.value) {
    displayedMessages.push(...setAsideThreads.value.flatMap(thread => thread.messages))
    displayedMessages.push(...replyLaterThreads.value.flatMap(thread => thread.messages))
  }

  const addresses = displayedMessages.flatMap((message) => {
    const senderAddress = message.address.trim().toLocaleLowerCase('en-US')
    return [
      ...(!message.isOutgoing && senderAddress !== currentAddress ? [senderAddress] : []),
      ...recipientAddresses(message.recipient).filter(address => address !== currentAddress),
    ]
  })
  return [...new Set(addresses.filter(Boolean))].sort()
})
let participantAvatarRequestId = 0

watch(participantAvatarAddresses, async (addresses) => {
  const requestId = ++participantAvatarRequestId
  if (!addresses.length) {
    participantAvatars.value = {}
    return
  }

  try {
    const chunks: string[][] = []
    for (let index = 0; index < addresses.length; index += 30) chunks.push(addresses.slice(index, index + 30))
    const responses = await Promise.all(chunks.map(chunk => $fetch<{ avatars: Record<string, { avatarUrl: string | null, logoUrl: string | null }> }>('/api/contacts/avatars', {
      query: { addresses: chunk.join(',') },
    })))
    if (requestId === participantAvatarRequestId) {
      participantAvatars.value = Object.assign({}, ...responses.map(response => response.avatars))
    }
  } catch {
    // Avatars remain initials if contact lookup is temporarily unavailable.
  }
}, { immediate: true })

function senderAvatarFor(message: InboxMessage) {
  if (message.isOutgoing) return {}
  return participantAvatars.value[message.address.trim().toLocaleLowerCase('en-US')] ?? {}
}

function threadAvatarFor(message: InboxMessage) {
  const address = message.isOutgoing
    ? recipientAddresses(message.recipient)[0]
    : message.address.trim().toLocaleLowerCase('en-US')
  return address ? participantAvatars.value[address] ?? {} : {}
}

const selectedThread = computed(() => folderThreads.value.find(thread => thread.id === selectedId.value))
const mailThreadActions = useMailThreadActions({
  activeFolder,
  selectedThread,
  selectedThreadIds,
  clearThreadSelection,
  keyboardCursorId: keyboardSelectionThreadId,
  refreshMessages,
  activityRefreshRevision,
  closeMessage,
  setMessageRead,
  navigateToMailbox: folder => router.push(mailboxPath(folder)),
  mergeFeedback: threadMergeFeedback,
  mergeError: threadMergeError,
})
const {
  mergeDialogOpen,
  splitDialogOpen,
  isMergingThreads,
  isSplittingThread,
  threadTrashDialogOpen,
  bulkTrashDialogOpen,
  isTrashingThread,
  isMarkingThreadUnseen,
  isMovingOpenThread,
  threadMoveMenuOpen,
  threadActionFeedback,
  threadActionError,
  bulkActionFeedback,
  bulkActionError,
  isApplyingBulkAction,
  applyBulkAction,
  trashOpenThread,
  moveSelectedThreads,
  moveOpenThread,
  mergeSelectedThreads,
  splitSelectedThread,
  markOpenThreadUnseen,
  setThreadMoveMenuOpen,
} = mailThreadActions
const selectedThreadParticipants = computed(() => selectedThread.value ? threadParticipants(selectedThread.value) : [])
const selectedMessage = computed(() => selectedThread.value?.latest)
const chronologicalMessages = computed(() => [...(selectedThread.value?.messages ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
const threadSubjectEditor = useMailThreadSubject({
  selectedThread,
  chronologicalMessages,
  refreshMessages,
})
const {
  isEditing: isEditingThreadSubject,
  draft: threadSubjectDraft,
  saveError: threadSubjectSaveError,
  isSaving: isSavingThreadSubject,
  input: threadSubjectInput,
  heading: threadSubjectHeading,
  selection: subjectSelection,
  contextMenu: subjectContextMenu,
  resetEditor: resetThreadSubjectEditor,
  beginEdit: beginThreadSubjectEdit,
  updateSelection: updateSubjectSelection,
  openContextMenu: openSubjectContextMenu,
  cancelEdit: cancelThreadSubjectEdit,
  save: saveThreadSubject,
} = threadSubjectEditor
const {
  activeThreadMessage,
  activeThreadMessageId,
  activeThreadMessageIndex,
  feedEditionAnnouncement,
  feedEditionIndex,
  feedTouchOrigin,
  finishFeedTouch,
  isFeedReader,
  isInboxReader,
  isReadingAll,
  navigateFeedEdition,
  navigateThreadMessage,
  railCanScrollEnd,
  railCanScrollStart,
  rememberFeedTouch,
  replyRecipient,
  resetThreadPresentation,
  revealThreadTab,
  selectThreadMessage,
  threadMessageRail,
  threadSlideDirection,
  toggleReadAll,
  updateThreadRailOverflow,
} = useMailThreadNavigation({
  activeFolder,
  chronologicalMessages,
  feedEditions,
  isGlobalSearch,
  isReadingMessage,
  openMessage,
  selectedId,
  selectedMessage,
})

const mailReply = useMailReply({
  activeMessage: activeThreadMessage,
  translate: key => $t(key),
  afterSend: async (sent) => {
    await refreshMessages()
    if (activeFolder.value === 'Reply Later') {
      await router.push(mailboxPath(sent.folder as Folder))
    } else {
      await router.replace({ path: route.path, query: { ...route.query, message: sent.id } })
    }
  },
})
const {
  composerOpen: replyComposerOpen,
  sendConfirmOpen: replySendConfirmOpen,
  body: replyBody,
  error: replyError,
  loading: replyLoading,
  draftTargetId: replyDraftTargetId,
  draftStatus: replyDraftStatus,
  saving: replySaving,
  sending: replySending,
  saved: replySaved,
  openComposer: openReplyComposer,
  saveDraft: saveReplyDraft,
  requestSend: requestReplySend,
  send: sendReply,
} = mailReply

watch(selectedId, (threadId) => {
  resetThreadSubjectEditor()
  const thread = selectedThread.value
  if (!threadId) {
    activeThreadMessageId.value = ''
    isReadingAll.value = false
    openedFromList.value = false
    return
  }
  if (!thread) return

  void loadThreadContent(threadId)

  const requestedMessageId = typeof route.query.message === 'string' ? route.query.message : ''
  const requestedMessage = thread.messages.find(message => message.id === requestedMessageId)
  const message = requestedMessage ?? thread.latest
  resetThreadPresentation(message.id)

  if (requestedMessage?.id !== message.id && import.meta.client) {
    void router.replace({ path: route.path, query: { ...route.query, message: message.id } })
  }
}, { immediate: true })

watch(() => route.query.message, (messageParam) => {
  const thread = selectedThread.value
  if (!selectedId.value || !thread) return

  const requestedMessageId = typeof messageParam === 'string' ? messageParam : ''
  const message = thread.messages.find(item => item.id === requestedMessageId) ?? thread.latest
  if (activeThreadMessageId.value !== message.id) {
    const nextIndex = chronologicalMessages.value.findIndex(item => item.id === message.id)
    threadSlideDirection.value = nextIndex > activeThreadMessageIndex.value ? 1 : -1
    activeThreadMessageId.value = message.id
  }

  if (requestedMessageId !== message.id && import.meta.client) {
    void router.replace({ path: route.path, query: { ...route.query, message: message.id } })
  }
})

watch(activeThreadMessageId, async (messageId) => {
  if (replyComposerOpen.value && replyDraftTargetId.value && replyDraftTargetId.value !== messageId) {
    replyComposerOpen.value = false
    void saveReplyDraft()
  }
  await nextTick()
  revealThreadTab(messageId)
  if (isFeedReader.value) window.scrollTo({ top: 0, behavior: 'instant' })
  if (isReadingAll.value) {
    document.getElementById(`thread-full-message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

const handleScreenerKeyboardShortcut = useScreenerKeyboardShortcuts({
  activeFolder,
  allScreenerSenders,
  applyScreenerChoice,
  blockScreenerSender,
  hasOpenKeyboardSurface,
  navigateToFolder,
  openScreenerOptionsFor,
  screenerClearDialogOpen,
  screenerDestination,
  screenerScope,
  screenerSenders,
  screenerShortcutHelpOpen,
  screenerView,
  selectedScreenerAddress,
  toggleScreenerOptions,
  trashScreenerMessage,
})

function handleThreadKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return

  if (event.key === 'Escape' && threadTagPicker.value?.isPickerOpen()) {
    event.preventDefault()
    event.stopPropagation()
    void threadTagPicker.value.closePicker()
    return
  }

  if (
    activeFolder.value === 'Screener'
    && screenerView.value === 'pending'
    && screenerClearDialogOpen.value
    && event.key === 'Enter'
    && (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
  ) {
    event.preventDefault()
    event.stopPropagation()
    void clearAllScreener()
    return
  }

  if (event.key === 'Escape' && isEditingThreadSubject.value) {
    event.preventDefault()
    event.stopPropagation()
    cancelThreadSubjectEdit()
    return
  }

  const target = event.target
  if (event.key === 'Escape' && activeFolder.value === 'Screener' && openScreenerOptionsFor.value) {
    event.preventDefault()
    openScreenerOptionsFor.value = ''
    return
  }
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return
  // Let an open overlay handle Escape before page shortcuts clear selections or navigate away.
  if (target instanceof Element && target.closest('[role="dialog"], [role="menu"], [role="listbox"], [aria-haspopup="dialog"][aria-expanded="true"]')) return
  if (threadMoveMenuOpen.value) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  if (handleScreenerKeyboardShortcut(event)) return

  if (event.key === 'Escape' && activeFolder.value === 'Screener' && !isReadingMessage.value && !isGlobalSearch.value) {
    if (hasOpenKeyboardSurface()) return
    event.preventDefault()
    navigateToFolder('Imbox')
    return
  }

  if (event.key === 'Escape' && (isSetAsideStackExpanded.value || isReplyLaterStackExpanded.value)) {
    event.preventDefault()
    isSetAsideStackExpanded.value = false
    isReplyLaterStackExpanded.value = false
    return
  }

  if (threadSelectionMode.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      clearThreadSelection()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelectionCursor(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === ' ' && keyboardSelectionThreadId.value) {
      event.preventDefault()
      toggleThreadSelection(keyboardSelectionThreadId.value)
      return
    }
    if (event.key.toLocaleLowerCase('en-US') === 'u' && canSelectThreads.value && !isApplyingBulkAction.value) {
      event.preventDefault()
      void applyBulkAction('mark-unseen')
      return
    }
  }

  const isThreadListTarget = target instanceof Element && Boolean(target.closest('.thread-list'))
  const isPageTarget = target === document.body || target === document.documentElement
  if (!isReadingMessage.value && activeFolder.value !== 'The Feed' && canNavigateThreads.value && (isThreadListTarget || isPageTarget)) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelectionCursor(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    const keyboardThread = selectableThreads.value.find(thread => thread.id === keyboardSelectionThreadId.value)
    if (event.key.toLocaleLowerCase('en-US') === 'u' && keyboardThread && canSelectThreads.value && !isApplyingBulkAction.value) {
      event.preventDefault()
      void applyBulkAction('mark-unseen', {}, [keyboardThread.id], true)
      return
    }
    if (event.key === 'Enter' && keyboardThread) {
      event.preventDefault()
      openMessage(keyboardThread.latest)
      return
    }

    if (event.key === ' ' && keyboardThread && canSelectThreads.value) {
      event.preventDefault()
      startThreadSelection(keyboardThread.id)
      return
    }
  }

  if (event.key === 'Escape' && activeFolder.value === 'Set Aside' && !isReadingMessage.value && !isGlobalSearch.value) {
    event.preventDefault()
    navigateToFolder('Imbox')
    return
  }
  if (event.key === 'Escape' && activeFolder.value === 'Reply Later' && !isReadingMessage.value && !isGlobalSearch.value) {
    event.preventDefault()
    const previousPath = window.history.state?.back
    if (typeof previousPath === 'string' && previousPath.startsWith('/mail/') && previousPath !== route.path) {
      void router.back()
    } else {
      navigateToFolder('Imbox')
    }
    return
  }
  if (!isReadingMessage.value || !selectedThread.value || classificationTarget.value || event.shiftKey) return

  const key = event.key.toLocaleLowerCase('en-US')
  if (isFeedReader.value && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    const target = event.target
    const isInteractiveTarget = target instanceof Element
      && Boolean(target.closest('a, button, input, textarea, select, [contenteditable="true"]'))
    if (event.altKey || event.metaKey || event.ctrlKey || isInteractiveTarget) return

    event.preventDefault()
    if (event.key === 'ArrowLeft') navigateFeedEdition(-1)
    else if (event.key === 'ArrowRight') navigateFeedEdition(1)
    else if (event.key === 'Home' && feedEditions.value[0]) openMessage(feedEditions.value[0], 'The Feed', true)
    else if (event.key === 'End' && feedEditions.value.at(-1)) openMessage(feedEditions.value.at(-1)!, 'The Feed', true)
    return
  }
  if (key === 'b' && canAssignTags.value) {
    event.preventDefault()
    void threadTagPicker.value?.openPicker()
  } else if (key === 'u' && activeFolder.value !== 'Trash' && !isMarkingThreadUnseen.value && !isMovingOpenThread.value) {
    event.preventDefault()
    void markOpenThreadUnseen()
  } else if (key === 'v' && ['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(activeFolder.value) && !isMarkingThreadUnseen.value && !isMovingOpenThread.value) {
    event.preventDefault()
    threadMoveMenuOpen.value = true
    void nextTick(() => document.querySelector<HTMLInputElement>('.thread-action-move input')?.focus())
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (replyComposerOpen.value) replyComposerOpen.value = false
    else closeMessage()
  } else if (event.key.toLocaleLowerCase('en-US') === 'r') {
    event.preventDefault()
    void openReplyComposer()
  } else if (event.key.toLocaleLowerCase('en-US') === 'a' && ['Imbox', 'Set Aside'].includes(activeFolder.value) && !isSavingSetAside.value && !splitDialogOpen.value) {
    event.preventDefault()
    void setAsideThread(activeFolder.value !== 'Set Aside')
  } else if (event.key.toLocaleLowerCase('en-US') === 'l' && !['Screener', 'Trash', 'Set Aside'].includes(activeFolder.value) && !isSavingReplyLater.value && !splitDialogOpen.value) {
    event.preventDefault()
    void setReplyLater(activeFolder.value !== 'Reply Later')
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    navigateThreadMessage(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    navigateThreadMessage(1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    const oldestMessage = chronologicalMessages.value[0]
    if (oldestMessage) selectThreadMessage(oldestMessage.id)
  } else if (event.key === 'End') {
    event.preventDefault()
    const newestMessage = chronologicalMessages.value.at(-1)
    if (newestMessage) selectThreadMessage(newestMessage.id)
  }
}

function hasOpenKeyboardSurface() {
  const surfaces = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [aria-haspopup="dialog"][aria-expanded="true"], [aria-haspopup="menu"][aria-expanded="true"], [aria-haspopup="listbox"][aria-expanded="true"]',
  )
  return [...surfaces].some(surface => surface.getClientRects().length > 0)
}

function handleScreenerOutsideClick(event: PointerEvent) {
  if (!openScreenerOptionsFor.value) return
  const target = event.target
  if (target instanceof Element && !target.closest('.screener-options-wrap')) {
    openScreenerOptionsFor.value = ''
  }
}

function handleStackOutsideClick(event: PointerEvent) {
  const target = event.target
  const stack = target instanceof Element ? target.closest<HTMLElement>('.mail-stack') : null
  if (stack?.dataset.stackKind !== 'set-aside') isSetAsideStackExpanded.value = false
  if (stack?.dataset.stackKind !== 'reply-later') isReplyLaterStackExpanded.value = false
}

function openOrFollowStackCard(isExpanded: boolean, stack: 'set-aside' | 'reply-later', thread: MessageThread) {
  if (isExpanded) {
    const folder = stack === 'set-aside' ? 'Set Aside' : 'Reply Later'
    void router.push({ path: threadPath(folder, thread.id), query: { message: thread.latest.id } })
    return
  }
  if (stack === 'set-aside') {
    isSetAsideStackExpanded.value = true
    isReplyLaterStackExpanded.value = false
  } else {
    isSetAsideStackExpanded.value = false
    isReplyLaterStackExpanded.value = true
  }
}

function updateStackPreviewLimit() {
  viewportHeight.value = window.innerHeight
}

onMounted(() => {
  updateStackPreviewLimit()
  window.addEventListener('resize', updateStackPreviewLimit, { passive: true })
  window.addEventListener('keydown', handleThreadKeydown)
  window.addEventListener('pointerdown', handleScreenerOutsideClick)
  window.addEventListener('pointerdown', handleStackOutsideClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateStackPreviewLimit)
  window.removeEventListener('keydown', handleThreadKeydown)
  window.removeEventListener('pointerdown', handleScreenerOutsideClick)
  window.removeEventListener('pointerdown', handleStackOutsideClick)
})

async function importFixture() {
  isImportingFixture.value = true
  fixtureError.value = ''

  try {
    const fixture = await fetch('/fixtures/courrier-test.eml')
    if (!fixture.ok) throw new Error($t('mail.fixtureNotFound'))

    const result = await $fetch<{ id: string }>('/api/dev/ingest', {
      method: 'POST',
      body: await fixture.text(),
      headers: { 'content-type': 'message/rfc822' },
    })

    await refreshMessages()
    const imported = inboxMessages.value?.find(message => message.id === result.id)
    if (imported) openMessage(imported)
  } catch (error) {
    fixtureError.value = error instanceof Error ? error.message : $t('mail.fixtureImportError')
  } finally {
    isImportingFixture.value = false
  }
}

function openMessage(message: InboxMessage, mailbox: Folder = message.folder, replaceHistory = false) {
  openedFromList.value = true
  messageReadError.value = ''
  resetThreadPresentation(message.id)
  const routeTarget = {
    path: threadPath(mailbox, message.threadId),
    query: { ...route.query, message: message.id },
  }
  void (replaceHistory ? router.replace(routeTarget) : router.push(routeTarget))

  const unread = mailbox === 'The Feed'
    ? [message].filter(item => !item.isRead)
    : (inboxMessages.value ?? []).filter(item => item.folder === message.folder && item.threadId === message.threadId && !item.isRead)
  if (!unread.length) return

  void Promise.allSettled(unread.map(async (item) => {
    setMessageRead(item, true)
    try {
      await $fetch(`/api/messages/${encodeURIComponent(item.id)}/read`, {
        method: 'PATCH',
        body: { isRead: true },
      })
    } catch (error) {
      setMessageRead(item, false)
      throw error
    }
  })).then((results) => {
    if (results.some(result => result.status === 'rejected')) {
      messageReadError.value = $t('mail.messageReadPartialError')
    }
  })
}

function handleThreadRowClick(thread: MessageThread, event?: MouseEvent) {
  if (threadSelectionMode.value) {
    toggleThreadSelection(thread.id, event)
    return
  }
  openMessage(thread.latest, activeFolder.value)
}

function handleFeedEditionOpen(message: InboxMessage, event?: MouseEvent) {
  if (threadSelectionMode.value) {
    toggleThreadSelection(message.threadId, event)
    return
  }
  openMessage(message, 'The Feed')
}

function handleThreadAvatarClick(threadId: string, event: MouseEvent) {
  event.stopPropagation()
  if (!threadSelectionMode.value) {
    startThreadSelection(threadId)
    return
  }
  toggleThreadSelection(threadId, event)
}

function setMessageRead(message: Pick<InboxMessage, 'id' | 'isRead'>, isRead: boolean) {
  message.isRead = isRead
  // useFetch keeps a shallow array in this page, so replace it to refresh computed thread counts.
  inboxMessages.value = [...(inboxMessages.value ?? [])]
}

function navigateToFolder(folder: Folder) {
  const query = folder === 'Screener'
    ? { from: mailboxByName(activeFolder.value).slug }
    : {}
  void router.push({ path: mailboxPath(folder), query })
}

async function setAsideThread(isSetAside: boolean) {
  const message = activeThreadMessage.value || selectedMessage.value
  if (!message || isSavingSetAside.value) return

  isSavingSetAside.value = true
  classificationActionError.value = ''
  try {
    const result = await $fetch<{ isSetAside: boolean, folder: MailboxFolder, affectedMessages: number }>(`/api/messages/${encodeURIComponent(message.id)}/set-aside`, {
      method: 'PATCH',
      body: { isSetAside },
    })
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = $t('mail.changeSavedReloadError')
    }
    classificationFeedback.value = ''
    void router.push(mailboxPath(result.folder))
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    classificationActionError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('mail.setAsideError')
  } finally {
    isSavingSetAside.value = false
  }
}

async function setReplyLater(isReplyLater: boolean) {
  const message = activeThreadMessage.value || selectedMessage.value
  if (!message || isSavingReplyLater.value) return

  isSavingReplyLater.value = true
  classificationActionError.value = ''
  try {
    const result = await $fetch<{ isReplyLater: boolean, folder: MailboxFolder, affectedMessages: number }>(`/api/messages/${encodeURIComponent(message.id)}/reply-later`, {
      method: 'PATCH',
      body: { isReplyLater },
    })
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = $t('mail.changeSavedReloadError')
    }
    classificationFeedback.value = ''
    void router.push(mailboxPath(isReplyLater ? 'Reply Later' : result.folder))
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    classificationActionError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('mail.replyLaterError')
  } finally {
    isSavingReplyLater.value = false
  }
}

function doneScreener() {
  const from = typeof route.query.from === 'string'
    ? mailboxes.find(mailbox => mailbox.slug === route.query.from)?.name
    : undefined
  void router.push(mailboxPath(from ?? 'Imbox'))
}

async function restoreTrashedMessage(message: InboxMessage) {
  if (isSavingScreenerAction.value) return
  const wasReadingFromTrash = activeFolder.value === 'Trash' && isReadingMessage.value
  isSavingScreenerAction.value = true
  screenerActionError.value = ''
  try {
    await $fetch(`/api/messages/${encodeURIComponent(message.id)}/restore-trash`, { method: 'POST' })
    showClassificationFeedback($t('mail.screenerMessageRestored'))
    await refreshMessages()
    if (wasReadingFromTrash) void router.push(mailboxPath('Trash'))
  } catch {
    screenerActionError.value = $t('mail.screenerRestoreError')
  } finally {
    isSavingScreenerAction.value = false
  }
}

async function retryMarkRead() {
  const unread = isFeedReader.value
    ? activeThreadMessage.value && !activeThreadMessage.value.isRead ? [activeThreadMessage.value] : []
    : selectedThread.value?.messages.filter(message => !message.isRead) ?? []
  if (!unread.length) return

  messageReadError.value = ''
  const results = await Promise.allSettled(unread.map(async (message) => {
    await $fetch(`/api/messages/${encodeURIComponent(message.id)}/read`, {
      method: 'PATCH',
      body: { isRead: true },
    })
    setMessageRead(message, true)
  }))
  if (results.some(result => result.status === 'rejected')) {
      messageReadError.value = $t('mail.messageReadError')
  }
}

async function retryInboxLoad() {
  isRefreshingInbox.value = true
  try {
    await refreshMessages()
  } catch {
    // useFetch exposes the request failure through inboxMessagesError.
  } finally {
    isRefreshingInbox.value = false
  }
}

function closeMessage() {
  if (openedFromList.value) {
    openedFromList.value = false
    void router.back()
    return
  }

  const query = route.query.q ? { q: route.query.q } : {}
  void router.replace({ path: mailboxPath(activeFolder.value), query })
}

function openClassification(message: InboxMessage, scope?: 'sender' | 'message' | 'group') {
  classificationTarget.value = message
  classificationScope.value = scope ?? (selectedThread.value?.manualMergeIds.length ? 'group' : 'sender')
  classificationFolder.value = message.folder === 'Screener' || message.folder === 'Trash' ? 'Imbox' : message.folder
  classificationError.value = ''
}

function showClassificationFeedback(message: string, undoId = '') {
  classificationFeedback.value = message
  classificationActionError.value = ''
  undoClassificationId.value = undoId
  if (undoTimer) clearTimeout(undoTimer)

  if (undoId) {
    undoTimer = setTimeout(() => {
      if (undoClassificationId.value === undoId) undoClassificationId.value = ''
      undoTimer = undefined
    }, 20_000)
  }
}

async function undoSenderRule() {
  const changeId = undoClassificationId.value
  if (!changeId || isUndoingClassification.value) return

  isUndoingClassification.value = true
  classificationActionError.value = ''
  try {
    const result = await $fetch<{ restoredMessages: number }>(`/api/sender-rule-changes/${encodeURIComponent(changeId)}/undo`, {
      method: 'POST',
    })
    undoClassificationId.value = ''
    if (undoTimer) clearTimeout(undoTimer)
    undoTimer = undefined
    showClassificationFeedback($t(result.restoredMessages === 1 ? 'mail.undoDoneOne' : 'mail.undoDoneMany', { count: result.restoredMessages }))
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = $t('mail.undoRefreshError')
    }
  } catch {
    classificationActionError.value = $t('mail.undoError')
  } finally {
    isUndoingClassification.value = false
  }
}

async function saveClassification() {
  const message = classificationTarget.value
  if (!message || isSavingClassification.value) return

  isSavingClassification.value = true
  classificationError.value = ''
  classificationActionError.value = ''

  try {
    if (classificationScope.value === 'group') {
      const result = await $fetch<{ folder: MailboxFolder, movedMessages: number }>(`/api/messages/${encodeURIComponent(message.id)}/group-folder`, {
        method: 'PATCH',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback($t(result.movedMessages === 1 ? 'mail.groupMessagesMovedOne' : 'mail.groupMessagesMovedMany', { count: result.movedMessages, folder: mailboxByName(result.folder).label }))
    } else if (classificationScope.value === 'sender') {
      const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(message.id)}/sender-rule`, {
        method: 'PUT',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback($t(result.affectedMessages === 1 ? 'mail.classificationDoneOne' : 'mail.classificationDoneMany', { count: result.affectedMessages, folder: mailboxByName(result.folder).label }), result.undoId)
    } else {
      const result = await $fetch<{ folder: MailboxFolder }>(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
        method: 'PATCH',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback($t('mail.messageMovedKeepingSenderRule', { folder: mailboxByName(result.folder).label }))
    }

    classificationTarget.value = null
    closeMessage()
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = $t('mail.changeSavedReloadError')
    }
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    classificationError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('mail.classificationError')
  } finally {
    isSavingClassification.value = false
  }
}

useSeoMeta({
  title: 'Courrier — votre boîte, à votre façon',
  description: 'Une boîte de réception personnelle pour vos domaines.',
})
</script>
