<template>
  <main class="mail-page">
    <section v-if="!isReadingMessage" class="mailbox-view" aria-label="Boîte de réception">
      <header class="inbox-heading">
      <div v-if="!isGlobalSearch" class="heading-actions">
          <template v-if="activeFolder === 'Screener'">
            <div class="screener-header-actions">
              <button class="screener-help-trigger" type="button" aria-label="Afficher les raccourcis du Screener" title="Raccourcis clavier (?)" @click="screenerShortcutHelpOpen = true">?</button>
              <button class="screener-done" type="button" @click="doneScreener">Done</button>
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
              <span>{{ allScreenerSenders.length }} expéditeur{{ allScreenerSenders.length > 1 ? 's' : '' }} à examiner</span>
            </button>
            <span v-else class="screener-spacer" aria-hidden="true" />
            <button class="compose-button" type="button" disabled title="L’envoi sera ajouté après stabilisation de la réception">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span>Écrire</span>
            </button>
          </template>
        </div>
        <h1>{{ isGlobalSearch ? 'Recherche' : mailboxByName(activeFolder).label }}</h1>
        <p v-if="activeFolder === 'Screener'" class="screener-intro">
          « Non » bloque l’adresse et rejette ses prochains messages. « Clear all » écarte ceux déjà reçus sans bloquer leurs expéditeurs.
        </p>
      </header>

      <div v-if="classificationFeedback || undoClassificationId || classificationActionError || screenerActionError" class="action-feedback">
        <p v-if="classificationFeedback" class="classification-feedback" role="status">{{ classificationFeedback }}</p>
        <button v-if="undoClassificationId" class="undo-action" type="button" :disabled="isUndoingClassification" @click="undoSenderRule">
          {{ isUndoingClassification ? 'Annulation…' : 'Annuler' }}
        </button>
        <p v-if="classificationActionError" class="action-feedback-error" role="alert">{{ classificationActionError }}</p>
        <p v-if="screenerActionError" class="action-feedback-error" role="alert">{{ screenerActionError }}</p>
      </div>

      <div v-if="inboxMessagesError" class="empty-list error-state" role="alert">
        <strong>La boîte n’a pas pu se charger.</strong>
        <span>Vérifie ta connexion, puis réessaie.</span>
        <button class="fixture-button" type="button" :disabled="isRefreshingInbox" @click="retryInboxLoad">
          {{ isRefreshingInbox ? 'Chargement…' : 'Réessayer' }}
        </button>
      </div>

      <section v-else-if="isGlobalSearch" class="search-results" aria-label="Résultats de recherche">
        <p class="search-results-summary" aria-live="polite">
          <span v-if="searchLoading">Recherche en cours…</span>
          <span v-else>{{ searchTotal }} message{{ searchTotal > 1 ? 's' : '' }} trouvé{{ searchTotal > 1 ? 's' : '' }} · {{ globalSearchThreads.length }} fil{{ globalSearchThreads.length > 1 ? 's' : '' }} affiché{{ globalSearchThreads.length > 1 ? 's' : '' }}</span>
        </p>
        <p v-if="searchExceedsLimit" class="search-limit-notice" role="status">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8.8 3.3a1.4 1.4 0 0 1 2.4 0l6.1 10.6a1.4 1.4 0 0 1-1.2 2.1H3.9a1.4 1.4 0 0 1-1.2-2.1z" />
            <path d="M10 7v4" />
            <circle cx="10" cy="13.7" r=".6" fill="currentColor" stroke="none" />
          </svg>
          <span>La recherche est limitée aux 200 premiers caractères. La suite est ignorée.</span>
        </p>
        <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>
        <p v-else-if="searchLoading && !globalSearchThreads.length" class="search-empty">Recherche dans les messages…</p>
        <p v-else-if="!globalSearchThreads.length" class="search-empty">Aucun message ne correspond à « {{ search.trim() }} ».</p>
        <div v-else class="thread-list search-result-list" role="list">
          <div v-for="thread in globalSearchThreads" :key="thread.id" role="listitem">
            <button class="thread-row search-result-row" type="button" @click="openMessage(thread.latest)">
              <span class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
              <span class="thread-content">
                <span class="thread-subject">{{ thread.latest.subject }}</span>
                <span class="thread-preview"><span class="search-folder-label">{{ mailboxByName(thread.latest.folder).label }}</span><span aria-hidden="true"> · </span><strong>{{ thread.latest.sender }}</strong><span aria-hidden="true"> · </span>{{ thread.snippet || thread.latest.preview }}</span>
              </span>
              <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
              <time class="thread-date">{{ thread.latest.date }}</time>
            </button>
          </div>
        </div>
        <button v-if="searchHasMore" class="search-load-more" type="button" :disabled="searchLoading" @click="loadMoreSearchResults">
          {{ searchLoading ? 'Chargement…' : 'Afficher plus de résultats' }}
        </button>
      </section>

      <div v-else-if="activeFolder === 'Screener'" class="thread-list screener-list" role="list" aria-label="Expéditeurs à classer">
        <div class="screener-list-tools">
          <div class="screener-view-switch" role="group" aria-label="Messages du Screener">
            <button type="button" :aria-pressed="screenerView === 'pending'" @click="screenerView = 'pending'">À examiner <span>{{ allScreenerSenders.length }}</span></button>
            <button type="button" :aria-pressed="screenerView === 'history'" @click="screenerView = 'history'">Historique <span>{{ screenerHistorySenders.length }}</span></button>
          </div>
          <button v-if="screenerView === 'pending' && allScreenerSenders.length" class="screener-clear-all" type="button" :disabled="isClearingScreener" @click="requestClearScreener">
            {{ isClearingScreener ? 'Écart…' : 'Clear all…' }}
          </button>
        </div>
        <template v-if="screenerView === 'pending'">
          <p v-if="!screenerSenders.length" class="screener-empty">Aucun expéditeur en attente.</p>
          <article v-for="sender in screenerSenders" :key="sender.address" class="screener-row" :class="{ 'is-keyboard-selected': selectedScreenerAddress === sender.address.trim().toLocaleLowerCase('en-US') }" :aria-current="selectedScreenerAddress === sender.address.trim().toLocaleLowerCase('en-US') ? 'true' : undefined" role="listitem">
            <svg v-if="selectedScreenerAddress === sender.address.trim().toLocaleLowerCase('en-US')" class="screener-current-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
            <div class="screener-actions">
              <button class="screener-choice screener-yes transition duration-150 ease-out hover:scale-105 active:scale-99" type="button" :aria-label="`Autoriser ${sender.address} et classer ses messages dans Inbox`" :disabled="isSavingScreenerAction" @click="applyScreenerChoice(sender.latest, 'Imbox', 'sender')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-8c2.2 0 3.1 1.7 2.5 3.6L12.5 10h6a3 3 0 0 1 2.9 3.8l-1.7 6A3 3 0 0 1 16.8 22H7" /></svg><strong>Oui</strong>
              </button>
              <button class="screener-choice screener-no transition duration-150 ease-out hover:scale-105 active:scale-99" type="button" :aria-label="`Bloquer ${sender.address} et rejeter ses prochains messages`" :disabled="isSavingScreenerAction" @click="blockScreenerSender(sender.latest)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 4 8c2.2 0 3.1-1.7 2.5-3.6L12.5 14h6a3 3 0 0 0 2.9-3.8l-1.7-6A3 3 0 0 0 16.8 2H7" /></svg><strong>Non</strong>
              </button>
              <div class="screener-options-wrap">
                <button class="screener-options-trigger" type="button" :aria-label="`Options pour ${sender.address}`" :aria-expanded="openScreenerOptionsFor === sender.address" @click="toggleScreenerOptions(sender.address, sender.latest)">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
                </button>
                <Transition name="screener-popover">
                  <div v-if="openScreenerOptionsFor === sender.address" class="screener-popover" role="dialog" :aria-label="`Classement de ${sender.address}`">
                  <strong>Oui, et classer dans…</strong>
                  <div class="screener-destinations" role="group" aria-label="Boîte de destination">
                    <button v-for="destination in folders.filter(item => item.name !== 'Screener' && item.name !== 'Trash')" :key="destination.name" type="button" :aria-pressed="screenerDestination === destination.name" :title="`Destination ${destination.label} — ${destination.name === 'Imbox' ? 'I' : destination.name === 'The Feed' ? 'F' : 'P'}`" @click="screenerDestination = destination.name">
                      <svg v-if="destination.name === 'Imbox'" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>
                      <svg v-else-if="destination.name === 'The Feed'" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5c3.3-.9 6.3-.4 9 1.5v13c-2.7-1.9-5.7-2.4-9-1.5v-13Zm18 0c-3.3-.9-6.3-.4-9 1.5v13c2.7-1.9 5.7-2.4 9-1.5v-13Z" /></svg>
                      <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21V3Zm3 5h6m-6 4h6m-6 4h4" /></svg>
                      <span>{{ destination.label }}</span>
                      <kbd>{{ destination.name === 'Imbox' ? 'I' : destination.name === 'The Feed' ? 'F' : 'P' }}</kbd>
                    </button>
                  </div>
                  <div class="screener-scope" role="group" aria-label="Appliquer à">
                    <button class="screener-scope-label" type="button" :aria-pressed="screenerScope === 'sender'" @click="screenerScope = 'sender'">Cet expéditeur</button>
                    <button class="screener-scope-toggle" type="button" role="switch" :aria-checked="screenerScope === 'message'" aria-label="Basculer entre cet expéditeur et ce message" title="Raccourci G" @click="screenerScope = screenerScope === 'sender' ? 'message' : 'sender'">
                      <span />
                    </button>
                    <button class="screener-scope-label screener-scope-message" type="button" :aria-pressed="screenerScope === 'message'" @click="screenerScope = 'message'">Ce message <kbd>G</kbd></button>
                  </div>
                  <button class="screener-apply" type="button" :disabled="isSavingScreenerAction" @click="applyScreenerChoice(sender.latest, screenerDestination, screenerScope)"><span>Appliquer</span><kbd>Y</kbd></button>
                  </div>
                </Transition>
              </div>
            </div>
            <button class="thread-row screener-message" type="button" :aria-label="`Lire le dernier message de ${sender.address}`" @click="openMessage(sender.latest)">
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
          <p v-if="!visibleScreenerHistory.length" class="screener-empty">Aucun message dans l’historique.</p>
          <article v-for="sender in visibleScreenerHistory" :key="`${sender.address}-${sender.state}`" class="screener-row screener-history-row" role="listitem">
            <span class="screener-history-state" :class="`is-${sender.state}`">{{ sender.state === 'blocked' ? 'Bloqué' : 'Écarté' }}</span>
            <button class="thread-row screener-message" type="button" :aria-label="`Lire le dernier message de ${sender.address}`" @click="openMessage(sender.latest)">
              <span class="sender-avatar" :class="`avatar-${sender.latest.color}`">{{ sender.latest.initials }}</span>
              <span class="thread-content">
                <span class="thread-topline screener-sender-line"><span class="screener-sender-ident"><strong>{{ sender.latest.sender }}</strong><span class="thread-address">{{ sender.address }}</span></span><time>{{ sender.latest.date }}</time></span>
                <span class="thread-subject">{{ sender.latest.subject }}</span>
                <span class="thread-preview">{{ sender.latest.preview }}</span>
              </span>
              <span v-if="sender.count > 1" class="sender-message-count">{{ sender.count }}</span>
            </button>
            <button class="screener-restore" type="button" :disabled="isSavingScreenerAction" @click="restoreScreenerSender(sender.latest, sender.state)">{{ sender.state === 'blocked' ? 'Autoriser' : 'Remettre en attente' }}</button>
          </article>
        </template>
      </div>

      <template v-else-if="activeFolder === 'Imbox' && visibleThreads.length">
        <section v-if="newThreads.length" class="message-group message-group-new" aria-labelledby="new-messages-heading">
          <header class="group-heading">
            <h2 id="new-messages-heading">Nouveaux messages</h2>
            <span aria-hidden="true" />
          </header>
          <div class="thread-list" role="list">
            <div v-for="thread in newThreads" :key="thread.id" role="listitem">
              <button class="thread-row" type="button" @click="openMessage(thread.latest)">
                <span class="unread-indicator" :aria-label="`${thread.unreadCount} message${thread.unreadCount > 1 ? 's' : ''} non lu${thread.unreadCount > 1 ? 's' : ''}`" />
                <span class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                <span class="thread-content">
                  <span class="thread-subject">{{ thread.latest.subject }}</span>
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
            <h2 id="seen-messages-heading">Déjà consultés</h2>
            <span aria-hidden="true" />
          </header>
          <div class="thread-list" role="list">
            <div v-for="thread in previouslySeenThreads" :key="thread.id" role="listitem">
              <button class="thread-row" type="button" @click="openMessage(thread.latest)">
                <span class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
                <span class="thread-content">
                  <span class="thread-subject">{{ thread.latest.subject }}</span>
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
        <div v-for="thread in visibleThreads" :key="thread.id" class="other-thread-row" role="listitem">
          <button class="thread-row" type="button" @click="openMessage(thread.latest)">
            <span v-if="thread.unreadCount" class="unread-indicator" :aria-label="`${thread.unreadCount} message${thread.unreadCount > 1 ? 's' : ''} non lu${thread.unreadCount > 1 ? 's' : ''}`" />
            <span class="sender-avatar" :class="`avatar-${thread.latest.color}`">{{ thread.latest.initials }}</span>
            <span class="thread-content">
              <span class="thread-subject">{{ thread.latest.subject }}</span>
              <span class="thread-preview"><strong>{{ thread.latest.sender }}</strong><span aria-hidden="true"> · </span>{{ thread.latest.preview }}</span>
            </span>
            <span v-if="thread.messages.length > 1" class="thread-message-count">{{ thread.messages.length }}</span>
            <time class="thread-date">{{ thread.latest.date }}</time>
          </button>
          <button v-if="activeFolder === 'Trash'" class="screener-restore trash-restore" type="button" :disabled="isSavingScreenerAction" @click="restoreTrashedMessage(thread.latest)">Restaurer</button>
        </div>
      </div>

      <div v-else class="empty-list">
        <svg class="empty-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8.5" /><path d="m20 20 6 6" /></svg>
        <strong>{{ activeFolder === 'Screener' ? 'Aucun expéditeur en attente' : activeFolder === 'Trash' ? 'La corbeille est vide' : 'Aucun message ici' }}</strong>
        <span>{{ search ? 'Essaie avec un autre mot.' : activeFolder === 'Screener' ? 'Les nouveaux expéditeurs apparaîtront ici.' : activeFolder === 'Trash' ? 'Les messages que tu y déplaces apparaîtront ici.' : 'Ce dossier attend ses premiers messages.' }}</span>
        <button v-if="isDevelopment && activeFolder === 'Imbox' && !search" class="fixture-button" type="button" :disabled="isImportingFixture" @click="importFixture">
          {{ isImportingFixture ? 'Import en cours…' : 'Charger un message de test' }}
        </button>
        <span v-if="fixtureError" class="fixture-error" role="alert">{{ fixtureError }}</span>
      </div>
    </section>

    <section v-else-if="selectedMessage" class="reading-column" aria-label="Message sélectionné">
      <div class="reading-toolbar">
        <button class="back-to-list" type="button" @click="closeMessage">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5M7.5 10h9" /></svg>
          <span>Retour à {{ mailboxByName(activeFolder).label }}</span>
          <kbd>Esc</kbd>
        </button>
        <button v-if="activeFolder === 'Trash'" class="message-classify" type="button" :disabled="isSavingScreenerAction" @click="restoreTrashedMessage(activeThreadMessage || selectedMessage)">
          Restaurer ce message
        </button>
        <button v-else class="message-classify" type="button" @click="openClassification(activeThreadMessage || selectedMessage)">
          Classer ce message
        </button>
      </div>
      <div v-if="messageReadError" class="message-read-error" role="alert">
        <span>{{ messageReadError }}</span>
        <button v-if="selectedThread?.unreadCount" type="button" @click="retryMarkRead">Réessayer</button>
      </div>

      <article class="message-paper">
        <h1 class="message-subject">{{ chronologicalMessages[0]?.subject || selectedMessage.subject }}</h1>
        <div class="thread-carousel">
          <div v-if="chronologicalMessages.length > 1" class="thread-carousel-header">
            <div class="thread-carousel-status">
              <span class="thread-carousel-position" aria-live="polite">Message {{ activeThreadMessageIndex + 1 }} sur {{ chronologicalMessages.length }}</span>
              <NTooltip :content="isReadingAll ? 'Lire un message à la fois' : 'Lire toute la conversation'">
                <button
                  class="thread-read-all"
                  type="button"
                  :aria-label="isReadingAll ? 'Lire un message à la fois' : 'Lire toute la conversation'"
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
            aria-label="Navigation dans la conversation"
          >
            <button
              class="thread-carousel-arrow"
              type="button"
              aria-label="Message précédent"
              :disabled="activeThreadMessageIndex <= 0"
              @click="navigateThreadMessage(-1)"
            >‹</button>
            <div
              class="thread-message-rail-viewport"
              :class="{ 'can-scroll-start': railCanScrollStart, 'can-scroll-end': railCanScrollEnd }"
            >
              <span v-if="railCanScrollStart" class="thread-message-rail-fade thread-message-rail-fade-start" aria-hidden="true" />
              <div ref="threadMessageRail" class="thread-message-rail" role="group" aria-label="Messages de la conversation" @scroll="updateThreadRailOverflow">
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
                  <span class="sr-only">Message {{ index + 1 }} sur {{ chronologicalMessages.length }}</span>
                </button>
              </div>
              <span v-if="railCanScrollEnd" class="thread-message-rail-fade thread-message-rail-fade-end" aria-hidden="true" />
            </div>
            <button
              class="thread-carousel-arrow"
              type="button"
              aria-label="Message suivant"
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
              :aria-label="'Message de ' + activeThreadMessage.sender"
            >
              <div class="message-meta">
                <span class="sender-avatar meta-avatar" :class="`avatar-${activeThreadMessage.color}`">{{ activeThreadMessage.initials }}</span>
                <span class="meta-copy">
                  <strong>{{ activeThreadMessage.sender }}</strong>
                  <span>{{ activeThreadMessage.address }}</span>
                </span>
                <time>{{ activeThreadMessage.date }}</time>
              </div>

              <div class="message-rule" />
              <p v-for="(paragraph, paragraphIndex) in activeThreadMessage.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p>
              <div v-if="activeThreadMessage.attachments.length" class="attachment-list" aria-label="Pièces jointes">
                <span class="attachment-heading">{{ activeThreadMessage.attachments.length }} pièce{{ activeThreadMessage.attachments.length > 1 ? 's' : '' }} jointe{{ activeThreadMessage.attachments.length > 1 ? 's' : '' }}</span>
                <a
                  v-for="attachment in activeThreadMessage.attachments"
                  :key="attachment.id"
                  class="attachment-item"
                  :href="`/api/attachments/${attachment.id}`"
                  :download="attachment.filename"
                  :aria-label="`Télécharger ${attachment.filename}`"
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
              :aria-label="'Message de ' + message.sender"
            >
              <div class="message-meta">
                <span class="sender-avatar meta-avatar" :class="`avatar-${message.color}`">{{ message.initials }}</span>
                <span class="meta-copy">
                  <strong>{{ message.sender }}</strong>
                  <span>{{ message.address }}</span>
                </span>
                <time>{{ message.date }}</time>
              </div>
              <div class="message-rule" />
              <p v-for="(paragraph, paragraphIndex) in message.body.split('\n\n')" :key="paragraphIndex">{{ paragraph }}</p>
              <div v-if="message.attachments.length" class="attachment-list" aria-label="Pièces jointes">
                <span class="attachment-heading">{{ message.attachments.length }} pièce{{ message.attachments.length > 1 ? 's' : '' }} jointe{{ message.attachments.length > 1 ? 's' : '' }}</span>
                <a
                  v-for="attachment in message.attachments"
                  :key="attachment.id"
                  class="attachment-item"
                  :href="`/api/attachments/${attachment.id}`"
                  :download="attachment.filename"
                  :aria-label="`Télécharger ${attachment.filename}`"
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

      <div class="reply-placeholder">
        <span class="reply-icon" aria-hidden="true">↩</span>
        <span>L’envoi sera ajouté après stabilisation de la réception.</span>
        <span class="reply-shortcut">R</span>
      </div>
    </section>

    <NDialog
      :open="Boolean(classificationTarget)"
      :title="'Où ranger ses messages ?'"
      :description="classificationTarget ? `${classificationTarget.sender} — ${classificationTarget.address}` : undefined"
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog' }"
      @update:open="(open: boolean) => { if (!open && !isSavingClassification) classificationTarget = null }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">{{ classificationTarget?.folder === 'Screener' ? 'Nouvel expéditeur' : 'Classement' }}</p>
          <NDialogTitle class="dialog-title">Où ranger ses messages ?</NDialogTitle>
          <NDialogDescription class="sr-only">Choisissez une boîte pour cet expéditeur, ou déplacez uniquement le message sélectionné.</NDialogDescription>
          <p class="dialog-sender">{{ classificationTarget?.sender }} <span>{{ classificationTarget?.address }}</span></p>
        </header>

        <fieldset class="classification-scope">
          <legend>Portée</legend>
          <label class="scope-option">
            <input v-model="classificationScope" type="radio" value="sender">
            <span><strong>Cet expéditeur</strong><small>Ses messages déjà reçus et les prochains.</small></span>
          </label>
          <label class="scope-option">
            <input v-model="classificationScope" type="radio" value="message">
            <span><strong>Ce message seulement</strong><small>{{ classificationTarget?.hasSenderRule ? 'Les prochains suivront la règle actuelle.' : 'Les autres et les prochains resteront au Screener.' }}</small></span>
          </label>
        </fieldset>

        <fieldset class="classification-destinations">
          <legend>Destination</legend>
          <label v-for="folder in folders.filter(item => item.name !== 'Screener' && item.name !== 'Trash')" :key="folder.name" class="destination-option" :class="{ 'is-picked': classificationFolder === folder.name }">
            <input v-model="classificationFolder" type="radio" :value="folder.name">
            <span><strong>{{ folder.label }}</strong><small>{{ folder.description }}</small></span>
          </label>
        </fieldset>

        <p v-if="classificationError" class="dialog-error" role="alert">{{ classificationError }}</p>
        <footer class="dialog-actions">
          <NDialogClose as-child>
            <button class="dialog-cancel" type="button" :disabled="isSavingClassification">Annuler</button>
          </NDialogClose>
          <button class="dialog-save" type="button" :disabled="isSavingClassification" @click="saveClassification">
            {{ isSavingClassification ? 'Enregistrement…' : classificationScope === 'sender' ? 'Classer l’expéditeur' : 'Déplacer ce message' }}
          </button>
        </footer>
      </template>
    </NDialog>

    <NDialog
      :open="screenerShortcutHelpOpen"
      title="Raccourcis du Screener"
      description="Raccourcis clavier disponibles dans la file À examiner."
      :_dialog-content="{ class: 'classification-dialog screener-shortcut-dialog-content' }"
      @update:open="(open: boolean) => { screenerShortcutHelpOpen = open }"
    >
      <template #content>
        <div class="screener-shortcut-dialog">
          <header class="dialog-header">
            <p class="dialog-kicker">Navigation rapide</p>
            <NDialogTitle class="dialog-title">Raccourcis du Screener</NDialogTitle>
            <NDialogDescription class="sr-only">Raccourcis clavier disponibles dans la file À examiner.</NDialogDescription>
          </header>
          <dl>
            <div><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Parcourir les expéditeurs</dd></div>
            <div><dt><kbd>N</kbd></dt><dd>Bloquer l’adresse sélectionnée</dd></div>
            <div><dt><kbd>Y</kbd></dt><dd>Ouvrir ses options de classement</dd></div>
            <div><dt><kbd>T</kbd></dt><dd>Mettre son message en Corbeille</dd></div>
            <div><dt><kbd>C</kbd></dt><dd>Écarter tous les messages en attente</dd></div>
            <div class="shortcut-dialog-divider"><dt><kbd>I</kbd> <kbd>F</kbd> <kbd>P</kbd></dt><dd>Choisir Inbox, Feed ou Paper</dd></div>
            <div><dt><kbd>G</kbd></dt><dd>Alterner expéditeur et message</dd></div>
            <div><dt><kbd>Entrée</kbd> <kbd>Espace</kbd> <kbd>Y</kbd></dt><dd>Appliquer le classement choisi</dd></div>
          </dl>
          <p class="screener-shortcut-footnote"><kbd>Échap</kbd> ferme cette aide ou le menu d’options.</p>
        </div>
      </template>
    </NDialog>

    <NDialog
      :open="screenerClearDialogOpen"
      title="Écarter les messages du Screener ?"
      description="Ils resteront conservés dans l’historique et les prochains messages de ces expéditeurs pourront encore arriver."
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog screener-confirm-dialog' }"
      @update:open="(open: boolean) => { screenerClearDialogOpen = open }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">Screener</p>
          <NDialogTitle class="dialog-title">Écarter tous les messages ?</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">Les messages reçus resteront consultables dans l’historique. Les expéditeurs ne seront pas bloqués.</NDialogDescription>
        </header>
        <footer class="dialog-actions">
          <NDialogClose as-child>
            <button class="dialog-cancel" type="button" :disabled="isClearingScreener">Annuler</button>
          </NDialogClose>
          <button class="dialog-danger" type="button" :disabled="isClearingScreener" @click="clearAllScreener">
            {{ isClearingScreener ? 'Écart…' : 'Clear all' }}
          </button>
        </footer>
      </template>
    </NDialog>
  </main>
</template>

<script setup lang="ts">
import { mailboxByName, mailboxFromPath, mailboxPath, mailboxes, threadIdFromPath, threadPath, type MailboxKey } from '~/utils/mailbox-routing'

type Folder = MailboxKey
type MailboxFolder = Exclude<Folder, 'Screener' | 'Trash'>

type InboxMessage = {
  id: string
  threadId: string
  sender: string
  address: string
  subject: string
  preview: string
  date: string
  timestamp: string
  folder: Folder
  screenerState: 'pending' | 'cleared' | 'blocked'
  hasSenderRule: boolean
  isRead: boolean
  initials: string
  color: string
  body: string
  attachments: { id: string, filename: string, mimeType: string, sizeBytes: number }[]
}

type MessageThread = {
  id: string
  messages: InboxMessage[]
  latest: InboxMessage
  unreadCount: number
}

type SearchHit = {
  id: string
  folder: Folder
  threadId: string
  snippet: string
}

type SearchThread = MessageThread & {
  snippet: string
}

const folders = mailboxes
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
const classificationScope = ref<'sender' | 'message'>('sender')
const classificationFolder = ref<MailboxFolder>('Imbox')
const screenerView = ref<'pending' | 'history'>('pending')
const selectedScreenerAddress = ref('')
const openScreenerOptionsFor = ref('')
const screenerClearDialogOpen = ref(false)
const screenerShortcutHelpOpen = ref(false)
const screenerDestination = ref<MailboxFolder>('Imbox')
const screenerScope = ref<'sender' | 'message'>('sender')
const screenerActionError = ref('')
const isClearingScreener = ref(false)
const isSavingScreenerAction = ref(false)
const isSavingClassification = ref(false)
const isUndoingClassification = ref(false)
const undoClassificationId = ref('')
const classificationError = ref('')
const classificationFeedback = ref('')
const classificationActionError = ref('')
const messageReadError = ref('')
const isRefreshingInbox = ref(false)
const isDevelopment = import.meta.dev
const isImportingFixture = ref(false)
const fixtureError = ref('')
let undoTimer: ReturnType<typeof setTimeout> | undefined

const { data: inboxMessages, refresh: refreshMessages, error: inboxMessagesError } = await useFetch<InboxMessage[]>('/api/messages', {
  default: () => [],
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
  return (inboxMessages.value ?? []).filter(message => message.folder === activeFolder.value)
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
    return { id, messages, latest: messages[0]!, unreadCount: messages.filter(message => !message.isRead).length }
  })
})

const visibleThreads = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('fr')
  if (!query) return folderThreads.value

  return folderThreads.value.filter(thread => thread.messages.some(message =>
    `${message.sender} ${message.subject} ${message.body}`.toLocaleLowerCase('fr').includes(query),
  ))
})

const globalSearchThreads = computed<SearchThread[]>(() => {
  const messages = inboxMessages.value ?? []
  const messagesById = new Map(messages.map(message => [message.id, message]))
  const groups = new Map<string, { latest: InboxMessage, messages: InboxMessage[], snippet: string }>()

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
    })
  }

  return [...groups.entries()].map(([id, group]) => ({
    id,
    messages: group.messages,
    latest: group.latest,
    unreadCount: group.messages.filter(message => !message.isRead).length,
    snippet: group.snippet,
  }))
})

const newThreads = computed(() => visibleThreads.value.filter(thread => thread.unreadCount > 0))
const previouslySeenThreads = computed(() => visibleThreads.value.filter(thread => thread.unreadCount === 0))

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

watch(selectedId, (threadId) => {
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

watch(activeThreadMessageId, async (messageId) => {
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

  if (event.key === 'Escape' && openScreenerOptionsFor.value) {
    openScreenerOptionsFor.value = ''
    return
  }
  if (!isReadingMessage.value || !selectedThread.value || classificationTarget.value || event.shiftKey) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeMessage()
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

let threadRailResizeObserver: ResizeObserver | undefined
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
  window.addEventListener('keydown', handleThreadKeydown)
  window.addEventListener('pointerdown', handleScreenerOutsideClick)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleThreadKeydown)
  window.removeEventListener('pointerdown', handleScreenerOutsideClick)
  threadRailResizeObserver?.disconnect()
})

async function importFixture() {
  isImportingFixture.value = true
  fixtureError.value = ''

  try {
    const fixture = await fetch('/fixtures/courrier-test.eml')
    if (!fixture.ok) throw new Error('Le message de démonstration est introuvable.')

    const result = await $fetch<{ id: string }>('/api/dev/ingest', {
      method: 'POST',
      body: await fixture.text(),
      headers: { 'content-type': 'message/rfc822' },
    })

    await refreshMessages()
    const imported = inboxMessages.value?.find(message => message.id === result.id)
    if (imported) openMessage(imported)
  } catch (error) {
    fixtureError.value = error instanceof Error ? error.message : 'Impossible d’importer le message de test.'
  } finally {
    isImportingFixture.value = false
  }
}

function openMessage(message: InboxMessage) {
  openedFromList.value = true
  messageReadError.value = ''
  resetThreadPresentation(message.id)
  void router.push({
    path: threadPath(message.folder, message.threadId),
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
      messageReadError.value = 'Le fil est ouvert, mais certains états de lecture n’ont pas été enregistrés.'
    }
  })
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
    if (revision === searchRevision) searchError.value = 'La recherche a échoué. Vérifie ta connexion et réessaie.'
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
      showClassificationFeedback(`${result.affectedMessages} message${result.affectedMessages > 1 ? 's' : ''} classé${result.affectedMessages > 1 ? 's' : ''} dans ${mailboxByName(result.folder).label}.`, result.undoId)
    } else {
      await $fetch(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
        method: 'PATCH',
        body: { folder },
      })
      showClassificationFeedback('Message classé. Les autres et les prochains restent dans le Screener.')
    }
    classificationTarget.value = null
    await refreshMessages()
  } catch {
    screenerActionError.value = 'Le classement n’a pas pu être enregistré. Vérifie ta connexion et réessaie.'
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
    showClassificationFeedback(`Adresse bloquée. ${result.preservedMessages} message${result.preservedMessages > 1 ? 's reçus restent consultables' : ' reçu reste consultable'} dans l’historique.`)
    await refreshMessages()
  } catch {
    screenerActionError.value = 'Le blocage n’a pas pu être enregistré. Vérifie ta connexion et réessaie.'
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
    showClassificationFeedback('Message déplacé dans la corbeille. Tu pourras le restaurer depuis cette boîte.')
    await refreshMessages()
  } catch {
    screenerActionError.value = 'Le message n’a pas pu être déplacé dans la corbeille. Vérifie ta connexion et réessaie.'
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
    showClassificationFeedback('Message restauré dans sa boîte d’origine.')
    await refreshMessages()
    if (wasReadingFromTrash) void router.push(mailboxPath('Trash'))
  } catch {
    screenerActionError.value = 'Le message n’a pas pu être restauré. Vérifie ta connexion et réessaie.'
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
    showClassificationFeedback(`${result.clearedMessages} message${result.clearedMessages > 1 ? 's écartés' : ' écarté'} de la file. Ils restent consultables dans l’historique.`)
    await refreshMessages()
  } catch {
    screenerActionError.value = 'La file n’a pas pu être vidée. Vérifie ta connexion et réessaie.'
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
      showClassificationFeedback('Adresse autorisée à nouveau. Les messages conservés sont de retour dans la file du Screener.')
    } else {
      await $fetch(`/api/messages/${encodeURIComponent(message.id)}/restore-screener`, { method: 'POST' })
      showClassificationFeedback('Messages remis dans la file du Screener.')
    }
    await refreshMessages()
  } catch {
    screenerActionError.value = 'La modification n’a pas pu être enregistrée. Vérifie ta connexion et réessaie.'
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
    messageReadError.value = 'Impossible d’enregistrer la lecture. Vérifie ta connexion et réessaie.'
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

function openClassification(message: InboxMessage, scope: 'sender' | 'message' = 'sender') {
  classificationTarget.value = message
  classificationScope.value = scope
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
      undoClassificationId.value = ''
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
    showClassificationFeedback(`Règle annulée : ${result.restoredMessages} message${result.restoredMessages > 1 ? 's' : ''} restauré${result.restoredMessages > 1 ? 's' : ''} dans son emplacement précédent${result.restoredMessages > 1 ? ' respectif' : ''}.`)
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = 'Règle annulée, mais la boîte n’a pas pu se recharger. Utilise Réessayer.'
    }
  } catch {
    classificationActionError.value = 'L’annulation n’a pas abouti. Recharge la boîte et vérifie le classement avant de réessayer.'
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
    if (classificationScope.value === 'sender') {
      const result = await $fetch<{ folder: MailboxFolder, affectedMessages: number, undoId: string }>(`/api/messages/${encodeURIComponent(message.id)}/sender-rule`, {
        method: 'PUT',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback(`${result.affectedMessages} message${result.affectedMessages > 1 ? 's' : ''} classé${result.affectedMessages > 1 ? 's' : ''} dans ${mailboxByName(result.folder).label}.`, result.undoId)
    } else {
      const result = await $fetch<{ folder: MailboxFolder }>(`/api/messages/${encodeURIComponent(message.id)}/folder`, {
        method: 'PATCH',
        body: { folder: classificationFolder.value },
      })
      showClassificationFeedback(`Message déplacé dans ${mailboxByName(result.folder).label}. La règle de l’expéditeur reste inchangée.`)
    }

    classificationTarget.value = null
    closeMessage()
    try {
      await refreshMessages()
    } catch {
      classificationActionError.value = 'Classement enregistré, mais la boîte n’a pas pu se recharger. Utilise Réessayer.'
    }
  } catch {
    classificationError.value = 'Le classement n’a pas pu être enregistré. Vérifie ta connexion et réessaie.'
  } finally {
    isSavingClassification.value = false
  }
}

onUnmounted(() => {
  if (undoTimer) clearTimeout(undoTimer)
  if (searchTimer) clearTimeout(searchTimer)
  searchRevision += 1
})

useSeoMeta({
  title: 'Courrier — votre boîte, à votre façon',
  description: 'Une boîte de réception personnelle pour vos domaines.',
})
</script>
