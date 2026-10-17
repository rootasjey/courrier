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
              @click="navigateToFolder('Screener')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm16 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-1.2A4.8 4.8 0 0 1 6.8 14h.4A4.8 4.8 0 0 1 12 18.8V20m0-1.2a4.8 4.8 0 0 1 4.8-4.8h.4a4.8 4.8 0 0 1 4.8 4.8V20" /></svg>
              <span>{{ $t(allScreenerSenders.length === 1 ? 'mail.reviewSenderOne' : 'mail.reviewSenderMany', { count: allScreenerSenders.length }) }}</span>
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

      <div v-if="threadSelectionMode && selectedThreadIds.length" class="thread-selection-bar" role="status">
        <span>{{ selectedThreadIds.length }} {{ $t(selectedThreadIds.length === 1 ? 'bulk.selectedOne' : 'bulk.selectedMany') }}</span>
        <button type="button" class="thread-selection-action" :disabled="isApplyingBulkAction" @click="applyBulkAction('mark-seen')">{{ $t('bulk.markSeen') }}</button>
        <button v-if="activeFolder !== 'Reply Later' && activeFolder !== 'Set Aside'" type="button" class="thread-selection-action" :disabled="isApplyingBulkAction" @click="applyBulkAction('reply-later', { enabled: true })">{{ $t('bulk.replyLater') }}</button>
        <button v-if="activeFolder === 'Imbox'" type="button" class="thread-selection-action" :disabled="isApplyingBulkAction" @click="applyBulkAction('set-aside', { enabled: true })">{{ $t('bulk.setAside') }}</button>
        <button v-if="activeFolder === 'Reply Later'" type="button" class="thread-selection-action" :disabled="isApplyingBulkAction" @click="applyBulkAction('reply-later', { enabled: false })">{{ $t('bulk.removeReplyLater') }}</button>
        <button v-if="activeFolder === 'Set Aside'" type="button" class="thread-selection-action" :disabled="isApplyingBulkAction" @click="applyBulkAction('set-aside', { enabled: false })">{{ $t('bulk.returnInbox') }}</button>
        <select v-if="['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(activeFolder)" class="thread-selection-move" :aria-label="$t('bulk.move')" :disabled="isApplyingBulkAction" @change="moveSelectedThreads">
          <option value="">{{ $t('bulk.move') }}</option>
          <option v-for="folder in bulkMoveDestinations" :key="folder" :value="folder">{{ mailboxByName(folder).label }}</option>
        </select>
        <button type="button" class="thread-selection-action thread-selection-trash" :disabled="isApplyingBulkAction" @click="bulkTrashDialogOpen = true">{{ $t('bulk.trash') }}</button>
        <button v-if="selectedThreadIds.length > 1" type="button" class="thread-selection-action" :disabled="isApplyingBulkAction || isMergingThreads" @click="mergeDialogOpen = true">
          {{ isMergingThreads ? $t('mail.merging') : $t('bulk.merge') }}
        </button>
        <button type="button" class="thread-selection-cancel" :disabled="isApplyingBulkAction" @click="clearThreadSelection">{{ $t('bulk.cancel') }}</button>
      </div>

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
                <span class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
              </span>
              <span class="thread-content">
                <span class="thread-subject">{{ thread.subject }}</span>
                <span class="thread-preview"><span class="search-folder-label">{{ mailboxByName(thread.latest.folder).label }}</span><span aria-hidden="true"> · </span><strong>{{ thread.latest.sender }}</strong><span aria-hidden="true"> · </span>{{ thread.snippet || thread.latest.preview }}</span>
              </span>
              <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
              <time class="thread-date">{{ thread.latest.date }}</time>
            </button>
          </div>
        </div>
        <button v-if="searchHasMore" class="search-load-more" type="button" :disabled="searchLoading" @click="loadMoreSearchResults">
          {{ searchLoading ? $t('mail.loading') : $t('mail.showMoreResults') }}
        </button>
      </section>

      <div v-else-if="activeFolder === 'Screener'" class="thread-list screener-list" role="list" :aria-label="$t('mail.screenerSenders')">
        <div class="screener-list-tools">
          <div class="screener-view-switch" role="group" :aria-label="$t('mail.screenerMessages')">
            <button type="button" :aria-pressed="screenerView === 'pending'" @click="screenerView = 'pending'">{{ $t('mail.screenerPending') }} <span>{{ allScreenerSenders.length }}</span></button>
            <button type="button" :aria-pressed="screenerView === 'history'" @click="screenerView = 'history'">{{ $t('mail.screenerHistory') }} <span>{{ screenerHistorySenders.length }}</span></button>
          </div>
          <button v-if="screenerView === 'pending' && allScreenerSenders.length" class="screener-clear-all" type="button" :disabled="isClearingScreener" @click="requestClearScreener">
            {{ isClearingScreener ? $t('mail.screenerClearPending') : $t('mail.screenerClearAll') }}
          </button>
        </div>
        <template v-if="screenerView === 'pending'">
          <p v-if="!screenerSenders.length" class="screener-empty">{{ $t('mail.screenerEmptyPending') }}</p>
          <article v-for="sender in screenerSenders" :key="sender.address" class="screener-row" :class="{ 'is-keyboard-selected': selectedScreenerAddress === sender.address.trim().toLocaleLowerCase('en-US') }" :aria-current="selectedScreenerAddress === sender.address.trim().toLocaleLowerCase('en-US') ? 'true' : undefined" role="listitem">
            <svg v-if="selectedScreenerAddress === sender.address.trim().toLocaleLowerCase('en-US')" class="screener-current-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
            <div class="screener-actions">
              <button class="screener-choice screener-yes transition duration-150 ease-out hover:scale-105 active:scale-99" type="button" :aria-label="$t('mail.authorizeAddress', { address: sender.address })" :disabled="isSavingScreenerAction" @click="applyScreenerChoice(sender.latest, 'Imbox', 'sender')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-8c2.2 0 3.1 1.7 2.5 3.6L12.5 10h6a3 3 0 0 1 2.9 3.8l-1.7 6A3 3 0 0 1 16.8 22H7" /></svg><strong>{{ $t('mail.allow') }}</strong>
              </button>
              <button class="screener-choice screener-no transition duration-150 ease-out hover:scale-105 active:scale-99" type="button" :aria-label="$t('mail.blockAddress', { address: sender.address })" :disabled="isSavingScreenerAction" @click="blockScreenerSender(sender.latest)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 4 8c2.2 0 3.1-1.7 2.5-3.6L12.5 14h6a3 3 0 0 0 2.9-3.8l-1.7-6A3 3 0 0 0 16.8 2H7" /></svg><strong>{{ $t('mail.block') }}</strong>
              </button>
              <div class="screener-options-wrap">
                <button class="screener-options-trigger" type="button" :aria-label="$t('mail.screenerOptions', { address: sender.address })" :aria-expanded="openScreenerOptionsFor === sender.address" @click="toggleScreenerOptions(sender.address, sender.latest)">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
                </button>
                <Transition name="screener-popover">
                  <div v-if="openScreenerOptionsFor === sender.address" class="screener-popover" role="dialog" :aria-label="$t('mail.classifyAddress', { address: sender.address })">
                  <strong>{{ $t('mail.allowAndClassify') }}</strong>
                  <div class="screener-destinations" role="group" :aria-label="$t('mail.destination')">
                    <button v-for="destination in folders.filter(item => item.name !== 'Screener' && item.name !== 'Trash' && item.name !== 'Set Aside' && item.name !== 'Reply Later')" :key="destination.name" type="button" :aria-pressed="screenerDestination === destination.name" :title="$t('mail.destinationShortcut', { destination: destination.label, shortcut: destination.name === 'Imbox' ? 'I' : destination.name === 'The Feed' ? 'F' : 'P' })" @click="screenerDestination = destination.name">
                      <svg v-if="destination.name === 'Imbox'" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>
                      <svg v-else-if="destination.name === 'The Feed'" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5c3.3-.9 6.3-.4 9 1.5v13c-2.7-1.9-5.7-2.4-9-1.5v-13Zm18 0c-3.3-.9-6.3-.4-9 1.5v13c2.7-1.9 5.7-2.4 9-1.5v-13Z" /></svg>
                      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Zm3 5h6m-6 4h6m-6 4h4" /></svg>
                      <span>{{ destination.label }}</span>
                      <kbd>{{ destination.name === 'Imbox' ? 'I' : destination.name === 'The Feed' ? 'F' : 'P' }}</kbd>
                    </button>
                  </div>
                  <div class="screener-scope" role="group" :aria-label="$t('mail.applyTo')">
                    <button class="screener-scope-label" type="button" :aria-pressed="screenerScope === 'sender'" @click="screenerScope = 'sender'">{{ $t('mail.sender') }}</button>
                    <button class="screener-scope-toggle" type="button" role="switch" :aria-checked="screenerScope === 'message'" :aria-label="$t('mail.switchScope')" title="G" @click="screenerScope = screenerScope === 'sender' ? 'message' : 'sender'">
                      <span />
                    </button>
                    <button class="screener-scope-label screener-scope-message" type="button" :aria-pressed="screenerScope === 'message'" @click="screenerScope = 'message'">{{ $t('mail.thisMessage') }} <kbd>G</kbd></button>
                  </div>
                  <button class="screener-apply" type="button" :disabled="isSavingScreenerAction" @click="applyScreenerChoice(sender.latest, screenerDestination, screenerScope)"><span>{{ $t('mail.apply') }}</span><kbd>Y</kbd></button>
                  </div>
                </Transition>
              </div>
            </div>
            <button class="thread-row screener-message" type="button" :aria-label="$t('mail.readLatest', { address: sender.address })" @click="openMessage(sender.latest)">
              <span class="sender-avatar" :class="`avatar-${sender.latest.color}`">{{ sender.latest.initials }}</span>
              <span class="thread-content">
                <span class="thread-topline screener-sender-line"><span class="screener-sender-ident"><strong>{{ sender.latest.sender }}</strong><span class="thread-address">{{ sender.address }}</span></span><time>{{ sender.latest.date }}</time></span>
                <span class="thread-subject">{{ sender.latest.subject }}</span>
                <span class="thread-preview">{{ sender.latest.preview }}</span>
              </span>
              <span v-if="sender.count > 1" class="sender-message-count">{{ sender.count }}</span>
            </button>
          </article>
        </template>
        <template v-else>
          <p v-if="!visibleScreenerHistory.length" class="screener-empty">{{ $t('mail.screenerEmptyHistory') }}</p>
          <article v-for="sender in visibleScreenerHistory" :key="`${sender.address}-${sender.state}`" class="screener-row screener-history-row" role="listitem">
            <span class="screener-history-state" :class="`is-${sender.state}`">{{ $t(sender.state === 'blocked' ? 'mail.blocked' : 'mail.dismissed') }}</span>
            <button class="thread-row screener-message" type="button" :aria-label="$t('mail.readLatest', { address: sender.address })" @click="openMessage(sender.latest)">
              <span class="sender-avatar" :class="`avatar-${sender.latest.color}`">{{ sender.latest.initials }}</span>
              <span class="thread-content">
                <span class="thread-topline screener-sender-line"><span class="screener-sender-ident"><strong>{{ sender.latest.sender }}</strong><span class="thread-address">{{ sender.address }}</span></span><time>{{ sender.latest.date }}</time></span>
                <span class="thread-subject">{{ sender.latest.subject }}</span>
                <span class="thread-preview">{{ sender.latest.preview }}</span>
              </span>
              <span v-if="sender.count > 1" class="sender-message-count">{{ sender.count }}</span>
            </button>
            <button class="screener-restore" type="button" :disabled="isSavingScreenerAction" @click="restoreScreenerSender(sender.latest, sender.state)">{{ $t(sender.state === 'blocked' ? 'mail.restoreSender' : 'mail.restoreSenderPending') }}</button>
          </article>
        </template>
      </div>

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
              <button class="thread-avatar-trigger" :class="{ 'is-merged': thread.manualMergeIds.length, 'is-selected': threadSelectionMode && selectedThreadIds.includes(thread.id) }" type="button" :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(thread.id) ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')" :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(thread.id) : undefined" :title="$t(threadSelectionMode ? 'mail.selectionToggle' : 'mail.selectionHint')" @click="handleThreadAvatarClick(thread.id, $event)">
                <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
                  <span v-if="threadSelectionMode && selectedThreadIds.includes(thread.id)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                  <span v-else class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                  <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
                </span>
              </button>
              <button class="thread-row" type="button" :data-thread-row-id="thread.id" @click="handleThreadRowClick(thread, $event)">
                <span class="thread-content">
                  <span class="thread-subject">{{ thread.subject }}</span>
                  <span class="thread-preview"><strong>{{ thread.latest.sender }}</strong><span aria-hidden="true"> · </span>{{ thread.latest.preview }}</span>
                </span>
                <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
                <time class="thread-date">{{ thread.latest.date }}</time>
              </button>
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
              <button class="thread-avatar-trigger" :class="{ 'is-merged': thread.manualMergeIds.length, 'is-selected': threadSelectionMode && selectedThreadIds.includes(thread.id) }" type="button" :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(thread.id) ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')" :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(thread.id) : undefined" :title="$t(threadSelectionMode ? 'mail.selectionToggle' : 'mail.selectionHint')" @click="handleThreadAvatarClick(thread.id, $event)">
                <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
                  <span v-if="threadSelectionMode && selectedThreadIds.includes(thread.id)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                  <span v-else class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                  <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
                </span>
              </button>
              <button class="thread-row" type="button" :data-thread-row-id="thread.id" @click="handleThreadRowClick(thread, $event)">
                <span class="thread-content">
                  <span class="thread-subject">{{ thread.subject }}</span>
                  <span class="thread-preview"><strong>{{ thread.latest.sender }}</strong><span aria-hidden="true"> · </span>{{ thread.latest.preview }}</span>
                </span>
                <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
                <time class="thread-date">{{ thread.latest.date }}</time>
              </button>
            </div>
          </div>
        </section>
      </template>

      <div v-else-if="activeFolder !== 'Screener' && visibleThreads.length" class="thread-list other-folder-list" role="list">
        <div v-for="thread in visibleThreads" :key="thread.id" class="other-thread-row thread-selection-row" :class="{ 'is-thread-selected': selectedThreadIds.includes(thread.id), 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :data-thread-selection-id="thread.id" :aria-current="keyboardSelectionThreadId === thread.id ? 'true' : undefined" role="listitem">
          <span v-if="thread.unreadCount" class="unread-indicator" :class="{ 'is-selection-cursor': keyboardSelectionThreadId === thread.id }" :aria-label="$t(thread.unreadCount === 1 ? 'mail.unreadOne' : 'mail.unreadMany', { count: thread.unreadCount })">
            <svg v-if="keyboardSelectionThreadId === thread.id" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg>
          </span>
          <span v-else-if="keyboardSelectionThreadId === thread.id" class="thread-selection-cursor" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg></span>
          <button v-if="canSelectThreads" class="thread-avatar-trigger" :class="{ 'is-merged': thread.manualMergeIds.length, 'is-selected': threadSelectionMode && selectedThreadIds.includes(thread.id) }" type="button" :aria-label="$t(threadSelectionMode && selectedThreadIds.includes(thread.id) ? 'mail.deselectThread' : 'mail.selectThread', { subject: thread.latest.subject }) + (thread.manualMergeIds.length ? $t('mail.mergedThreadSuffix') : '')" :aria-pressed="threadSelectionMode ? selectedThreadIds.includes(thread.id) : undefined" :title="$t(threadSelectionMode ? 'mail.selectionToggle' : 'mail.selectionHint')" @click="handleThreadAvatarClick(thread.id, $event)">
            <span class="thread-avatar-wrap" :class="{ 'is-merged': thread.manualMergeIds.length }">
              <span v-if="threadSelectionMode && selectedThreadIds.includes(thread.id)" class="avatar-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
              <span v-else class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
              <span v-if="thread.manualMergeIds.length" class="merged-avatar-mark" aria-hidden="true" />
            </span>
          </button>
          <button class="thread-row" type="button" :data-thread-row-id="thread.id" @click="handleThreadRowClick(thread, $event)">
            <span class="thread-content">
              <span class="thread-subject">{{ thread.subject }}</span>
              <span class="thread-preview"><span v-if="['Set Aside', 'Reply Later'].includes(activeFolder) && thread.unreadCount && thread.messages.length > 1" class="set-aside-new-message">{{ $t('mail.newMessageInThread') }}</span><span v-if="['Set Aside', 'Reply Later'].includes(activeFolder) && thread.unreadCount && thread.messages.length > 1" aria-hidden="true"> · </span><strong>{{ thread.latest.sender }}</strong><span aria-hidden="true"> · </span>{{ thread.latest.preview }}</span>
            </span>
            <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
            <time class="thread-date">{{ thread.latest.date }}</time>
          </button>
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
                <span class="sender-avatar set-aside-stack-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                <span class="set-aside-stack-copy">
                  <strong>{{ thread.subject }}</strong>
                  <span>{{ thread.latest.sender }} · {{ thread.latest.preview }}</span>
                </span>
                <time>{{ thread.latest.date }}</time>
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
                <span class="sender-avatar set-aside-stack-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                <span class="set-aside-stack-copy">
                  <strong>{{ thread.subject }}</strong>
                  <span>{{ thread.latest.sender }} · {{ thread.latest.preview }}</span>
                </span>
                <time>{{ thread.latest.date }}</time>
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
      <div class="reading-toolbar">
        <button class="back-to-list" type="button" @click="closeMessage">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" /></svg>
          <span>{{ $t('mail.backToFolder', { folder: mailboxByName(activeFolder).label }) }}</span>
          <kbd>Esc</kbd>
        </button>
      </div>
      <div v-if="messageReadError" class="message-read-error" role="alert">
        <span>{{ messageReadError }}</span>
        <button v-if="selectedThread?.unreadCount" type="button" @click="retryMarkRead">{{ $t('mail.retryMarkRead') }}</button>
      </div>

      <article class="message-paper">
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
            {{ selectedThread?.messages.find(message => message.threadSubject)?.threadSubject || chronologicalMessages[0]?.subject || selectedMessage.subject }}
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
        <div v-if="selectedThread?.manualMergeIds.length" class="merged-thread-control">
          <span>{{ $t('mail.mergedConversationNote') }}</span>
          <button type="button" class="thread-split-button" :disabled="isSplittingThread" @click="splitDialogOpen = true">
            {{ isSplittingThread ? $t('mail.splitting') : $t('mail.splitThreads') }}
          </button>
        </div>
        <div class="thread-carousel">
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
                    <span class="sender-avatar thread-tab-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
                    <span class="thread-tab-sender">{{ message.sender }}</span>
                    <time>{{ message.date }}</time>
                  </span>
                  <span class="thread-tab-preview">{{ message.subject }} · {{ message.preview }}</span>
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
            <article
              v-if="activeThreadMessage"
              :key="activeThreadMessage.id"
              id="thread-message-panel"
              class="thread-message-card"
              :aria-label="$t('mail.messageFrom', { sender: activeThreadMessage.sender })"
            >
              <div class="message-meta">
                <span class="sender-avatar meta-avatar" :class="`avatar-${activeThreadMessage.color}`">{{ activeThreadMessage.initials }}</span>
                <span class="meta-copy">
                  <strong>{{ activeThreadMessage.sender }}</strong>
                  <span v-if="activeThreadMessage.isOutgoing">{{ $t('mail.recipient') }} {{ activeThreadMessage.recipient }}</span>
                  <NuxtLink v-else class="sender-profile-link" :to="senderPath(activeThreadMessage.address)">{{ activeThreadMessage.address }}</NuxtLink>
                </span>
                <time>{{ activeThreadMessage.date }}</time>
              </div>

              <div class="message-rule" />
              <div v-if="activeThreadMessage.isOutgoing && activeThreadMessage.htmlBody" class="message-rich-body" v-html="activeThreadMessage.htmlBody" />
              <template v-else><p v-for="(paragraph, paragraphIndex) in activeThreadMessage.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p></template>
              <div v-if="activeThreadMessage.attachments.length" class="attachment-list" :aria-label="$t('mail.attachments')">
                <span class="attachment-heading">{{ $t(activeThreadMessage.attachments.length === 1 ? 'mail.attachmentCountOne' : 'mail.attachmentCountMany', { count: activeThreadMessage.attachments.length }) }}</span>
                <a
                  v-for="attachment in activeThreadMessage.attachments"
                  :key="attachment.id"
                  class="attachment-item"
                  :href="`/api/attachments/${attachment.id}`"
                  :download="attachment.filename"
                  :aria-label="$t('mail.downloadAttachment', { filename: attachment.filename })"
                >
                  <span aria-hidden="true">↳</span>
                  <strong>{{ attachment.filename }}</strong>
                  <span>{{ Math.max(1, Math.round(attachment.sizeBytes / 1024)) }} Ko</span>
                </a>
              </div>
            </article>
            </Transition>
          </div>

          <div v-else class="thread-full-thread">
            <article
              v-for="message in chronologicalMessages"
              :id="'thread-full-message-' + message.id"
              :key="message.id"
              class="thread-message-card thread-full-message"
              :class="message.id === activeThreadMessage?.id ? 'is-selected' : undefined"
              :aria-label="$t('mail.messageFrom', { sender: message.sender })"
            >
              <div class="message-meta">
                <span class="sender-avatar meta-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
              <span class="meta-copy">
                <strong>{{ message.sender }}</strong>
                <span v-if="message.isOutgoing">{{ $t('mail.recipient') }} {{ message.recipient }}</span>
                <NuxtLink v-else class="sender-profile-link" :to="senderPath(message.address)">{{ message.address }}</NuxtLink>
                </span>
                <time>{{ message.date }}</time>
              </div>
              <div class="message-rule" />
              <div v-if="message.isOutgoing && message.htmlBody" class="message-rich-body" v-html="message.htmlBody" />
              <template v-else><p v-for="(paragraph, paragraphIndex) in message.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p></template>
              <div v-if="message.attachments.length" class="attachment-list" :aria-label="$t('mail.attachments')">
                <span class="attachment-heading">{{ $t(message.attachments.length === 1 ? 'mail.attachmentCountOne' : 'mail.attachmentCountMany', { count: message.attachments.length }) }}</span>
                <a
                  v-for="attachment in message.attachments"
                  :key="attachment.id"
                  class="attachment-item"
                  :href="`/api/attachments/${attachment.id}`"
                  :download="attachment.filename"
                  :aria-label="$t('mail.downloadAttachment', { filename: attachment.filename })"
                >
                  <span aria-hidden="true">↳</span>
                  <strong>{{ attachment.filename }}</strong>
                  <span>{{ Math.max(1, Math.round(attachment.sizeBytes / 1024)) }} Ko</span>
                </a>
              </div>
            </article>
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
      <div class="message-action-dock" role="toolbar" :aria-label="$t('mail.messageActions')">
        <div class="message-action-group">
          <button v-if="!replyComposerOpen && activeFolder !== 'Trash'" class="message-action-reply" type="button" @click="openReplyComposer">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5 3.5 9.5 8 14M4 9.5h7a5.5 5.5 0 0 1 5.5 5.5" /></svg>
            <span>{{ $t('mail.reply') }}</span><kbd>R</kbd>
          </button>
          <button v-if="activeFolder === 'Trash'" class="message-action-button" type="button" :disabled="isSavingScreenerAction" @click="restoreTrashedMessage(activeThreadMessage || selectedMessage)">
            {{ isSavingScreenerAction ? $t('mail.restoring') : $t('mail.restore') }}
          </button>
          <template v-else>
            <button v-if="activeFolder === 'Set Aside'" class="message-action-button" type="button" :disabled="isSavingSetAside" @click="setAsideThread(false)">
              {{ isSavingSetAside ? $t('mail.restoring') : $t('mail.restoreToMailbox') }}<kbd>A</kbd>
            </button>
            <button v-else-if="activeFolder === 'Imbox'" class="message-action-button" type="button" :disabled="isSavingSetAside" @click="setAsideThread(true)">
              {{ isSavingSetAside ? $t('mail.setAsideSaving') : 'Set Aside' }}<kbd>A</kbd>
            </button>
            <button v-else-if="activeFolder !== 'Reply Later'" class="message-action-button" type="button" @click="openClassification(activeThreadMessage || selectedMessage)">
              {{ $t(selectedThread?.manualMergeIds.length ? 'mail.classify' : 'mail.move') }}
            </button>
            <button v-if="activeFolder === 'Reply Later'" class="message-action-button" type="button" :disabled="isSavingReplyLater" @click="setReplyLater(false)">
              {{ isSavingReplyLater ? $t('mail.replyLaterRemoveSaving') : $t('mail.removeFromReplyLater') }}<kbd>L</kbd>
            </button>
            <button v-else-if="activeFolder !== 'Set Aside'" class="message-action-button" type="button" :disabled="isSavingReplyLater" @click="setReplyLater(true)">
              {{ isSavingReplyLater ? $t('mail.replyLaterSaving') : 'Reply Later' }}<kbd>L</kbd>
            </button>
          </template>
          <NTooltip v-if="['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(activeFolder)" :content="$t('palette.trashActionDescription')">
            <button class="message-action-trash" type="button" :aria-label="$t('palette.trashTitle')" :disabled="isTrashingThread" @click="threadTrashDialogOpen = true">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2m2 0-.7 10H6.7L6 6m3 3v4m2-4v4" /></svg>
            </button>
          </NTooltip>
        </div>
      </div>
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

    <NDialog
      :open="screenerShortcutHelpOpen"
      :title="$t('mail.screenerShortcutTitle')"
      :description="$t('mail.screenerShortcutDescription')"
      :_dialog-content="{ class: 'classification-dialog screener-shortcut-dialog-content' }"
      @update:open="(open: boolean) => { screenerShortcutHelpOpen = open }"
    >
      <template #content>
        <div class="screener-shortcut-dialog">
          <header class="dialog-header">
            <p class="dialog-kicker">{{ $t('mail.quickNavigation') }}</p>
            <NDialogTitle class="dialog-title">{{ $t('mail.screenerShortcutTitle') }}</NDialogTitle>
            <NDialogDescription class="sr-only">{{ $t('mail.screenerShortcutDescription') }}</NDialogDescription>
          </header>
          <dl>
            <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>{{ $t('mail.browseSenders') }}</dd></div>
            <div><dt><kbd>N</kbd></dt><dd>{{ $t('mail.blockSelectedAddress') }}</dd></div>
            <div><dt><kbd>Y</kbd></dt><dd>{{ $t('mail.openClassificationOptions') }}</dd></div>
            <div><dt><kbd>T</kbd></dt><dd>{{ $t('mail.trashSelectedMessage') }}</dd></div>
            <div><dt><kbd>C</kbd></dt><dd>{{ $t('mail.dismissAllPending') }}</dd></div>
            <div class="shortcut-dialog-divider"><dt><kbd>I</kbd> <kbd>F</kbd> <kbd>P</kbd></dt><dd>{{ $t('mail.chooseMailbox') }}</dd></div>
            <div><dt><kbd>G</kbd></dt><dd>{{ $t('mail.toggleSenderMessage') }}</dd></div>
            <div><dt><kbd>Enter</kbd> <kbd>Space</kbd> <kbd>Y</kbd></dt><dd>{{ $t('mail.applyClassification') }}</dd></div>
          </dl>
          <p class="screener-shortcut-footnote"><kbd>Esc</kbd> {{ $t('mail.escapeClosesHelp') }}</p>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="screenerClearDialogOpen"
      :title="$t('mail.screenerClearTitle')"
      :description="$t('mail.screenerClearDescription')"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog screener-confirm-dialog' }"
      @update:open="(open: boolean) => { screenerClearDialogOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">Screener</p>
          <NDialogTitle class="dialog-title">{{ $t('mail.screenerClearAllTitle') }}</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">{{ $t('mail.screenerClearAllDescription') }}</NDialogDescription>
        </header>
        <footer class="dialog-actions">
          <NDialogClose as-child>
            <button class="dialog-cancel" type="button" :disabled="isClearingScreener">{{ $t('mail.cancel') }}</button>
          </NDialogClose>
          <button class="dialog-danger" type="button" :disabled="isClearingScreener" @click="clearAllScreener">
            {{ isClearingScreener ? $t('mail.clearing') : $t('mail.clearAll') }}
          </button>
        </footer>
      </template>
    </NDialog>

    <OutgoingComposer v-if="composeOpen" v-model:open="composeOpen" :draft-id="composeDraftId" @sent="onOutgoingMessageSent" @show-drafts="goToDrafts" />
  </main>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
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
  body: string
  htmlBody: string
  attachments: { id: string, filename: string, mimeType: string, sizeBytes: number }[]
}

type MessageThread = {
  id: string
  messages: InboxMessage[]
  latest: InboxMessage
  subject: string
  unreadCount: number
  manualMergeIds: string[]
}

type SearchHit = {
  id: string
  folder: StoredFolder
  threadId: string
  snippet: string
}

type SearchThread = MessageThread & {
  snippet: string
}

const folders = mailboxes
const { $t } = useI18n()
const route = useRoute()
const router = useRouter()
const activeFolder = computed(() => mailboxFromPath(route.path))
const isGlobalSearch = computed(() => Boolean(search.value.trim()) && activeFolder.value !== 'Screener' && activeFolder.value !== 'Trash')
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
const selectedId = computed(() => threadIdFromPath(route.path))
const isReadingMessage = computed(() => Boolean(selectedId.value))
const searchResults = ref<SearchHit[]>([])
const searchTotal = ref(0)
const searchOffset = ref(0)
const searchHasMore = ref(false)
const searchLoading = ref(Boolean(isGlobalSearch.value))
const searchError = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRevision = 0
const openedFromList = ref(false)
const classificationTarget = ref<InboxMessage | null>(null)
const classificationScope = ref<'sender' | 'message' | 'group'>('sender')
const classificationFolder = ref<MailboxFolder>('Imbox')
const screenerView = ref<'pending' | 'history'>('pending')
const selectedScreenerAddress = ref('')
const openScreenerOptionsFor = ref('')
const screenerClearDialogOpen = ref(false)
const screenerShortcutHelpOpen = ref(false)
const screenerDestination = ref<MailboxFolder>('Imbox')
const screenerScope = ref<'sender' | 'message'>('sender')
const screenerActionError = ref('')
const threadSelectionMode = ref(false)
const selectedThreadIds = ref<string[]>([])
const isEditingThreadSubject = ref(false)
const threadSubjectDraft = ref('')
const threadSubjectSaveError = ref('')
const isSavingThreadSubject = ref(false)
const threadSubjectInput = ref<HTMLInputElement | null>(null)
const threadSubjectHeading = ref<HTMLElement | null>(null)
const subjectSelection = ref({ visible: false, left: 0, top: 0 })
const subjectContextMenu = ref({ open: false, left: 0, top: 0 })
const isSetAsideStackExpanded = ref(false)
const isReplyLaterStackExpanded = ref(false)
const viewportHeight = ref(800)
const keyboardSelectionThreadId = ref('')
const selectionAnchorThreadId = ref('')
const mergeDialogOpen = ref(false)
const splitDialogOpen = ref(false)
const isMergingThreads = ref(false)
const isSplittingThread = ref(false)
const threadMergeFeedback = ref('')
const threadMergeError = ref('')
const threadTrashDialogOpen = ref(false)
const bulkTrashDialogOpen = ref(false)
const isTrashingThread = ref(false)
const bulkActionFeedback = ref('')
const bulkActionError = ref('')
const isApplyingBulkAction = ref(false)
const isClearingScreener = ref(false)
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
const replyComposerOpen = ref(false)
const composeOpen = ref(false)
const composeDraftId = ref<string | null>(null)
const replySendConfirmOpen = ref(false)
const replyBody = ref('')
const replyError = ref('')
const replyLoading = ref(false)
const replyDraftTargetId = ref('')
const replyDraftStatus = ref<'draft' | 'sending'>('draft')
const replySaving = ref(false)
const replySending = ref(false)
const replySaved = ref(false)
let replySaveTimer: ReturnType<typeof setTimeout> | undefined
let replySaveRevision = 0
const isDevelopment = import.meta.dev
const composeRequest = useState('courrier-compose-request', () => 0)
const paletteContext = useState<{ source: MailboxKey, threadIds: string[] }>('courrier-palette-context', () => ({ source: 'Imbox', threadIds: [] }))
const paletteFeedback = useState('courrier-palette-feedback', () => '')
const paletteError = useState('courrier-palette-error', () => '')
let lastComposeRequest = composeRequest.value
const isImportingFixture = ref(false)
const fixtureError = ref('')
let undoTimer: ReturnType<typeof setTimeout> | undefined

function openNewComposer() {
  composeDraftId.value = null
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

const { data: inboxMessages, refresh: refreshMessages, error: inboxMessagesError } = await useFetch<InboxMessage[]>('/api/messages', {
  default: () => [],
})

watch([activeFolder, isGlobalSearch], () => {
  threadSelectionMode.value = false
  selectedThreadIds.value = []
  keyboardSelectionThreadId.value = ''
  selectionAnchorThreadId.value = ''
  threadMergeFeedback.value = ''
  threadMergeError.value = ''
})

watch([activeFolder, selectedThreadIds, selectedId], () => {
  paletteContext.value = {
    source: activeFolder.value,
    threadIds: selectedThreadIds.value.length
      ? [...selectedThreadIds.value]
      : selectedId.value ? [selectedId.value] : [],
  }
}, { immediate: true, deep: true })

watch(composeRequest, (request) => {
  if (request === lastComposeRequest) return
  lastComposeRequest = request
  openNewComposer()
})

watch([search, activeFolder], () => {
  if (!import.meta.client) return
  searchRevision += 1
  if (searchTimer) clearTimeout(searchTimer)
  searchResults.value = []
  searchTotal.value = 0
  searchOffset.value = 0
  searchHasMore.value = false
  searchError.value = ''

  if (!isGlobalSearch.value) {
    searchLoading.value = false
    return
  }

  searchLoading.value = true
  searchTimer = setTimeout(() => { void loadSearchPage(true) }, 240)
}, { immediate: true })

const folderMessages = computed(() => {
  return (inboxMessages.value ?? []).filter((message) => {
    if (activeFolder.value === 'Set Aside') return message.folder === 'Imbox' && message.isSetAside
    if (activeFolder.value === 'Reply Later') return message.isReplyLater
    if (activeFolder.value === 'Imbox') return message.folder === 'Imbox' && !message.isSetAside && !message.isReplyLater
    return message.folder === activeFolder.value && !message.isReplyLater
  })
})

const bulkMoveDestinations = computed<MailboxFolder[]>(() => {
  const destinations: MailboxFolder[] = ['Imbox', 'The Feed', 'Paper Trail']
  return activeFolder.value === 'Reply Later' || activeFolder.value === 'Set Aside'
    ? destinations
    : destinations.filter(folder => folder !== activeFolder.value)
})

const folderThreads = computed<MessageThread[]>(() => {
  const threads = new Map<string, InboxMessage[]>()
  for (const message of folderMessages.value) {
    const messages = threads.get(message.threadId) ?? []
    messages.push(message)
    threads.set(message.threadId, messages)
  }

  return [...threads.entries()].map(([id, messages]) => {
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return {
      id,
      messages,
      latest: messages[0]!,
      subject: messages.find(message => message.threadSubject)?.threadSubject || messages[0]!.subject,
      unreadCount: messages.filter(message => !message.isRead).length,
      manualMergeIds: [...new Set(messages.flatMap(message => message.manualMergeIds))],
    }
  })
})

const visibleThreads = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  const threads = ['Set Aside', 'Reply Later'].includes(activeFolder.value)
    ? [...folderThreads.value].sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp))
    : folderThreads.value
  if (!query) return threads

  return threads.filter(thread => thread.subject.toLocaleLowerCase('fr').includes(query) || thread.messages.some(message =>
    `${message.sender} ${message.subject} ${message.body}`.toLocaleLowerCase('fr').includes(query),
  ))
})
const setAsideThreads = computed<MessageThread[]>(() => {
  const threads = new Map<string, InboxMessage[]>()
  for (const message of inboxMessages.value ?? []) {
    if (message.folder !== 'Imbox' || !message.isSetAside) continue
    const messages = threads.get(message.threadId) ?? []
    messages.push(message)
    threads.set(message.threadId, messages)
  }

  return [...threads.entries()].map(([id, messages]) => {
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return {
      id,
      messages,
      latest: messages[0]!,
      subject: messages.find(message => message.threadSubject)?.threadSubject || messages[0]!.subject,
      unreadCount: messages.filter(message => !message.isRead).length,
      manualMergeIds: [...new Set(messages.flatMap(message => message.manualMergeIds))],
    }
}).sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp))
})
const stackPreviewLimit = computed(() => Math.max(1, Math.min(5, Math.floor((viewportHeight.value - 148) / 70) + 1)))
const setAsideStackPreview = computed(() => setAsideThreads.value.slice(0, stackPreviewLimit.value))
const setAsideStackExpandedHeight = computed(() =>
  `${76 + setAsideStackPreview.value.length * 70}px`)
const showSetAsideStack = computed(() => activeFolder.value === 'Imbox'
  && !isGlobalSearch.value
  && !threadSelectionMode.value
  && setAsideThreads.value.length > 0)
const replyLaterThreads = computed<MessageThread[]>(() => {
  const threads = new Map<string, InboxMessage[]>()
  for (const message of inboxMessages.value ?? []) {
    if (!message.isReplyLater) continue
    const messages = threads.get(message.threadId) ?? []
    messages.push(message)
    threads.set(message.threadId, messages)
  }

  return [...threads.entries()].map(([id, messages]) => {
    messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return {
      id,
      messages,
      latest: messages[0]!,
      subject: messages.find(message => message.threadSubject)?.threadSubject || messages[0]!.subject,
      unreadCount: messages.filter(message => !message.isRead).length,
      manualMergeIds: [...new Set(messages.flatMap(message => message.manualMergeIds))],
    }
  }).sort((a, b) => b.latest.timestamp.localeCompare(a.latest.timestamp))
})
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

  return [...groups.entries()].map(([id, group]) => ({
    id,
    messages: group.messages,
    latest: group.latest,
    subject: group.subject,
    unreadCount: group.messages.filter(message => !message.isRead).length,
    manualMergeIds: [...new Set(group.messages.flatMap(message => message.manualMergeIds))],
    snippet: group.snippet,
  }))
})

const newThreads = computed(() => visibleThreads.value.filter(thread => thread.unreadCount > 0))
const previouslySeenThreads = computed(() => visibleThreads.value.filter(thread => thread.unreadCount === 0))
const selectableThreads = computed(() => activeFolder.value === 'Imbox'
  ? [...newThreads.value, ...previouslySeenThreads.value]
  : visibleThreads.value)

const allScreenerSenders = computed(() => {
  const senders = new Map<string, { address: string, latest: InboxMessage, count: number, state: 'pending' }>()

  for (const message of (inboxMessages.value ?? []).filter(message => message.folder === 'Screener' && message.screenerState === 'pending')) {
    const address = message.address.trim().toLocaleLowerCase('en-US')
    const existing = senders.get(address)
    if (existing) existing.count += 1
    else senders.set(address, { address: message.address, latest: message, count: 1, state: 'pending' })
  }

  return [...senders.values()]
})

const screenerHistorySenders = computed(() => {
  const senders = new Map<string, { address: string, latest: InboxMessage, count: number, state: 'cleared' | 'blocked' }>()

  for (const message of (inboxMessages.value ?? []).filter(message => message.folder === 'Screener' && message.screenerState !== 'pending')) {
    const address = message.address.trim().toLocaleLowerCase('en-US')
    const existing = senders.get(address)
    if (existing) {
      existing.count += 1
      if (message.screenerState === 'blocked') existing.state = 'blocked'
    } else {
      senders.set(address, {
        address: message.address,
        latest: message,
        count: 1,
        state: message.screenerState === 'blocked' ? 'blocked' : 'cleared',
      })
    }
  }

  return [...senders.values()]
})

const screenerSenders = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  if (!query) return allScreenerSenders.value

  return allScreenerSenders.value.filter(({ address, latest }) =>
    `${address} ${latest.sender} ${latest.subject} ${latest.body}`.toLocaleLowerCase('fr').includes(query),
  )
})

const visibleScreenerHistory = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  if (!query) return screenerHistorySenders.value

  return screenerHistorySenders.value.filter(({ address, latest }) =>
    `${address} ${latest.sender} ${latest.subject} ${latest.body}`.toLocaleLowerCase('fr').includes(query),
  )
})

watch(screenerSenders, (senders) => {
  if (!senders.some(sender => sender.address.trim().toLocaleLowerCase('en-US') === selectedScreenerAddress.value)) {
    selectedScreenerAddress.value = ''
    openScreenerOptionsFor.value = ''
  }
})

const selectedThread = computed(() => folderThreads.value.find(thread => thread.id === selectedId.value))
const selectedMessage = computed(() => selectedThread.value?.latest)
const chronologicalMessages = computed(() => [...(selectedThread.value?.messages ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
const activeThreadMessageId = ref('')
const threadSlideDirection = ref(1)
const isReadingAll = ref(false)
const threadMessageRail = ref<HTMLDivElement | null>(null)
const railCanScrollStart = ref(false)
const railCanScrollEnd = ref(false)
const activeThreadMessage = computed(() => chronologicalMessages.value.find(message => message.id === activeThreadMessageId.value) ?? selectedMessage.value)
const activeThreadMessageIndex = computed(() => chronologicalMessages.value.findIndex(message => message.id === activeThreadMessage.value?.id))
const replyRecipient = computed(() => activeThreadMessage.value?.isOutgoing
  ? activeThreadMessage.value.recipient
  : activeThreadMessage.value?.address || '')

watch(replyBody, () => {
  if (!replyComposerOpen.value || replyLoading.value || replyDraftStatus.value === 'sending') return
  replySaveRevision += 1
  if (replySaveTimer) clearTimeout(replySaveTimer)
  replySaved.value = false
  replySaveTimer = setTimeout(() => { void saveReplyDraft() }, 650)
})

watch(selectedId, (threadId) => {
  isEditingThreadSubject.value = false
  threadSubjectSaveError.value = ''
  const thread = selectedThread.value
  if (!threadId) {
    activeThreadMessageId.value = ''
    isReadingAll.value = false
    openedFromList.value = false
    return
  }
  if (!thread) return

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

function updateThreadRailOverflow() {
  const rail = threadMessageRail.value
  if (!rail) {
    railCanScrollStart.value = false
    railCanScrollEnd.value = false
    return
  }

  const hasOverflow = rail.scrollWidth > rail.clientWidth + 2
  railCanScrollStart.value = hasOverflow && activeThreadMessageIndex.value > 0
  railCanScrollEnd.value = hasOverflow && activeThreadMessageIndex.value < chronologicalMessages.value.length - 1
}

function revealThreadTab(messageId: string) {
  const rail = threadMessageRail.value
  const tab = document.getElementById(`thread-message-tab-${messageId}`)
  if (!rail || !tab) return

  const railRect = rail.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  const nextScrollLeft = tabRect.left < railRect.left
    ? rail.scrollLeft + tabRect.left - railRect.left
    : tabRect.right > railRect.right
      ? rail.scrollLeft + tabRect.right - railRect.right
      : rail.scrollLeft
  rail.scrollTo({ left: nextScrollLeft, behavior: 'instant' })
  updateThreadRailOverflow()
}

function resetThreadPresentation(activeMessageId: string) {
  activeThreadMessageId.value = activeMessageId
  isReadingAll.value = false
}

function selectThreadMessage(messageId: string) {
  const nextIndex = chronologicalMessages.value.findIndex(message => message.id === messageId)
  if (nextIndex < 0) return

  threadSlideDirection.value = nextIndex > activeThreadMessageIndex.value ? 1 : -1
  activeThreadMessageId.value = messageId
  void router.replace({ path: route.path, query: { ...route.query, message: messageId } })
}

function navigateThreadMessage(direction: -1 | 1) {
  const nextMessage = chronologicalMessages.value[activeThreadMessageIndex.value + direction]
  if (nextMessage) selectThreadMessage(nextMessage.id)
}

function toggleReadAll() {
  isReadingAll.value = !isReadingAll.value
}

async function openReplyComposer() {
  const message = activeThreadMessage.value
  if (!message || replyLoading.value) return
  replyError.value = ''
  replySaved.value = false
  replyBody.value = ''
  replyDraftStatus.value = 'draft'
  replyDraftTargetId.value = message.id
  replyComposerOpen.value = true
  replyLoading.value = true
  try {
    const draft = await $fetch<{ id: string, to: string, subject: string, textBody: string, status: 'draft' | 'sending' } | null>(`/api/messages/${encodeURIComponent(message.id)}/draft`)
    replyBody.value = draft?.textBody ?? ''
    replyDraftStatus.value = draft?.status ?? 'draft'
    replySaved.value = Boolean(draft)
  } catch {
    replyError.value = $t('mail.replyLoadError')
  } finally {
    replyLoading.value = false
  }
}

async function saveReplyDraft() {
  const messageId = replyDraftTargetId.value
  if (!messageId || replyDraftStatus.value === 'sending' || replySaving.value) return
  if (replySaveTimer) {
    clearTimeout(replySaveTimer)
    replySaveTimer = undefined
  }

  replySaving.value = true
  replyError.value = ''
  const revision = replySaveRevision
  const textBody = replyBody.value
  try {
    const draft = await $fetch<{ status: 'draft' | 'sending' }>(`/api/messages/${encodeURIComponent(messageId)}/draft`, {
      method: 'PUT',
      body: { textBody },
    })
    replyDraftStatus.value = draft.status
    replySaved.value = true
  } catch {
    replySaved.value = false
    replyError.value = $t('mail.replySaveError')
  } finally {
    replySaving.value = false
    if (revision !== replySaveRevision && replyDraftStatus.value !== 'sending') void saveReplyDraft()
  }
}

async function requestReplySend() {
  if (!replyBody.value.trim() || replySending.value) return
  if (replySaveTimer) {
    clearTimeout(replySaveTimer)
    replySaveTimer = undefined
  }
  await saveReplyDraft()
  while (replySaving.value) await new Promise(resolve => setTimeout(resolve, 25))
  if (!replySaved.value || replyError.value) return
  replySendConfirmOpen.value = true
}

async function sendReply() {
  const messageId = replyDraftTargetId.value
  if (!messageId || replySending.value) return
  replySending.value = true
  replyError.value = ''
  let sent: { id: string, folder: MailboxFolder } | undefined
  try {
    sent = await $fetch<{ id: string, folder: MailboxFolder }>(`/api/messages/${encodeURIComponent(messageId)}/send`, { method: 'POST' })
    replySendConfirmOpen.value = false
    replyComposerOpen.value = false
  } catch (error) {
    replySendConfirmOpen.value = false
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    replyError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('mail.replySendError')
    if (replyError.value.includes('état est incertain') || replyError.value.includes('accepté par Cloudflare')) {
      replyDraftStatus.value = 'sending'
    }
  } finally {
    replySending.value = false
  }
  if (!sent) return

  try {
    await refreshMessages()
    if (activeFolder.value === 'Reply Later') {
      await router.push(mailboxPath(sent.folder))
    } else {
      await router.replace({ path: route.path, query: { ...route.query, message: sent.id } })
    }
  } catch {
    replyError.value = $t('mail.replySentReloadError')
  }
}

watch(activeThreadMessageId, async (messageId) => {
  if (replyComposerOpen.value && replyDraftTargetId.value && replyDraftTargetId.value !== messageId) {
    replyComposerOpen.value = false
    void saveReplyDraft()
  }
  await nextTick()
  revealThreadTab(messageId)
  if (isReadingAll.value) {
    document.getElementById(`thread-full-message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})

function handleThreadKeydown(event: KeyboardEvent) {
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  if (activeFolder.value === 'Screener' && screenerView.value === 'pending') {
    if (screenerShortcutHelpOpen.value) {
      if (event.key === 'Escape') {
        event.preventDefault()
        screenerShortcutHelpOpen.value = false
      }
      return
    }

    if (screenerClearDialogOpen.value) {
      if (event.key === 'Escape') {
        event.preventDefault()
        screenerClearDialogOpen.value = false
      }
      return
    }

    const senders = screenerSenders.value
    const selectedAddress = selectedScreenerAddress.value
    const selected = senders.find(sender => sender.address.trim().toLocaleLowerCase('en-US') === selectedAddress)
    const key = event.key.toLocaleLowerCase('en-US')

    if (event.key === '?') {
      event.preventDefault()
      screenerShortcutHelpOpen.value = true
      return
    }

    if (event.key === 'Escape' && openScreenerOptionsFor.value) {
      event.preventDefault()
      openScreenerOptionsFor.value = ''
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!senders.length) return
      event.preventDefault()
      const currentIndex = senders.findIndex(sender => sender.address.trim().toLocaleLowerCase('en-US') === selectedAddress)
      const nextIndex = currentIndex < 0
        ? (event.key === 'ArrowDown' ? 0 : senders.length - 1)
        : Math.max(0, Math.min(senders.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)))
      selectedScreenerAddress.value = senders[nextIndex]!.address.trim().toLocaleLowerCase('en-US')
      openScreenerOptionsFor.value = ''
      void nextTick(() => document.querySelector<HTMLElement>('.screener-row.is-keyboard-selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
      return
    }

    if (key === 'c' && senders.length) {
      event.preventDefault()
      screenerClearDialogOpen.value = true
      return
    }

    if (!selected) return

    if (openScreenerOptionsFor.value === selected.address && ['i', 'f', 'p', 'g', 'y', 'enter', ' '].includes(key)) {
      event.preventDefault()
      if (key === 'i') screenerDestination.value = 'Imbox'
      else if (key === 'f') screenerDestination.value = 'The Feed'
      else if (key === 'p') screenerDestination.value = 'Paper Trail'
      else if (key === 'g') screenerScope.value = screenerScope.value === 'sender' ? 'message' : 'sender'
      else void applyScreenerChoice(selected.latest, screenerDestination.value, screenerScope.value)
      return
    }

    if (key === 'n') {
      event.preventDefault()
      openScreenerOptionsFor.value = ''
      void blockScreenerSender(selected.latest)
    } else if (key === 'y') {
      event.preventDefault()
      toggleScreenerOptions(selected.address, selected.latest)
      if (openScreenerOptionsFor.value === selected.address) {
        void nextTick(() => document.querySelector<HTMLButtonElement>('.screener-destinations button[aria-pressed="true"]')?.focus())
      }
    } else if (key === 't') {
      event.preventDefault()
      openScreenerOptionsFor.value = ''
      void trashScreenerMessage(selected.latest)
    }
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
  }

  const isThreadListTarget = target instanceof Element && Boolean(target.closest('.thread-list'))
  const isPageTarget = target === document.body || target === document.documentElement
  if (!isReadingMessage.value && canNavigateThreads.value && (isThreadListTarget || isPageTarget)) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelectionCursor(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    const keyboardThread = selectableThreads.value.find(thread => thread.id === keyboardSelectionThreadId.value)
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

  if (event.key === 'Escape' && openScreenerOptionsFor.value) {
    openScreenerOptionsFor.value = ''
    return
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

  if (event.key === 'Escape') {
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

let threadRailResizeObserver: ResizeObserver | undefined
function updateStackPreviewLimit() {
  viewportHeight.value = window.innerHeight
}

watch(threadMessageRail, async (rail) => {
  threadRailResizeObserver?.disconnect()
  if (rail && typeof ResizeObserver !== 'undefined') {
    threadRailResizeObserver = new ResizeObserver(updateThreadRailOverflow)
    threadRailResizeObserver.observe(rail)
  }
  await nextTick()
  if (rail && activeThreadMessage.value) revealThreadTab(activeThreadMessage.value.id)
  updateThreadRailOverflow()
}, { flush: 'post' })

watch(isReadingMessage, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  if (activeThreadMessage.value) revealThreadTab(activeThreadMessage.value.id)
  updateThreadRailOverflow()
}, { flush: 'post' })

watch(() => chronologicalMessages.value.length, async () => {
  await nextTick()
  updateThreadRailOverflow()
}, { flush: 'post' })

onMounted(() => {
  updateStackPreviewLimit()
  window.addEventListener('resize', updateStackPreviewLimit, { passive: true })
  window.addEventListener('keydown', handleThreadKeydown)
  window.addEventListener('pointerdown', handleScreenerOutsideClick)
  window.addEventListener('pointerdown', handleStackOutsideClick)
  window.addEventListener('pointerdown', closeSubjectContextMenu)
  window.addEventListener('keydown', closeSubjectContextMenuOnEscape)
  document.addEventListener('selectionchange', updateSubjectSelection)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateStackPreviewLimit)
  window.removeEventListener('keydown', handleThreadKeydown)
  window.removeEventListener('pointerdown', handleScreenerOutsideClick)
  window.removeEventListener('pointerdown', handleStackOutsideClick)
  window.removeEventListener('pointerdown', closeSubjectContextMenu)
  window.removeEventListener('keydown', closeSubjectContextMenuOnEscape)
  document.removeEventListener('selectionchange', updateSubjectSelection)
  threadRailResizeObserver?.disconnect()
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

function openMessage(message: InboxMessage, mailbox: Folder = message.folder) {
  openedFromList.value = true
  messageReadError.value = ''
  resetThreadPresentation(message.id)
  void router.push({
    path: threadPath(mailbox, message.threadId),
    query: { ...route.query, message: message.id },
  })

  const unread = (inboxMessages.value ?? []).filter(item => item.folder === message.folder && item.threadId === message.threadId && !item.isRead)
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

function beginThreadSubjectEdit() {
  if (!selectedThread.value) return
  subjectSelection.value.visible = false
  subjectContextMenu.value.open = false
  threadSubjectDraft.value = selectedThread.value.messages.find(message => message.threadSubject)?.threadSubject
    || chronologicalMessages.value[0]?.subject
    || selectedThread.value.subject
  threadSubjectSaveError.value = ''
  isEditingThreadSubject.value = true
  void nextTick(() => threadSubjectInput.value?.focus())
}

function updateSubjectSelection() {
  const heading = threadSubjectHeading.value
  const selection = window.getSelection()
  if (!heading || !selection || selection.isCollapsed || !selection.toString().trim()
    || !heading.contains(selection.anchorNode) || !heading.contains(selection.focusNode)) {
    subjectSelection.value.visible = false
    return
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect()
  subjectSelection.value = {
    visible: rect.width > 0 && rect.height > 0,
    left: Math.max(12, Math.min(window.innerWidth - 46, rect.right - 12)),
    top: Math.max(12, rect.top - 44),
  }
}

function openSubjectContextMenu(event: MouseEvent) {
  // Ctrl-right-click deliberately keeps the browser's own context menu available.
  if (event.ctrlKey) return
  event.preventDefault()
  subjectSelection.value.visible = false
  subjectContextMenu.value = {
    open: true,
    left: Math.max(12, Math.min(window.innerWidth - 228, event.clientX)),
    top: Math.max(12, Math.min(window.innerHeight - 54, event.clientY)),
  }
}

function closeSubjectContextMenu(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.thread-subject-context-menu')) {
    subjectContextMenu.value.open = false
  }
}

function closeSubjectContextMenuOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !subjectContextMenu.value.open) return
  event.preventDefault()
  subjectContextMenu.value.open = false
}

function cancelThreadSubjectEdit() {
  if (isSavingThreadSubject.value) return
  isEditingThreadSubject.value = false
  threadSubjectSaveError.value = ''
}

async function saveThreadSubject() {
  const thread = selectedThread.value
  if (!thread || isSavingThreadSubject.value) return

  const subject = threadSubjectDraft.value.trim()
  if (subject.length > 200) {
    threadSubjectSaveError.value = $t('rename.tooLong')
    return
  }

  isSavingThreadSubject.value = true
  threadSubjectSaveError.value = ''
  try {
    await $fetch(`/api/threads/${encodeURIComponent(thread.id)}/subject`, {
      method: 'PATCH',
      body: { subject: subject || null },
    })
    await refreshMessages()
    isEditingThreadSubject.value = false
  } catch (error) {
    threadSubjectSaveError.value = error instanceof Error ? error.message : $t('rename.error')
  } finally {
    isSavingThreadSubject.value = false
  }
}

function handleThreadRowClick(thread: MessageThread, event?: MouseEvent) {
  if (threadSelectionMode.value) {
    toggleThreadSelection(thread.id, event)
    return
  }
  openMessage(thread.latest, activeFolder.value)
}

function handleThreadAvatarClick(threadId: string, event: MouseEvent) {
  event.stopPropagation()
  if (!threadSelectionMode.value) {
    startThreadSelection(threadId)
    return
  }
  toggleThreadSelection(threadId, event)
}

function startThreadSelection(threadId: string) {
  threadMergeError.value = ''
  threadSelectionMode.value = true
  selectedThreadIds.value = [threadId]
  selectionAnchorThreadId.value = threadId
  keyboardSelectionThreadId.value = threadId
}

function toggleThreadSelection(threadId: string, event?: MouseEvent) {
  threadMergeError.value = ''
  keyboardSelectionThreadId.value = threadId
  const orderedIds = selectableThreads.value.map(thread => thread.id)
  const anchorIndex = orderedIds.indexOf(selectionAnchorThreadId.value)
  const targetIndex = orderedIds.indexOf(threadId)
  if (event?.shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
    selectedThreadIds.value = [...new Set([...selectedThreadIds.value, ...orderedIds.slice(start, end + 1)])]
    return
  }
  if (selectedThreadIds.value.includes(threadId)) {
    const remainingIds = selectedThreadIds.value.filter(id => id !== threadId)
    if (!remainingIds.length) {
      clearThreadSelection()
      return
    }
    selectedThreadIds.value = remainingIds
  } else {
    selectedThreadIds.value = [...selectedThreadIds.value, threadId]
  }
  selectionAnchorThreadId.value = threadId
}

function clearThreadSelection() {
  selectedThreadIds.value = []
  threadSelectionMode.value = false
  keyboardSelectionThreadId.value = ''
  selectionAnchorThreadId.value = ''
}

async function applyBulkAction(action: 'mark-seen' | 'reply-later' | 'set-aside' | 'move' | 'trash', options: { enabled?: boolean, folder?: MailboxFolder } = {}) {
  if (!selectedThreadIds.value.length || isApplyingBulkAction.value) return
  isApplyingBulkAction.value = true
  bulkActionError.value = ''
  bulkActionFeedback.value = ''
  try {
    const result = await $fetch<{ affectedThreads: number }>('/api/threads/bulk-action', {
      method: 'PATCH',
      body: { threadIds: selectedThreadIds.value, source: activeFolder.value, action, ...options },
    })
    if (action === 'trash') bulkTrashDialogOpen.value = false
    await refreshMessages()
    clearThreadSelection()
    const count = result.affectedThreads
    const plural = count === 1 ? 'One' : 'Many'
    const key = action === 'mark-seen' ? `bulk.markSeenDone${plural}`
      : action === 'reply-later' ? options.enabled ? `bulk.replyLaterDone${plural}` : `bulk.replyLaterRemoved${plural}`
        : action === 'set-aside' ? options.enabled ? `bulk.setAsideDone${plural}` : `bulk.setAsideRemoved${plural}`
          : action === 'move' ? `bulk.moveDone${plural}` : `bulk.trashDone${plural}`
    bulkActionFeedback.value = $t(key, { count, folder: mailboxByName(options.folder ?? 'Imbox').label })
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    bulkActionError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('bulk.error')
  } finally {
    isApplyingBulkAction.value = false
  }
}

async function trashOpenThread() {
  const thread = selectedThread.value
  const source = activeFolder.value
  if (!thread || !['Imbox', 'The Feed', 'Paper Trail', 'Reply Later', 'Set Aside'].includes(source) || isTrashingThread.value) return

  isTrashingThread.value = true
  bulkActionError.value = ''
  try {
    await $fetch('/api/threads/bulk-action', {
      method: 'PATCH',
      body: { threadIds: [thread.id], source, action: 'trash' },
    })
    threadTrashDialogOpen.value = false
    bulkActionFeedback.value = $t('messageActions.trashDone')
    await refreshMessages().catch(() => {})
    void router.push(mailboxPath(source))
  } catch {
    bulkActionError.value = $t('palette.actionError')
  } finally {
    isTrashingThread.value = false
  }
}

function moveSelectedThreads(event: Event) {
  const select = event.target
  if (!(select instanceof HTMLSelectElement) || !select.value) return
  const destination = select.value as MailboxFolder
  select.value = ''
  void applyBulkAction('move', { folder: destination })
}

function moveSelectionCursor(direction: -1 | 1) {
  const threads = selectableThreads.value
  if (!threads.length) return
  const currentIndex = threads.findIndex(thread => thread.id === keyboardSelectionThreadId.value)
  const nextIndex = currentIndex < 0
    ? (direction === 1 ? 0 : threads.length - 1)
    : Math.max(0, Math.min(threads.length - 1, currentIndex + direction))
  const thread = threads[nextIndex]!
  keyboardSelectionThreadId.value = thread.id
  void nextTick(() => {
    const row = [...document.querySelectorAll<HTMLElement>('.thread-selection-row')]
      .find(element => element.dataset.threadSelectionId === thread.id)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    row?.querySelector<HTMLButtonElement>('.thread-row')?.focus({ preventScroll: true })
  })
}

async function mergeSelectedThreads() {
  if (selectedThreadIds.value.length < 2 || isMergingThreads.value) return
  isMergingThreads.value = true
  threadMergeError.value = ''
  try {
    const result = await $fetch<{ mergedThreads: number }>('/api/thread-merges', {
      method: 'POST',
      body: { threadIds: selectedThreadIds.value },
    })
    mergeDialogOpen.value = false
    threadSelectionMode.value = false
    selectedThreadIds.value = []
    keyboardSelectionThreadId.value = ''
    selectionAnchorThreadId.value = ''
    await refreshMessages()
    threadMergeFeedback.value = $t('mail.mergeDone', { count: result.mergedThreads })
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    threadMergeError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('mail.mergeError')
  } finally {
    isMergingThreads.value = false
  }
}

async function splitSelectedThread() {
  const threadId = selectedThread.value?.id
  if (!threadId || isSplittingThread.value) return
  isSplittingThread.value = true
  threadMergeError.value = ''
  try {
    const result = await $fetch<{ originalThreads: number }>('/api/thread-merges/split', {
      method: 'POST',
      body: { threadId },
    })
    splitDialogOpen.value = false
    await refreshMessages()
    closeMessage()
    threadMergeFeedback.value = $t('mail.splitDone', { count: result.originalThreads })
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null
    threadMergeError.value = data && typeof data === 'object' && 'statusMessage' in data
      ? String(data.statusMessage)
      : $t('mail.splitError')
  } finally {
    isSplittingThread.value = false
  }
}

async function loadSearchPage(reset = false) {
  if (!isGlobalSearch.value) return

  if (reset) {
    searchResults.value = []
    searchOffset.value = 0
  }

  const offset = reset ? 0 : searchOffset.value
  const revision = ++searchRevision
  searchLoading.value = true
  searchError.value = ''

  try {
    const response = await $fetch<{
      results: SearchHit[]
      total: number
      hasMore: boolean
      nextOffset: number | null
    }>('/api/search', {
      query: { q: search.value.trim(), offset },
    })

    if (revision !== searchRevision) return

    if (reset) searchResults.value = response.results
    else {
      const knownIds = new Set(searchResults.value.map(result => result.id))
      searchResults.value = [...searchResults.value, ...response.results.filter(result => !knownIds.has(result.id))]
    }
    searchTotal.value = response.total
    searchHasMore.value = response.hasMore
    searchOffset.value = response.nextOffset ?? offset + response.results.length
  } catch {
    if (revision === searchRevision) searchError.value = $t('mail.searchError')
  } finally {
    if (revision === searchRevision) searchLoading.value = false
  }
}

function loadMoreSearchResults() {
  if (searchHasMore.value && !searchLoading.value) void loadSearchPage()
}

function setMessageRead(message: InboxMessage, isRead: boolean) {
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

function toggleScreenerOptions(address: string, message: InboxMessage) {
  if (openScreenerOptionsFor.value === address) {
    openScreenerOptionsFor.value = ''
    return
  }

  screenerDestination.value = 'Imbox'
  screenerScope.value = 'sender'
  openScreenerOptionsFor.value = address
}

function requestClearScreener() {
  if (allScreenerSenders.value.length && !isClearingScreener.value) screenerClearDialogOpen.value = true
}

async function applyScreenerChoice(message: InboxMessage, folder: MailboxFolder, scope: 'sender' | 'message') {
  if (isSavingScreenerAction.value) return
  isSavingScreenerAction.value = true
  screenerActionError.value = ''
  openScreenerOptionsFor.value = ''

  try {
    if (scope === 'sender') {
      const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(message.id)}/sender-rule`, {
        method: 'PUT',
        body: { folder },
      })
      showClassificationFeedback($t(result.affectedMessages === 1 ? 'mail.classificationDoneOne' : 'mail.classificationDoneMany', { count: result.affectedMessages, folder: mailboxByName(result.folder).label }), result.undoId)
    } else {
      await $fetch(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
        method: 'PATCH',
        body: { folder },
      })
      showClassificationFeedback($t('mail.messageClassified'))
    }
    classificationTarget.value = null
    await refreshMessages()
  } catch {
    screenerActionError.value = $t('mail.classificationError')
  } finally {
    isSavingScreenerAction.value = false
  }
}

async function blockScreenerSender(message: InboxMessage) {
  if (isSavingScreenerAction.value) return
  isSavingScreenerAction.value = true
  screenerActionError.value = ''
  try {
    const result = await $fetch<{ preservedMessages: number }>(`/api/messages/${encodeURIComponent(message.id)}/block-sender`, {
      method: 'POST',
    })
    showClassificationFeedback($t(result.preservedMessages === 1 ? 'mail.blockedOne' : 'mail.blockedMany', { count: result.preservedMessages }))
    await refreshMessages()
  } catch {
    screenerActionError.value = $t('mail.screenerBlockError')
  } finally {
    isSavingScreenerAction.value = false
  }
}

async function trashScreenerMessage(message: InboxMessage) {
  if (isSavingScreenerAction.value) return
  isSavingScreenerAction.value = true
  screenerActionError.value = ''
  try {
    await $fetch(`/api/messages/${encodeURIComponent(message.id)}/trash`, { method: 'POST' })
    showClassificationFeedback($t('mail.screenerMessageTrashed'))
    await refreshMessages()
  } catch {
    screenerActionError.value = $t('mail.screenerTrashError')
  } finally {
    isSavingScreenerAction.value = false
  }
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

async function clearAllScreener() {
  if (isClearingScreener.value || !allScreenerSenders.value.length) return
  screenerClearDialogOpen.value = false
  isClearingScreener.value = true
  screenerActionError.value = ''
  try {
    const result = await $fetch<{ clearedMessages: number }>('/api/screener/clear', { method: 'POST' })
    showClassificationFeedback($t(result.clearedMessages === 1 ? 'mail.screenerClearedOne' : 'mail.screenerClearedMany', { count: result.clearedMessages }))
    await refreshMessages()
  } catch {
    screenerActionError.value = $t('mail.screenerClearError')
  } finally {
    isClearingScreener.value = false
  }
}

async function restoreScreenerSender(message: InboxMessage, state: 'cleared' | 'blocked') {
  if (isSavingScreenerAction.value) return
  isSavingScreenerAction.value = true
  screenerActionError.value = ''
  try {
    if (state === 'blocked') {
      await $fetch(`/api/messages/${encodeURIComponent(message.id)}/unblock-sender`, { method: 'POST' })
      showClassificationFeedback($t('mail.senderAllowed'))
    } else {
      await $fetch(`/api/messages/${encodeURIComponent(message.id)}/restore-screener`, { method: 'POST' })
      showClassificationFeedback($t('mail.messagesRestoredToScreener'))
    }
    await refreshMessages()
  } catch {
    screenerActionError.value = $t('mail.screenerUpdateError')
  } finally {
    isSavingScreenerAction.value = false
  }
}

async function retryMarkRead() {
  const unread = selectedThread.value?.messages.filter(message => !message.isRead) ?? []
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

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  searchRevision += 1
})

useSeoMeta({
  title: 'Courrier — votre boîte, à votre façon',
  description: 'Une boîte de réception personnelle pour vos domaines.',
})
</script>
