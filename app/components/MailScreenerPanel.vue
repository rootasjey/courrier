<template>
  <div class="thread-list screener-list" role="list" :aria-label="$t('mail.screenerSenders')">
    <div class="screener-list-tools">
      <div class="screener-view-switch" role="group" :aria-label="$t('mail.screenerMessages')">
        <button type="button" :aria-pressed="model.view.value === 'pending'" @click="model.view.value = 'pending'">{{ $t('mail.screenerPending') }} <span>{{ model.allSenders.value.length }}</span></button>
        <button type="button" :aria-pressed="model.view.value === 'history'" @click="model.view.value = 'history'">{{ $t('mail.screenerHistory') }} <span>{{ model.historySenders.value.length }}</span></button>
      </div>
      <button v-if="model.view.value === 'pending' && model.allSenders.value.length" class="screener-clear-all" type="button" :disabled="model.isClearing.value" @click="model.requestClear()">
        {{ model.isClearing.value ? $t('mail.screenerClearPending') : $t('mail.screenerClearAll') }}
      </button>
    </div>
    <template v-if="model.view.value === 'pending'">
      <p v-if="!model.senders.value.length" class="screener-empty">{{ $t('mail.screenerEmptyPending') }}</p>
      <article v-for="sender in model.senders.value" :key="sender.address" class="screener-row" :class="{ 'is-keyboard-selected': model.selectedAddress.value === sender.address.trim().toLocaleLowerCase('en-US') }" :aria-current="model.selectedAddress.value === sender.address.trim().toLocaleLowerCase('en-US') ? 'true' : undefined" role="listitem">
        <svg v-if="model.selectedAddress.value === sender.address.trim().toLocaleLowerCase('en-US')" class="screener-current-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
        <div class="screener-actions">
          <button class="screener-choice screener-yes transition duration-150 ease-out hover:scale-105 active:scale-99" type="button" :aria-label="$t('mail.authorizeAddress', { address: sender.address })" :disabled="model.isSaving.value" @click="model.applyChoice(sender.latest, 'Imbox', 'sender')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-8c2.2 0 3.1 1.7 2.5 3.6L12.5 10h6a3 3 0 0 1 2.9 3.8l-1.7 6A3 3 0 0 1 16.8 22H7" /></svg><strong>{{ $t('mail.allow') }}</strong>
          </button>
          <button class="screener-choice screener-no transition duration-150 ease-out hover:scale-105 active:scale-99" type="button" :aria-label="$t('mail.blockAddress', { address: sender.address })" :disabled="model.isSaving.value" @click="model.blockSender(sender.latest)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 4 8c2.2 0 3.1-1.7 2.5-3.6L12.5 14h6a3 3 0 0 0 2.9-3.8l-1.7-6A3 3 0 0 0 16.8 2H7" /></svg><strong>{{ $t('mail.block') }}</strong>
          </button>
          <div class="screener-options-wrap">
            <button class="screener-options-trigger" type="button" :aria-label="$t('mail.screenerOptions', { address: sender.address })" :aria-expanded="model.openOptionsFor.value === sender.address" @click="model.toggleOptions(sender.address)">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
            </button>
            <Transition name="screener-popover">
              <div v-if="model.openOptionsFor.value === sender.address" class="screener-popover" role="dialog" :aria-label="$t('mail.classifyAddress', { address: sender.address })">
                <strong>{{ $t('mail.allowAndClassify') }}</strong>
                <div class="screener-destinations" role="group" :aria-label="$t('mail.destination')">
                  <button v-for="destination in folders.filter(item => item.name !== 'Screener' && item.name !== 'Trash' && item.name !== 'Set Aside' && item.name !== 'Reply Later')" :key="destination.name" type="button" :aria-pressed="model.destination.value === destination.name" :title="$t('mail.destinationShortcut', { destination: destination.label, shortcut: destination.name === 'Imbox' ? 'I' : destination.name === 'The Feed' ? 'F' : 'P' })" @click="model.destination.value = destination.name">
                    <svg v-if="destination.name === 'Imbox'" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>
                    <svg v-else-if="destination.name === 'The Feed'" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5c3.3-.9 6.3-.4 9 1.5v13c-2.7-1.9-5.7-2.4-9-1.5v-13Zm18 0c-3.3-.9-6.3-.4-9 1.5v13c2.7-1.9 5.7-2.4 9-1.5v-13Z" /></svg>
                    <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Zm3 5h6m-6 4h6m-6 4h4" /></svg>
                    <span>{{ destination.label }}</span>
                    <kbd>{{ destination.name === 'Imbox' ? 'I' : destination.name === 'The Feed' ? 'F' : 'P' }}</kbd>
                  </button>
                </div>
                <div class="screener-scope" role="group" :aria-label="$t('mail.applyTo')">
                  <button class="screener-scope-label" type="button" :aria-pressed="model.scope.value === 'sender'" @click="model.scope.value = 'sender'">{{ $t('mail.sender') }}</button>
                  <button class="screener-scope-toggle" type="button" role="switch" :aria-checked="model.scope.value === 'message'" :aria-label="$t('mail.switchScope')" title="G" @click="model.scope.value = model.scope.value === 'sender' ? 'message' : 'sender'">
                    <span />
                  </button>
                  <button class="screener-scope-label screener-scope-message" type="button" :aria-pressed="model.scope.value === 'message'" @click="model.scope.value = 'message'">{{ $t('mail.thisMessage') }} <kbd>G</kbd></button>
                </div>
                <AppButton class="screener-apply" variant="primary" type="button" :disabled="model.isSaving.value" @click="model.applyChoice(sender.latest, model.destination.value, model.scope.value)"><span>{{ $t('mail.apply') }}</span><kbd>Y</kbd></AppButton>
              </div>
            </Transition>
          </div>
        </div>
        <button class="thread-row screener-message" type="button" :aria-label="$t('mail.readLatest', { address: sender.address })" @click="openMessage(sender.latest)">
          <MailSenderAvatar :initials="sender.latest.initials" :color="sender.latest.color" v-bind="threadAvatarFor(sender.latest)" />
          <span class="thread-content">
            <span class="thread-topline screener-sender-line"><span class="screener-sender-ident"><strong>{{ sender.latest.sender }}</strong><span class="thread-address">{{ sender.address }}</span></span><time :datetime="sender.latest.timestamp" :title="absoluteMailDate(sender.latest.timestamp)">{{ relativeMailDate(sender.latest.timestamp) }}</time></span>
            <span class="thread-subject">{{ sender.latest.subject }}</span>
            <span class="thread-preview">{{ sender.latest.preview }}</span>
          </span>
          <span v-if="sender.count > 1" class="sender-message-count">{{ sender.count }}</span>
        </button>
      </article>
    </template>
    <template v-else>
      <label class="screener-history-search">
        <span class="sr-only">{{ $t('mail.searchScreenerHistory') }}</span>
        <input
          v-model="model.historySearch.value"
          type="search"
          :placeholder="$t('mail.searchScreenerHistory')"
          autocomplete="off"
          spellcheck="false"
        >
      </label>
      <p v-if="!model.visibleHistory.value.length" class="screener-empty">
        {{ model.historySearch.value.trim() ? $t('mail.screenerHistoryNoResults', { query: model.historySearch.value.trim() }) : $t('mail.screenerEmptyHistory') }}
      </p>
      <article v-for="sender in model.visibleHistory.value" :key="`${sender.address}-${sender.state}`" class="screener-row screener-history-row" role="listitem">
        <span class="screener-history-state" :class="`is-${sender.state}`">{{ $t(sender.state === 'blocked' ? 'mail.blocked' : 'mail.dismissed') }}</span>
        <button class="thread-row screener-message" type="button" :aria-label="$t('mail.readLatest', { address: sender.address })" @click="openMessage(sender.latest)">
          <MailSenderAvatar :initials="sender.latest.initials" :color="sender.latest.color" v-bind="threadAvatarFor(sender.latest)" />
          <span class="thread-content">
            <span class="thread-topline screener-sender-line"><span class="screener-sender-ident"><strong>{{ sender.latest.sender }}</strong><span class="thread-address">{{ sender.address }}</span></span><time :datetime="sender.latest.timestamp" :title="absoluteMailDate(sender.latest.timestamp)">{{ relativeMailDate(sender.latest.timestamp) }}</time></span>
            <span class="thread-subject">{{ sender.latest.subject }}</span>
            <span class="thread-preview">{{ sender.latest.preview }}</span>
          </span>
          <span v-if="sender.count > 1" class="sender-message-count">{{ sender.count }}</span>
        </button>
        <button class="screener-restore" type="button" :disabled="model.isSaving.value" @click="model.restoreSender(sender.latest, sender.state)">{{ $t(sender.state === 'blocked' ? 'mail.restoreSender' : 'mail.restoreSenderPending') }}</button>
      </article>
    </template>
  </div>

  <NDialog
    :open="model.shortcutHelpOpen.value"
    :title="$t('mail.screenerShortcutTitle')"
    :description="$t('mail.screenerShortcutDescription')"
    :_dialog-content="{ class: 'classification-dialog screener-shortcut-dialog-content' }"
    @update:open="(open: boolean) => { model.shortcutHelpOpen.value = open }"
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
          <div><dt><kbd>⌘/Ctrl</kbd> <kbd>Enter</kbd></dt><dd>{{ $t('mail.confirmClearAllShortcut') }}</dd></div>
          <div class="shortcut-dialog-divider"><dt><kbd>I</kbd> <kbd>F</kbd> <kbd>P</kbd></dt><dd>{{ $t('mail.chooseMailbox') }}</dd></div>
          <div><dt><kbd>G</kbd></dt><dd>{{ $t('mail.toggleSenderMessage') }}</dd></div>
          <div><dt><kbd>Enter</kbd> <kbd>Space</kbd> <kbd>Y</kbd></dt><dd>{{ $t('mail.applyClassification') }}</dd></div>
        </dl>
        <p class="screener-shortcut-footnote"><kbd>Esc</kbd> {{ $t('mail.escapeClosesHelp') }}</p>
      </div>
    </template>
  </NDialog>

  <NDialog
    :open="model.clearDialogOpen.value"
    :title="$t('mail.screenerClearTitle')"
    :description="$t('mail.screenerClearDescription')"
    :show-close="false"
    :_dialog-content="{ class: 'classification-dialog screener-confirm-dialog' }"
    @update:open="(open: boolean) => { model.clearDialogOpen.value = open }"
  >
    <template #content>
      <header class="dialog-header">
        <p class="dialog-kicker">Screener</p>
        <NDialogTitle class="dialog-title">{{ $t('mail.screenerClearAllTitle') }}</NDialogTitle>
        <NDialogDescription class="screener-confirm-copy">{{ $t('mail.screenerClearAllDescription') }}</NDialogDescription>
      </header>
      <footer class="dialog-actions">
        <NDialogClose as-child>
          <button class="dialog-cancel" type="button" :disabled="model.isClearing.value">{{ $t('mail.cancel') }}</button>
        </NDialogClose>
        <NTooltip :content="$t('mail.confirmClearAllTooltip')" :una="{ tooltipContent: 'compose-tooltip-content z-[120]' }">
          <button class="dialog-danger screener-confirm-action" type="button" aria-keyshortcuts="Control+Enter Meta+Enter" :disabled="model.isClearing.value" @click="model.clearAll()">
            {{ model.isClearing.value ? $t('mail.clearing') : $t('mail.clearAll') }}
          </button>
        </NTooltip>
      </footer>
    </template>
  </NDialog>
</template>

<script setup lang="ts" generic="Message extends ScreenerMessage">
import type { MailScreenerState, ScreenerMessage } from '~/types/mail-screener'
import type { MailboxKey } from '~/utils/mailbox-routing'

defineProps<{
  model: MailScreenerState<Message>
  folders: { name: MailboxKey, label: string }[]
  absoluteMailDate: (timestamp: string) => string
  relativeMailDate: (timestamp: string) => string
  threadAvatarFor: (message: Message) => Partial<{ avatarUrl: string | null, logoUrl: string | null }>
  openMessage: (message: Message) => void
}>()
</script>

<style scoped>
.screener-history-search {
  display: block;
  margin: 8px 0 12px;
}

.screener-history-search input {
  width: 100%;
  min-height: 42px;
  padding: 0 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
}

.screener-history-search input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
