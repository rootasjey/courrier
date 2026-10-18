<template>
  <Teleport to="body">
    <Transition name="compose-shell">
      <div v-if="open" class="compose-stage" :class="`is-${mode}`">
        <div v-if="mode === 'minimized'" ref="minimizedElement" class="compose-minimized">
          <button class="compose-minimized-main" type="button" @click="restoreComposer">
            <span class="compose-minimized-copy">
              <strong>{{ subject || $t('composer.newMessage') }}</strong>
              <small>{{ minimizedSubtitle }}</small>
            </span>
            <span class="sr-only">{{ $t('composer.resumeWriting') }}</span>
          </button>
          <NTooltip :content="$t('composer.closeDraft')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
            <button class="compose-icon-button compose-minimized-close" type="button" :aria-label="$t('composer.closeComposer')" :disabled="sending" @click="closeComposer">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
            </button>
          </NTooltip>
        </div>

        <section ref="composerWindow" v-show="mode !== 'minimized'" class="compose-window" :class="`is-${mode}`" role="dialog" :aria-modal="mode === 'full' ? 'true' : undefined" aria-labelledby="compose-title">
          <header class="compose-header">
            <h2 id="compose-title" :class="{ 'sr-only': mode === 'full' }">{{ $t('composer.newMessage') }}</h2>
            <div class="compose-window-actions">
              <button class="compose-drafts-count" type="button" :disabled="loading" @click="openDrafts">
                {{ $t(draftCount === 1 ? 'composer.draftCountOne' : 'composer.draftCountMany', { count: draftCount }) }}
              </button>
              <NTooltip :content="$t('composer.minimize')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                <button class="compose-icon-button" type="button" :aria-label="$t('composer.minimize')" :disabled="sending" @click="minimizeComposer">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7 6 6 6-6" /></svg>
                </button>
              </NTooltip>
              <NTooltip :content="$t(mode === 'popup' ? 'composer.fullPage' : 'composer.openPopup')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                <button class="compose-icon-button" type="button" :aria-label="$t(mode === 'popup' ? 'composer.fullPage' : 'composer.openPopup')" :disabled="sending" @click="togglePopupMode">
                  <svg v-if="mode === 'popup'" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m0-4 6 6m4 8h4v-4m0 4-6-6" /></svg>
                  <svg v-else viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3h6v6m0-6-8 8" /><path d="M15 11v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
                </button>
              </NTooltip>
              <NTooltip :content="$t('composer.closeDraft')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                <button class="compose-icon-button" type="button" :aria-label="$t('composer.closeComposer')" :disabled="sending" @click="closeComposer">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
                </button>
              </NTooltip>
            </div>
          </header>

          <div v-if="loading" class="compose-state">{{ $t('composer.loading') }}</div>
          <div v-else-if="loadFailed && !draftId" class="compose-state compose-error" role="alert">
            <p>{{ error }}</p>
            <button class="compose-secondary" type="button" @click="loadDraft">{{ $t('common.retry') }}</button>
          </div>
          <template v-else>
            <div class="compose-body">
              <label class="compose-subject-block">
                <span class="sr-only">{{ $t('composer.subject') }}</span>
                <input ref="subjectInput" v-model="subject" class="compose-subject-input" type="text" :placeholder="$t('composer.newMessage')" :disabled="sending || draftStatus === 'sending'" @keydown.enter.prevent="focusRecipientInput">
              </label>
              <div class="compose-fields">
                <div class="compose-recipient-line">
                  <span class="compose-recipient-line-label">{{ $t('composer.to') }}</span>
                  <div class="compose-recipient-control" @click="recipientInput?.focus()">
                    <span
                      v-for="recipient in visibleRecipients"
                      :key="`${recipient.address}-${recipient.field}`"
                      class="compose-recipient-badge"
                      :class="`is-${recipient.field}`"
                      :title="recipient.address"
                    >
                      <button
                        class="compose-recipient-badge-main"
                        type="button"
                        :aria-label="$t('composer.changeRecipientType', { address: recipient.address })"
                        aria-haspopup="menu"
                        @click="openRecipientMenuFromClick($event, recipient.address, recipient.field)"
                        @contextmenu.prevent="openRecipientMenu($event, recipient.address, recipient.field)"
                        @pointerdown="startRecipientLongPress($event, recipient.address, recipient.field)"
                        @pointerup="cancelRecipientLongPress"
                        @pointercancel="cancelRecipientLongPress"
                        @pointermove="moveRecipientLongPress"
                        @keydown.enter.prevent="openRecipientMenuFromKeyboard($event, recipient.address, recipient.field)"
                        @keydown.space.prevent="openRecipientMenuFromKeyboard($event, recipient.address, recipient.field)"
                      >
                        <span class="compose-recipient-badge-label">{{ recipientLabels[recipient.address.toLocaleLowerCase()] || recipient.address }}</span>
                        <span v-if="recipient.field !== 'to'" class="compose-recipient-role">{{ recipient.field === 'cc' ? $t('composer.cc') : $t('composer.bcc') }}</span>
                      </button>
                      <button class="compose-recipient-badge-remove" type="button" :aria-label="$t('composer.removeRecipient', { address: recipient.address })" :disabled="sending || draftStatus === 'sending'" @click.stop="removeRecipient(recipient.field, recipient.address)">×</button>
                    </span>
                    <input ref="recipientInput" v-model="recipientEntry" type="text" inputmode="email" autocomplete="off" :placeholder="$t('composer.emailPlaceholder')" :disabled="sending || draftStatus === 'sending'" aria-autocomplete="list" :aria-expanded="recipientSuggestionsOpen" aria-controls="compose-recipient-suggestions" @input="handleRecipientInput($event)" @focus="updateContactSuggestions(recipientEntry)" @blur="onRecipientBlur" @keydown="onRecipientKeydown" @keydown.backspace="removeLastRecipient($event)">
                    <div v-if="recipientSuggestionsOpen" id="compose-recipient-suggestions" class="compose-recipient-suggestions" role="listbox" :aria-label="$t('composer.contactSuggestions')">
                      <button v-for="(suggestion, index) in recipientSuggestions" :key="suggestion.address" type="button" role="option" :aria-selected="recipientSuggestionIndex === index" :class="{ active: recipientSuggestionIndex === index }" @mousedown.prevent @click="selectRecipientSuggestion(suggestion)">
                        <strong>{{ suggestion.displayName }}</strong><span>{{ suggestion.address }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <p v-if="recipientError" class="compose-field-error" role="alert">{{ recipientError }}</p>

              <div class="compose-editor-shell">
                <BubbleMenu v-if="editor" :editor="editor" :options="{ placement: 'top', offset: 8 }" class="compose-bubble-menu">
                  <NTooltip :content="$t('composer.bold')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                    <button type="button" :class="{ active: editor.isActive('bold') }" :aria-label="$t('composer.bold')" @mousedown.prevent @click="editor.chain().focus().toggleBold().run()"><strong>G</strong></button>
                  </NTooltip>
                  <NTooltip :content="$t('composer.italic')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                    <button type="button" :class="{ active: editor.isActive('italic') }" :aria-label="$t('composer.italic')" @mousedown.prevent @click="editor.chain().focus().toggleItalic().run()"><em>I</em></button>
                  </NTooltip>
                  <NTooltip :content="$t('composer.strikethrough')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                    <button type="button" :class="{ active: editor.isActive('strike') }" :aria-label="$t('composer.strikethrough')" @mousedown.prevent @click="editor.chain().focus().toggleStrike().run()"><s>S</s></button>
                  </NTooltip>
                  <span class="compose-toolbar-separator" aria-hidden="true" />
                  <NTooltip :content="$t('composer.addLink')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                    <button type="button" :class="{ active: editor.isActive('link') }" :aria-label="$t('composer.addLink')" @mousedown.prevent @click="addLink">{{ $t('composer.link') }}</button>
                  </NTooltip>
                </BubbleMenu>
                <div v-if="editor && slashState.open" ref="slashMenu" class="compose-slash-menu" :style="slashMenuStyle" role="listbox" :aria-label="$t('composer.insertCommands')">
                  <p class="compose-slash-heading">{{ $t('composer.insertBlock') }}</p>
                  <button v-for="(item, index) in filteredSlashCommands" :key="item.label" type="button" role="option" :aria-selected="slashIndex === index" :class="{ active: slashIndex === index }" @mousedown.prevent @click="applySlashCommand(item)">
                    <span class="compose-slash-icon" aria-hidden="true">{{ item.icon }}</span>
                    <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
                  </button>
                  <p v-if="!filteredSlashCommands.length" class="compose-slash-empty">{{ $t('composer.noCommands') }}</p>
                </div>
                <EditorContent v-if="editor" class="compose-editor" :editor="editor" @keydown.capture="onEditorKeydown" />
              </div>

              <input ref="attachmentInput" class="sr-only" type="file" multiple @change="onFilesSelected">

              <div v-if="attachments.length" class="compose-attachments" :aria-label="$t('composer.attachments')">
                <div v-for="attachment in attachments" :key="attachment.id" class="compose-attachment">
                  <span class="compose-attachment-icon" aria-hidden="true">{{ attachment.disposition === 'inline' ? '▧' : '↗' }}</span>
                  <span class="compose-attachment-name"><strong>{{ attachment.filename }}</strong><small>{{ formatSize(attachment.sizeBytes) }}{{ attachment.disposition === 'inline' ? ` · ${$t('composer.inlineImage')}` : '' }}</small></span>
                  <button type="button" :aria-label="$t('composer.removeAttachment', { filename: attachment.filename })" :disabled="sending || draftStatus === 'sending'" @click="removeAttachment(attachment)">×</button>
                </div>
              </div>

              <p v-if="uploading" class="compose-status" role="status">{{ $t('composer.addingFiles') }}</p>
              <p v-else-if="error" class="compose-error" role="alert">{{ error }}</p>
              <p v-else-if="draftStatus === 'sending'" class="compose-status" role="status">{{ $t('composer.sendUncertain') }}</p>
            </div>

            <footer class="compose-footer">
              <div class="compose-footer-status">
                <span class="compose-save-status" role="status">{{ saving ? $t('composer.saving') : saved ? $t('composer.saved') : hasMeaningfulDraftContent ? $t('composer.draftInProgress') : '' }}</span>
                <p class="compose-size-meter" :class="{ 'compose-size-over': estimatedEmailBytes > OUTBOUND_MESSAGE_BUDGET_BYTES }" role="status">
                  {{ $t('composer.estimatedSize') }} : {{ formatSize(estimatedEmailBytes) }} / {{ formatSize(OUTBOUND_MESSAGE_BUDGET_BYTES) }}
                  <span v-if="estimatedEmailBytes <= OUTBOUND_MESSAGE_BUDGET_BYTES"> ({{ $t('composer.sizeLimit') }})</span>
                  <span v-else> · {{ $t('composer.reduceMessage') }}</span>
                </p>
              </div>
              <NTooltip :content="$t('composer.attachFiles')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                <button class="compose-tool-button compose-icon-action" type="button" :aria-label="$t('composer.attachFiles')" :disabled="sending || draftStatus === 'sending'" @click="chooseFiles('attachment')">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.3 10.8 5.1-5.1a2.6 2.6 0 0 1 3.7 3.7l-7.2 7.2a4.2 4.2 0 0 1-5.9-5.9l7.1-7.1" /></svg>
                </button>
              </NTooltip>
              <NTooltip v-if="draftId" :content="$t('composer.deleteDraft')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                <button class="compose-discard compose-icon-action" type="button" :aria-label="$t('composer.deleteDraft')" :disabled="sending || draftStatus === 'sending'" @click="discardDraft">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13m-11.5 0 .7 11h8.6l.7-11M7.5 5.5V3.8h5v1.7m-3.5 3v5m2-5v5" /></svg>
                </button>
              </NTooltip>
              <NTooltip :content="`${$t('composer.send')} · ⌘/Ctrl + ↵`" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
                <button class="compose-send" type="button" aria-keyshortcuts="Control+Enter Meta+Enter" :disabled="!canRequestSend" @click="requestSend">{{ sending ? $t('composer.sending') : $t('composer.send') }}</button>
              </NTooltip>
            </footer>
          </template>

        </section>

        <div v-if="recipientMenu" class="compose-recipient-menu" role="menu" :style="recipientMenuStyle" :aria-label="$t('composer.recipientType')">
          <button v-for="role in recipientRoles" :key="role" type="button" role="menuitemradio" :aria-checked="recipientMenu.field === role" :class="{ active: recipientMenu.field === role }" @click="changeRecipientRole(role)">{{ role === 'to' ? $t('composer.to') : role === 'cc' ? $t('composer.cc') : $t('composer.bcc') }}</button>
        </div>

        <NDialog
          :open="confirmSend"
          :title="$t('composer.confirmSendTitle')"
          :description="$t('composer.confirmSendDescription')"
          :show-close="false"
          :_dialog-overlay="{ class: 'compose-confirm-overlay' }"
          :_dialog-content="{ class: 'classification-dialog compose-confirm-dialog' }"
          @update:open="(open: boolean) => { if (!sending) confirmSend = open }"
        >
          <template #content>
            <header class="dialog-header">
              <p class="dialog-kicker">{{ $t('composer.reviewBeforeSend') }}</p>
              <NDialogTitle class="dialog-title">{{ $t('composer.confirmSendTitle') }}</NDialogTitle>
              <NDialogDescription class="screener-confirm-copy">
                {{ $t('composer.willSendFrom') }} <strong>courrier-test@verbatims.cc</strong> {{ $t('composer.to') }} {{ toRecipientList.join(', ') }}
                <template v-if="ccRecipientList.length">, {{ $t('composer.ccTo') }} {{ ccRecipientList.join(', ') }}</template>
                <template v-if="bccRecipientList.length">, {{ $t('composer.bccTo') }} {{ bccRecipientList.join(', ') }}</template>.
              </NDialogDescription>
            </header>
            <footer class="dialog-actions">
              <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="sending">{{ $t('composer.continueWriting') }}</button></NDialogClose>
              <button class="dialog-save" type="button" :disabled="sending" @click="sendDraft">{{ sending ? $t('composer.sending') : $t('composer.confirmSend') }}</button>
            </footer>
          </template>
        </NDialog>

        <NDialog
          :open="confirmDiscard"
          :title="$t('composer.deleteDraftTitle')"
          :description="$t('composer.deleteDraftDescription')"
          :show-close="false"
          :_dialog-overlay="{ class: 'compose-confirm-overlay' }"
          :_dialog-content="{ class: 'classification-dialog compose-confirm-dialog' }"
          @update:open="(open: boolean) => { if (!discarding) confirmDiscard = open }"
        >
          <template #content>
            <header class="dialog-header">
              <p class="dialog-kicker">{{ $t('composer.permanentDelete') }}</p>
              <NDialogTitle class="dialog-title">{{ $t('composer.deleteDraftTitle') }}</NDialogTitle>
              <NDialogDescription class="screener-confirm-copy">{{ $t('composer.deleteDraftDescription') }}</NDialogDescription>
            </header>
            <footer class="dialog-actions">
              <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="discarding">{{ $t('common.cancel') }}</button></NDialogClose>
              <button class="dialog-danger" type="button" :disabled="discarding" @click="confirmDiscardDraft">{{ discarding ? $t('composer.deleting') : $t('composer.deleteDraft') }}</button>
            </footer>
          </template>
        </NDialog>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { estimateOutgoingEmailBytes, formatEmailSize, OUTBOUND_MESSAGE_BUDGET_BYTES } from '#shared/utils/outgoing-email-size'

type ComposeAttachment = { id: string, filename: string, mimeType: string, sizeBytes: number, contentId: string, disposition: 'attachment' | 'inline' }
type ComposeDraft = { id: string, to: string, cc?: string, bcc?: string, subject: string, content: Record<string, unknown>, status: 'draft' | 'sending', updatedAt?: string, attachments: ComposeAttachment[] }
type InitialDraft = { to: string, subject: string, body: string }
type SlashCommand = { label: string, description: string, icon: string, apply: () => void }
type RecipientField = 'to' | 'cc' | 'bcc'
type ContactSuggestion = { address: string, displayName: string }
type RecipientMenuState = { address: string, field: RecipientField, x: number, y: number }

const props = defineProps<{ open: boolean, draftId?: string | null, initialDraft?: InitialDraft | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean], sent: [messageId: string], 'show-drafts': [] }>()
const { $t } = useI18n()
const { locale } = useI18nLocale()

const draftId = ref('')
const draftCount = ref(0)
const to = ref('')
const recipientEntry = ref('')
const cc = ref('')
const bcc = ref('')
const subject = ref('')
const recipientLabels = ref<Record<string, string>>({})
const recipientSuggestions = ref<ContactSuggestion[]>([])
const recipientSuggestionsOpen = ref(false)
const recipientSuggestionIndex = ref(0)
const recipientMenu = ref<RecipientMenuState | null>(null)
const attachments = ref<ComposeAttachment[]>([])
const draftStatus = ref<'draft' | 'sending'>('draft')
const mode = ref<'full' | 'popup' | 'minimized'>('full')
const expandedMode = ref<'full' | 'popup'>('full')
const loading = ref(false)
const loadFailed = ref(false)
const editorRevision = ref(0)
const composerWindow = ref<HTMLElement | null>(null)
const minimizedElement = ref<HTMLElement | null>(null)
const slashMenu = ref<HTMLElement | null>(null)
const saving = ref(false)
const saved = ref(false)
const uploading = ref(false)
const sending = ref(false)
const confirmSend = ref(false)
const confirmDiscard = ref(false)
const discarding = ref(false)
const sendAttempted = ref(false)
const error = ref('')
const attachmentInput = ref<HTMLInputElement | null>(null)
const recipientInput = ref<HTMLInputElement | null>(null)
const subjectInput = ref<HTMLInputElement | null>(null)
const nextDisposition = ref<'attachment' | 'inline'>('attachment')
const slashState = ref({ open: false, query: '', from: 0, to: 0 })
const slashIndex = ref(0)
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveRevision = 0
let savedRevision = 0
let savePromise: Promise<boolean> | null = null
let forceDraftCreation = false
let hydrating = false
let contactSuggestionTimer: ReturnType<typeof setTimeout> | undefined
let contactSuggestionRequest = 0
let recipientLongPressTimer: ReturnType<typeof setTimeout> | undefined
let recipientLongPressOrigin: { x: number, y: number } | null = null

const recipientRoles: RecipientField[] = ['to', 'cc', 'bcc']

const editor = useEditor({
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ['mailto'] }),
    Image.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder: () => $t('composer.bodyPlaceholder') }),
  ],
  editorProps: {
    handleKeyDown: (_view, event) => onEditorKeydown(event),
  },
  onUpdate: () => {
    editorRevision.value += 1
    updateSlashState()
    scheduleSave()
  },
  onSelectionUpdate: updateSlashState,
})

const slashCommands = computed<SlashCommand[]>(() => [
  { label: $t('composer.slash.text'), description: $t('composer.slash.textDescription'), icon: '¶', apply: () => editor.value?.chain().focus().setParagraph().run() },
  { label: $t('composer.slash.heading1'), description: $t('composer.slash.heading1Description'), icon: 'H1', apply: () => editor.value?.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: $t('composer.slash.heading2'), description: $t('composer.slash.heading2Description'), icon: 'H2', apply: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: $t('composer.slash.bullets'), description: $t('composer.slash.bulletsDescription'), icon: '•', apply: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: $t('composer.slash.numbered'), description: $t('composer.slash.numberedDescription'), icon: '1.', apply: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { label: $t('composer.slash.quote'), description: $t('composer.slash.quoteDescription'), icon: '“', apply: () => editor.value?.chain().focus().toggleBlockquote().run() },
  { label: $t('composer.slash.code'), description: $t('composer.slash.codeDescription'), icon: '</>', apply: () => editor.value?.chain().focus().toggleCodeBlock().run() },
  { label: $t('composer.slash.divider'), description: $t('composer.slash.dividerDescription'), icon: '—', apply: () => editor.value?.chain().focus().setHorizontalRule().run() },
  { label: $t('composer.slash.image'), description: $t('composer.slash.imageDescription'), icon: '▧', apply: () => chooseFiles('inline') },
])

const filteredSlashCommands = computed(() => {
  const query = slashState.value.query.trim().toLocaleLowerCase(locale.value)
  return slashCommands.value.filter(item => !query || `${item.label} ${item.description}`.toLocaleLowerCase(locale.value).includes(query))
})

watch([slashIndex, filteredSlashCommands], async () => {
  await nextTick()
  const activeItem = slashMenu.value?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
  if (!activeItem) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  activeItem.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
})

const slashMenuStyle = computed(() => {
  const current = editor.value
  const shell = composerWindow.value?.querySelector<HTMLElement>('.compose-editor-shell')
  if (!current || !shell || !slashState.value.open) return {}
  try {
    const caret = current.view.coordsAtPos(slashState.value.from)
    const bounds = shell.getBoundingClientRect()
    return {
      left: `${Math.max(0, Math.min(bounds.width - 300, caret.left - bounds.left))}px`,
      top: `${Math.max(0, caret.bottom - bounds.top + 8)}px`,
    }
  } catch {
    return { left: '0px', top: '28px' }
  }
})

function updateSlashState() {
  const current = editor.value
  const selection = current?.state.selection
  if (!current || !selection?.empty || current.isActive('codeBlock')) {
    slashState.value = { open: false, query: '', from: 0, to: 0 }
    slashIndex.value = 0
    return
  }

  const beforeCursor = selection.$from.parent.textContent.slice(0, selection.$from.parentOffset)
  const match = /(^|\s)\/([^\s/]*)$/u.exec(beforeCursor)
  if (!match) {
    slashState.value = { open: false, query: '', from: 0, to: 0 }
    slashIndex.value = 0
    return
  }

  const from = selection.from - match[0].length + match[1].length
  const query = match[2]
  if (!slashState.value.open || slashState.value.query !== query) slashIndex.value = 0
  slashState.value = { open: true, query, from, to: selection.from }
}

watch(editor, (current, previous) => {
  previous?.off('transaction', updateSlashState)
  current?.on('transaction', updateSlashState)
  updateSlashState()
})

function onEditorKeydown(event: KeyboardEvent) {
  if (!slashState.value.open) return false
  const items = filteredSlashCommands.value
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!items.length) return true
    slashIndex.value = (slashIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    return true
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    slashState.value.open = false
    return true
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const item = items[slashIndex.value]
    if (item) applySlashCommand(item)
    return true
  }
  return false
}

function applySlashCommand(item: SlashCommand) {
  const current = editor.value
  if (!current) return
  const { from, to } = slashState.value
  slashState.value.open = false
  current.chain().focus().deleteRange({ from, to }).run()
  item.apply()
}

function splitRecipients(value: string) {
  return value.split(/[;,\n]+/).map(address => address.trim()).filter(Boolean)
}

function isValidRecipient(address: string) {
  return /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/.test(address)
}

function parseRecipientToken(raw: string, fallback: RecipientField = 'to') {
  let value = raw.trim()
  let field = fallback
  const prefix = /^(cci|bcc|cc)\s*(?::\s*|\s+)(.*)$/iu.exec(value)
  if (prefix) {
    field = prefix[1]!.toLocaleLowerCase() === 'cc' ? 'cc' : 'bcc'
    value = prefix[2]!.trim()
  }
  const mailbox = /^(.*?)\s*<([^<>]+)>$/u.exec(value)
  if (mailbox && isValidRecipient(mailbox[2]!.trim())) {
    return { field, address: mailbox[2]!.trim(), displayName: mailbox[1]!.trim().replace(/^"|"$/g, '') }
  }
  return { field, address: value, displayName: '' }
}

const committedRecipients = computed(() => splitRecipients(to.value))
const ccRecipients = computed(() => splitRecipients(cc.value))
const bccRecipients = computed(() => splitRecipients(bcc.value))
const pendingRecipientTokens = computed(() => splitRecipients(recipientEntry.value).map(token => parseRecipientToken(token)))
const toRecipientList = computed(() => [...committedRecipients.value, ...pendingRecipientTokens.value.filter(item => item.field === 'to').map(item => item.address)])
const ccRecipientList = computed(() => [...ccRecipients.value, ...pendingRecipientTokens.value.filter(item => item.field === 'cc').map(item => item.address)])
const bccRecipientList = computed(() => [...bccRecipients.value, ...pendingRecipientTokens.value.filter(item => item.field === 'bcc').map(item => item.address)])
const recipientList = computed(() => [...toRecipientList.value, ...ccRecipientList.value, ...bccRecipientList.value])
const visibleRecipients = computed(() => [
  ...committedRecipients.value.map(address => ({ address, field: 'to' as const })),
  ...ccRecipients.value.map(address => ({ address, field: 'cc' as const })),
  ...bccRecipients.value.map(address => ({ address, field: 'bcc' as const })),
])
const hasMeaningfulDraftContent = computed(() => {
  editorRevision.value
  return Boolean(committedRecipients.value.length || ccRecipients.value.length || bccRecipients.value.length
    || pendingRecipientTokens.value.some(item => isValidRecipient(item.address))
    || subject.value.trim() || editor.value?.getText().trim() || attachments.value.length)
})
const hasSendableContent = computed(() => {
  editorRevision.value
  return Boolean(editor.value?.getText().trim() || attachments.value.length)
})
const minimizedSubtitle = computed(() => to.value || recipientEntry.value || (saved.value ? $t('composer.saved') : hasMeaningfulDraftContent.value ? $t('composer.draftInProgress') : $t('composer.newMessage')))

function recipientValue(field: RecipientField) { return field === 'to' ? to : field === 'cc' ? cc : bcc }

function addRecipients(addresses: string[], fallback: RecipientField = 'to') {
  for (const raw of addresses) {
    const item = parseRecipientToken(raw, fallback)
    const address = item.address.trim()
    if (!isValidRecipient(address)) continue
    const normalized = address.toLocaleLowerCase()
    if ([...committedRecipients.value, ...ccRecipients.value, ...bccRecipients.value].some(existing => existing.toLocaleLowerCase() === normalized)) continue
    const target = recipientValue(item.field)
    target.value = [...splitRecipients(target.value), address].join(', ')
    if (item.displayName) recipientLabels.value = { ...recipientLabels.value, [normalized]: item.displayName }
  }
}

function commitRecipientEntry() {
  const entries = splitRecipients(recipientEntry.value)
  addRecipients(entries)
  recipientEntry.value = entries.filter((raw) => {
    const item = parseRecipientToken(raw)
    return !isValidRecipient(item.address)
  }).join(', ')
}

function handleRecipientInput(event: Event) {
  const entry = recipientEntry
  const value = (event.target as HTMLInputElement).value
  if (!/[;,\n]/.test(value)) {
    if (!/\s$/.test(value)) {
      updateContactSuggestions(value)
      return
    }
    const candidate = value.trim()
    if (!isValidRecipient(parseRecipientToken(candidate).address)) {
      updateContactSuggestions(value)
      return
    }
    addRecipients([candidate])
    entry.value = ''
    recipientSuggestionsOpen.value = false
    return
  }
  const parts = value.split(/[;,\n]/u)
  const remainder = parts.pop()?.trim() || ''
  const completed = parts.map(address => address.trim()).filter(Boolean)
  addRecipients(completed)
  entry.value = [...completed.filter((raw) => !isValidRecipient(parseRecipientToken(raw).address)), remainder].filter(Boolean).join(', ')
  updateContactSuggestions(entry.value)
}

function removeRecipient(field: RecipientField, address: string) {
  const target = recipientValue(field)
  target.value = splitRecipients(target.value).filter(item => item.toLocaleLowerCase() !== address.toLocaleLowerCase()).join(', ')
}

function removeLastRecipient(event: KeyboardEvent) {
  const recipient = visibleRecipients.value.at(-1)
  if (recipientEntry.value || !recipient) return
  event.preventDefault()
  removeRecipient(recipient.field, recipient.address)
}

function focusRecipientInput() { recipientInput.value?.focus() }

function updateContactSuggestions(value: string) {
  if (contactSuggestionTimer) clearTimeout(contactSuggestionTimer)
  const query = parseRecipientToken(value).address.trim()
  const request = ++contactSuggestionRequest
  if (query.length < 2 || isValidRecipient(query)) {
    recipientSuggestions.value = []
    recipientSuggestionsOpen.value = false
    return
  }
  contactSuggestionTimer = setTimeout(async () => {
    try {
      const result = await $fetch<ContactSuggestion[]>('/api/contacts/suggestions', { query: { q: query } })
      if (request !== contactSuggestionRequest) return
      recipientSuggestions.value = result
      recipientSuggestionsOpen.value = result.length > 0
      recipientSuggestionIndex.value = 0
    } catch {
      if (request === contactSuggestionRequest) {
        recipientSuggestions.value = []
        recipientSuggestionsOpen.value = false
      }
    }
  }, 180)
}

function onRecipientBlur() {
  window.setTimeout(() => {
    if (!recipientMenu.value) {
      commitRecipientEntry()
      recipientSuggestionsOpen.value = false
    }
  }, 120)
}

function onRecipientKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && recipientSuggestionsOpen.value) {
    event.preventDefault()
    recipientSuggestionIndex.value = (recipientSuggestionIndex.value + 1) % recipientSuggestions.value.length
  } else if (event.key === 'ArrowUp' && recipientSuggestionsOpen.value) {
    event.preventDefault()
    recipientSuggestionIndex.value = (recipientSuggestionIndex.value - 1 + recipientSuggestions.value.length) % recipientSuggestions.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (recipientSuggestionsOpen.value && recipientSuggestions.value[recipientSuggestionIndex.value]) {
      selectRecipientSuggestion(recipientSuggestions.value[recipientSuggestionIndex.value]!)
      editor.value?.commands.focus()
      return
    }
    commitRecipientEntry()
    recipientSuggestionsOpen.value = false
    if (!recipientEntry.value) editor.value?.commands.focus()
  } else if (event.key === 'Escape' && recipientSuggestionsOpen.value) {
    event.stopPropagation()
    recipientSuggestionsOpen.value = false
  }
}

function selectRecipientSuggestion(suggestion: ContactSuggestion) {
  const { field } = parseRecipientToken(recipientEntry.value)
  recipientLabels.value = { ...recipientLabels.value, [suggestion.address.toLocaleLowerCase()]: suggestion.displayName }
  addRecipients([`${field === 'cc' ? 'cc: ' : field === 'bcc' ? 'cci: ' : ''}${suggestion.address}`])
  recipientEntry.value = ''
  recipientSuggestionsOpen.value = false
  recipientInput.value?.focus()
}

function recipientMenuPosition(clientX: number, clientY: number) {
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - 184)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - 144)),
  }
}

function openRecipientMenu(event: MouseEvent, address: string, field: RecipientField) {
  const position = recipientMenuPosition(event.clientX, event.clientY)
  recipientMenu.value = { address, field, ...position }
  recipientSuggestionsOpen.value = false
}

function openRecipientMenuFromClick(event: MouseEvent, address: string, field: RecipientField) {
  openRecipientMenu(event, address, field)
}

function openRecipientMenuFromKeyboard(event: KeyboardEvent, address: string, field: RecipientField) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  openRecipientMenu({ clientX: bounds.left, clientY: bounds.bottom } as MouseEvent, address, field)
}

function startRecipientLongPress(event: PointerEvent, address: string, field: RecipientField) {
  cancelRecipientLongPress()
  if (event.pointerType !== 'touch') return
  recipientLongPressOrigin = { x: event.clientX, y: event.clientY }
  recipientLongPressTimer = setTimeout(() => {
    const position = recipientMenuPosition(event.clientX, event.clientY)
    recipientMenu.value = { address, field, ...position }
    recipientSuggestionsOpen.value = false
  }, 500)
}

function moveRecipientLongPress(event: PointerEvent) {
  if (!recipientLongPressOrigin) return
  if (Math.hypot(event.clientX - recipientLongPressOrigin.x, event.clientY - recipientLongPressOrigin.y) > 10) cancelRecipientLongPress()
}

function cancelRecipientLongPress() {
  if (recipientLongPressTimer) clearTimeout(recipientLongPressTimer)
  recipientLongPressTimer = undefined
  recipientLongPressOrigin = null
}

function changeRecipientRole(field: RecipientField) {
  const menu = recipientMenu.value
  if (!menu || menu.field === field) {
    recipientMenu.value = null
    return
  }
  removeRecipient(menu.field, menu.address)
  addRecipients([`${field === 'cc' ? 'cc: ' : field === 'bcc' ? 'cci: ' : ''}${menu.address}`])
  recipientMenu.value = null
}

function onDocumentPointerdown(event: PointerEvent) {
  if (recipientMenu.value && !(event.target instanceof Element && event.target.closest('.compose-recipient-menu, .compose-recipient-badge'))) recipientMenu.value = null
  if (recipientSuggestionsOpen.value && !(event.target instanceof Element && event.target.closest('.compose-recipient-control'))) recipientSuggestionsOpen.value = false
}

const recipientMenuStyle = computed(() => recipientMenu.value ? { left: `${recipientMenu.value.x}px`, top: `${recipientMenu.value.y}px` } : {})
const estimatedEmailBytes = computed(() => {
  editorRevision.value
  return estimateOutgoingEmailBytes({
    to: toRecipientList.value,
    cc: ccRecipientList.value,
    bcc: bccRecipientList.value,
    subject: subject.value,
    text: editor.value?.getText() || '',
    html: editor.value?.getHTML() || '',
    attachments: attachments.value,
  })
})
const recipientError = computed(() => !toRecipientList.value.length
  ? sendAttempted.value ? $t('composer.recipientRequired') : ''
  : sendAttempted.value && (recipientList.value.length > 50 || recipientList.value.some(address => !isValidRecipient(address)))
    ? $t('composer.recipientInvalid')
    : '')
const canRequestSend = computed(() => Boolean(hasSendableContent.value && !loading.value && !uploading.value && !sending.value && draftStatus.value === 'draft' && estimatedEmailBytes.value <= OUTBOUND_MESSAGE_BUDGET_BYTES))
const canSend = computed(() => Boolean(draftId.value && toRecipientList.value.length && !recipientError.value && !recipientList.value.some(address => !isValidRecipient(address)) && estimatedEmailBytes.value <= OUTBOUND_MESSAGE_BUDGET_BYTES && !loading.value && !uploading.value && !sending.value && draftStatus.value === 'draft' && (editor.value?.getText().trim() || attachments.value.length)))

watch(() => [props.open, props.draftId] as const, (values, previous = [false, null]) => {
  if (!import.meta.client) return
  const [open, requestedDraftId] = values
  const [wasOpen, previousDraftId] = previous
  if (open) {
    mode.value = 'full'
    expandedMode.value = 'full'
    window.addEventListener('keydown', onWindowKeydown, true)
    window.addEventListener('pointerdown', onDocumentPointerdown, true)
    if (!wasOpen || requestedDraftId !== previousDraftId) {
      reset()
      void loadDraft(requestedDraftId)
    }
  }
  else {
    window.removeEventListener('keydown', onWindowKeydown, true)
    window.removeEventListener('pointerdown', onDocumentPointerdown, true)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
  }
}, { immediate: true })

watch([to, recipientEntry, cc, bcc, subject], () => scheduleSave())

async function loadDraft(requestedDraftId: string | null | undefined = props.draftId) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  loadFailed.value = false
  hydrating = true
  try {
    const draft = requestedDraftId
      ? await $fetch<ComposeDraft>(`/api/outgoing-drafts/${encodeURIComponent(requestedDraftId)}`)
      : { id: '', to: '', cc: '', bcc: '', subject: '', content: { type: 'doc', content: [{ type: 'paragraph' }] }, status: 'draft' as const, attachments: [] }
    draftId.value = draft.id
    const initialDraft = !requestedDraftId ? props.initialDraft : null
    const loadedRecipients = splitRecipients(initialDraft?.to ?? draft.to)
    to.value = loadedRecipients.filter(isValidRecipient).join(', ')
    const loadedCc = splitRecipients(draft.cc || '')
    const loadedBcc = splitRecipients(draft.bcc || '')
    cc.value = loadedCc.filter(isValidRecipient).join(', ')
    bcc.value = loadedBcc.filter(isValidRecipient).join(', ')
    recipientEntry.value = [
      ...loadedRecipients.filter(address => !isValidRecipient(address)),
      ...loadedCc.filter(address => !isValidRecipient(address)).map(address => `cc: ${address}`),
      ...loadedBcc.filter(address => !isValidRecipient(address)).map(address => `cci: ${address}`),
    ].join(', ')
    subject.value = initialDraft?.subject ?? draft.subject
    attachments.value = draft.attachments || []
    draftStatus.value = draft.status
    const initialContent = initialDraft ? plainTextToDocument(initialDraft.body) : null
    editor.value?.commands.setContent(initialContent || draft.content || { type: 'doc', content: [{ type: 'paragraph' }] })
    editor.value?.setEditable(draft.status === 'draft')
    saved.value = Boolean(requestedDraftId && draft.updatedAt)
    savedRevision = saveRevision
    await refreshDraftCount()
  } catch (cause) {
    error.value = readError(cause, $t('composer.loadError'))
    loadFailed.value = true
  } finally {
    hydrating = false
    loading.value = false
    if (!requestedDraftId && hasMeaningfulDraftContent.value) scheduleSave()
    await nextTick()
    if (props.open && mode.value !== 'minimized') {
      if (requestedDraftId) recipientInput.value?.focus()
      else subjectInput.value?.focus()
    }
  }
}

function plainTextToDocument(value: string) {
  const paragraphs = value.replace(/\r\n?/g, '\n').split(/\n{2,}/).filter(Boolean)
  return {
    type: 'doc',
    content: paragraphs.length
      ? paragraphs.map((paragraph) => {
          const lines = paragraph.split('\n')
          return {
            type: 'paragraph',
            content: lines.flatMap((line, index) => [
              ...(index ? [{ type: 'hardBreak' }] : []),
              ...(line ? [{ type: 'text', text: line }] : []),
            ]),
          }
        })
      : [{ type: 'paragraph' }],
  }
}

async function refreshDraftCount() {
  try {
    const drafts = await $fetch<{ id: string }[]>('/api/outgoing-drafts')
    draftCount.value = drafts.length
  } catch {
    // The composer can still be used if the count cannot be refreshed.
  }
}

function scheduleSave() {
  if (hydrating || (!draftId.value && !hasMeaningfulDraftContent.value) || draftStatus.value !== 'draft' || !props.open) return
  saveRevision += 1
  saved.value = false
  error.value = ''
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void saveDraft() }, 700)
}

function draftPayload() {
  const pending = { to: [] as string[], cc: [] as string[], bcc: [] as string[] }
  for (const raw of splitRecipients(recipientEntry.value)) {
    const item = parseRecipientToken(raw)
    if (item.address) pending[item.field].push(item.address)
  }
  const recipients = (value: string, entry: string) => [value.trim(), entry.trim()].filter(Boolean).join(', ')
  return {
    to: recipients(to.value, pending.to.join(', ')),
    cc: recipients(cc.value, pending.cc.join(', ')),
    bcc: recipients(bcc.value, pending.bcc.join(', ')),
    subject: subject.value,
    content: editor.value?.getJSON() || { type: 'doc', content: [{ type: 'paragraph' }] },
  }
}

async function saveDraft(): Promise<boolean> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  if (draftStatus.value !== 'draft') return false
  if (!editor.value) return !draftId.value && !hasMeaningfulDraftContent.value && !forceDraftCreation
  if (!draftId.value && !hasMeaningfulDraftContent.value && !forceDraftCreation) return true
  if (draftId.value && saved.value && saveRevision === savedRevision && !forceDraftCreation) return true

  if (savePromise) {
    const activeSave = savePromise
    const result = await activeSave
    if (savePromise === activeSave) savePromise = null
    if (saveRevision !== savedRevision && (draftId.value || hasMeaningfulDraftContent.value || forceDraftCreation)) return saveDraft()
    return result
  }

  const revision = saveRevision
  saving.value = true
  error.value = ''
  const payload = draftPayload()
  const operation = (async () => {
    try {
      if (!draftId.value) {
        const draft = await $fetch<ComposeDraft>('/api/outgoing-drafts', { method: 'POST', body: payload })
        draftId.value = draft.id
        draftCount.value += 1
        forceDraftCreation = false
      } else {
        await $fetch(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}`, { method: 'PATCH', body: payload })
      }
      savedRevision = revision
      if (revision === saveRevision) saved.value = true
      return true
    } catch (cause) {
      error.value = readError(cause, $t('composer.saveError'))
      return false
    } finally {
      saving.value = false
    }
  })()
  savePromise = operation
  const result = await operation
  if (savePromise === operation) savePromise = null
  if (result && revision !== saveRevision && (draftId.value || hasMeaningfulDraftContent.value || forceDraftCreation)) return saveDraft()
  return result
}

function chooseFiles(disposition: 'attachment' | 'inline') {
  nextDisposition.value = disposition
  if (attachmentInput.value) {
    attachmentInput.value.accept = disposition === 'inline' ? 'image/jpeg,image/png,image/gif,image/webp' : ''
    attachmentInput.value.click()
  }
}

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  uploading.value = true
  error.value = ''
  try {
    if (!draftId.value) {
      forceDraftCreation = true
      saveRevision += 1
      saved.value = false
    }
    if (!await saveDraft() || !draftId.value) return
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('disposition', nextDisposition.value)
      const attachment = await $fetch<ComposeAttachment>(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}/attachments`, { method: 'POST', body: form })
      attachments.value.push(attachment)
      if (attachment.disposition === 'inline') {
        editor.value?.chain().focus().setImage({
          src: `/api/outgoing-drafts/${encodeURIComponent(draftId.value)}/attachments/${encodeURIComponent(attachment.id)}/content`,
          alt: attachment.filename,
          title: attachment.filename,
        }).run()
      }
    }
    scheduleSave()
  } catch (cause) {
    error.value = readError(cause, $t('composer.addFileError'))
  } finally {
    uploading.value = false
  }
}

async function removeAttachment(attachment: ComposeAttachment) {
  if (!draftId.value) return
  try {
    await $fetch(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}/attachments/${encodeURIComponent(attachment.id)}`, { method: 'DELETE' })
    attachments.value = attachments.value.filter(item => item.id !== attachment.id)
    if (attachment.disposition === 'inline') {
      editor.value?.state.doc.descendants((node, position) => {
        if (node.type.name === 'image' && String(node.attrs.src).includes(`/attachments/${attachment.id}/content`)) {
          editor.value?.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run()
        }
      })
    }
    scheduleSave()
  } catch (cause) {
    error.value = readError(cause, $t('composer.removeAttachmentError'))
  }
}

function addLink() {
  if (!editor.value) return
  const current = editor.value.getAttributes('link').href as string | undefined
  const href = window.prompt('Adresse du lien', current || 'https://')
  if (href === null) return
  if (!href.trim()) editor.value.chain().focus().unsetLink().run()
  else editor.value.chain().focus().setLink({ href: href.trim() }).run()
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
    && mode.value !== 'minimized' && !confirmSend.value && !confirmDiscard.value && !slashState.value.open) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void requestSend()
    return
  }
  if (event.key !== 'Escape') return
  if (document.querySelector('details[open]')) return
  if (recipientMenu.value) {
    event.preventDefault()
    event.stopImmediatePropagation()
    recipientMenu.value = null
    return
  }
  if (recipientSuggestionsOpen.value) {
    event.preventDefault()
    event.stopImmediatePropagation()
    recipientSuggestionsOpen.value = false
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  if (slashState.value.open) slashState.value.open = false
  else if (confirmSend.value) confirmSend.value = false
  else if (confirmDiscard.value) confirmDiscard.value = false
  else if (mode.value !== 'minimized') minimizeComposer()
  else void closeComposer()
}

async function requestSend() {
  sendAttempted.value = true
  if (recipientError.value || !canRequestSend.value) return
  if (!await saveDraft()) return
  if (!canSend.value || !saved.value) return
  confirmSend.value = true
}

async function sendDraft() {
  if (!draftId.value || !canSend.value) return
  sending.value = true
  error.value = ''
  confirmSend.value = false
  try {
    const result = await $fetch<{ id: string }>(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}/send`, { method: 'POST' })
    emit('sent', result.id)
    emit('update:open', false)
    reset()
  } catch (cause) {
    error.value = readError(cause, $t('composer.sendError'))
    if (error.value.includes('état est incertain') || error.value.includes('accepté par Cloudflare')) {
      draftStatus.value = 'sending'
      editor.value?.setEditable(false)
    }
  } finally {
    sending.value = false
  }
}

async function discardDraft() {
  if (!draftId.value || discarding.value) return
  confirmDiscard.value = true
}

async function confirmDiscardDraft() {
  if (!draftId.value || discarding.value) return
  discarding.value = true
  try {
    await $fetch(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}`, { method: 'DELETE' })
    confirmDiscard.value = false
    emit('update:open', false)
    reset()
  } catch (cause) {
    error.value = readError(cause, $t('composer.deleteError'))
  } finally {
    discarding.value = false
  }
}

async function closeComposer() {
  if (sending.value) return
  if (!await saveDraft()) return
  emit('update:open', false)
}

async function openDrafts() {
  if (sending.value || loading.value) return
  if (!await saveDraft() || error.value) return
  emit('show-drafts')
}

async function transitionComposerMode(nextMode: 'full' | 'popup' | 'minimized') {
  if (sending.value) return
  if (!await saveDraft()) return
  if (mode.value === nextMode) return

  const currentElement = mode.value === 'minimized' ? minimizedElement.value : composerWindow.value
  const fromRect = currentElement?.getBoundingClientRect()
  if (mode.value !== 'minimized') expandedMode.value = mode.value
  mode.value = nextMode
  await nextTick()

  const targetElement = nextMode === 'minimized' ? minimizedElement.value : composerWindow.value
  const toRect = targetElement?.getBoundingClientRect()
  if (!fromRect || !toRect || !targetElement || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const scaleX = fromRect.width / Math.max(toRect.width, 1)
  const scaleY = fromRect.height / Math.max(toRect.height, 1)
  targetElement.animate([
    { transform: `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px) scale(${scaleX}, ${scaleY})`, transformOrigin: 'top left' },
    { transform: 'translate(0, 0) scale(1, 1)', transformOrigin: 'top left' },
  ], { duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)' })
}

function minimizeComposer() {
  void transitionComposerMode('minimized')
}

function restoreComposer() {
  void transitionComposerMode(expandedMode.value)
}

function togglePopupMode() {
  void transitionComposerMode(mode.value === 'popup' ? 'full' : 'popup')
}

function reset() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  draftId.value = ''
  to.value = ''
  recipientEntry.value = ''
  cc.value = ''
  bcc.value = ''
  recipientLabels.value = {}
  recipientSuggestions.value = []
  recipientSuggestionsOpen.value = false
  recipientMenu.value = null
  cancelRecipientLongPress()
  if (contactSuggestionTimer) clearTimeout(contactSuggestionTimer)
  contactSuggestionTimer = undefined
  subject.value = ''
  attachments.value = []
  draftStatus.value = 'draft'
  saved.value = false
  sendAttempted.value = false
  loadFailed.value = false
  forceDraftCreation = false
  saveRevision += 1
  savedRevision = saveRevision
  error.value = ''
  editor.value?.commands.clearContent()
}

function readError(cause: unknown, fallback: string) {
  if (cause && typeof cause === 'object' && 'data' in cause) {
    const data = (cause as { data?: { statusMessage?: string } }).data
    if (data?.statusMessage) return data.statusMessage
  }
  return fallback
}

function formatSize(bytes: number) {
  return formatEmailSize(bytes)
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('pointerdown', onDocumentPointerdown, true)
  if (contactSuggestionTimer) clearTimeout(contactSuggestionTimer)
  cancelRecipientLongPress()
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<style>
.compose-stage { position: fixed; z-index: 40; inset: 0; overflow: hidden; color: var(--ink); }
.compose-tooltip-content { z-index: 100 !important; }
.compose-stage.is-full { background: transparent; pointer-events: none; }
.compose-window.is-full { pointer-events: auto; }
.compose-stage.is-popup, .compose-stage.is-minimized { background: transparent; pointer-events: none; }
.compose-window { position: absolute; inset: 76px 0 0; display: grid; width: 100%; height: auto; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; border: 0; border-radius: 0; background: var(--paper); box-shadow: none; color: var(--ink); }
.compose-window.is-popup { inset: auto 24px 24px auto; width: min(680px, calc(100vw - 48px)); height: min(780px, calc(100dvh - 120px)); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 80px rgb(24 20 35 / 25%); pointer-events: auto; }
.compose-window.is-popup .compose-header { min-height: 70px; padding: 12px 20px; }
.compose-window.is-popup .compose-header h2 { font-size: 18px; }
.compose-window.is-popup .compose-body, .compose-window.is-popup .compose-footer { width: calc(100% - 48px); }
.compose-header { position: relative; z-index: 2; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 86px; padding: 16px clamp(18px, 4vw, 64px); background: var(--paper); }
.compose-header h2 { grid-column: 2; margin: 0; font-size: 22px; font-weight: 680; text-align: center; }
.compose-window-actions { display: flex; gap: 4px; }
.compose-window-actions { grid-column: 3; justify-self: end; }
.compose-drafts-count { min-height: 34px; flex: 0 0 auto; margin-right: 4px; padding: 0 11px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 999px; background: transparent; color: var(--accent); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.compose-drafts-count:hover { background: var(--accent-wash); }
.compose-drafts-count:disabled { opacity: .55; cursor: wait; }
.compose-icon-button { display: grid; width: 36px; height: 36px; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
.compose-icon-button svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.compose-icon-button:hover { background: var(--paper); color: var(--ink); }
.compose-icon-button:focus-visible, .compose-minimized-main:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.compose-stage.is-popup .compose-icon-button:hover { background: var(--surface-soft); }
.compose-minimized { position: absolute; right: 18px; bottom: max(8px, env(safe-area-inset-bottom)); display: flex; width: min(220px, calc(100vw - 32px)); min-height: 48px; align-items: center; gap: 4px; padding: 4px 6px 4px 12px; border: 1px solid var(--line); border-radius: 10px 10px 0 0; background: var(--paper); box-shadow: 0 12px 36px rgb(24 20 35 / 18%); pointer-events: auto; animation: compose-minimized-enter 220ms cubic-bezier(.2,.75,.25,1) both; }
.compose-minimized-main { display: flex; min-width: 0; flex: 1; align-items: center; padding: 2px 0; border: 0; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.compose-minimized-copy { display: grid; min-width: 0; gap: 3px; }
.compose-minimized-copy strong, .compose-minimized-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compose-minimized-copy strong { font-size: 12px; }
.compose-minimized-copy small { color: var(--quiet); font-size: 10px; }
.compose-minimized-close { width: 30px; height: 30px; flex: 0 0 30px; }
.compose-body { display: block; width: min(76vw, 1240px); min-height: 0; margin: 0 auto; overflow-y: auto; scrollbar-gutter: stable; }
.compose-fields { display: grid; padding: 4px 0 0; }
.compose-field { display: grid; min-height: 43px; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 8px; border-bottom: 1px solid var(--line); color: var(--quiet); font-size: 13px; }
.compose-field:has(.compose-recipient-control) { grid-template-columns: 54px minmax(0, 1fr) auto; }
.compose-field input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; }
.compose-recipient-control { display: flex; min-width: 0; min-height: 42px; flex-wrap: wrap; align-items: center; gap: 5px; padding: 4px 0; cursor: text; }
.compose-recipient-control input { flex: 1 0 150px; min-height: 28px; }
.compose-recipient-badge { display: inline-flex; max-width: 100%; align-items: center; gap: 4px; padding: 3px 5px 3px 9px; border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line)); border-radius: 999px; background: var(--accent-wash); color: var(--ink); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
.compose-recipient-badge-remove { display: grid; width: 18px; height: 18px; flex: 0 0 18px; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--quiet); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
.compose-recipient-badge-remove:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
.compose-field input::placeholder { color: var(--quiet); }
.compose-field-error { margin: 5px 0 0; color: #aa3d37; font-size: 11px; }
.compose-editor-shell { position: relative; display: block; min-height: 230px; }
.compose-toolbar-separator { width: 1px; height: 20px; margin: 0 3px; background: var(--line); }
.compose-editor { min-height: 210px; padding: 30px 0 36px; color: var(--ink); font-size: 15px; line-height: 1.75; }
.compose-editor .tiptap { min-height: 210px; outline: 0; }
.compose-editor .tiptap p { margin: 0 0 12px; }
.compose-editor .tiptap p.is-editor-empty:first-child::before { float: left; height: 0; color: var(--quiet); content: attr(data-placeholder); pointer-events: none; }
.compose-editor .tiptap ul, .compose-editor .tiptap ol { margin: 0 0 12px; padding-left: 28px; }
.compose-editor .tiptap ul { list-style: disc outside; }
.compose-editor .tiptap ol { list-style: decimal outside; }
.compose-editor .tiptap li::marker { color: var(--ink); }
.compose-editor .tiptap blockquote { margin: 10px 0; padding-left: 14px; border-left: 1px solid var(--line); color: var(--muted); }
.compose-editor .tiptap h1, .compose-editor .tiptap h2, .compose-editor .tiptap h3 { margin: 18px 0 10px; line-height: 1.3; }
.compose-editor .tiptap h1 { font-size: 1.75em; }
.compose-editor .tiptap h2 { font-size: 1.4em; }
.compose-editor .tiptap h3 { font-size: 1.15em; }
.compose-editor .tiptap img { display: block; max-width: 100%; max-height: 360px; margin: 10px 0; border-radius: 5px; object-fit: contain; }
.compose-editor .tiptap a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.compose-bubble-menu { display: flex; align-items: center; gap: 3px; padding: 5px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); box-shadow: 0 8px 26px rgb(24 20 35 / 18%); }
.compose-bubble-menu button { min-width: 32px; height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.compose-bubble-menu button:hover, .compose-bubble-menu button.active { background: var(--accent-wash); color: var(--accent); }
.compose-slash-menu { position: absolute; z-index: 5; width: min(300px, calc(100vw - 32px)); max-height: min(360px, 55vh); overflow: auto; scroll-behavior: smooth; padding: 7px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); box-shadow: 0 14px 38px rgb(24 20 35 / 18%); }
.compose-slash-heading { margin: 2px 7px 6px; color: var(--quiet); font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.compose-slash-menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.compose-slash-menu button:hover, .compose-slash-menu button.active { background: var(--accent-wash); }
.compose-slash-icon { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border: 1px solid var(--line); border-radius: 7px; color: var(--muted); font-size: 11px; font-weight: 650; }
.compose-slash-menu button > span:last-child { display: grid; gap: 2px; }
.compose-slash-menu strong { font-size: 12px; font-weight: 600; }
.compose-slash-menu small, .compose-slash-empty { color: var(--quiet); font-size: 10px; }
.compose-slash-empty { margin: 8px; }
.compose-attachments { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 7px; padding: 0 0 12px; }
.compose-size-meter { margin: 0; color: var(--quiet); font-size: 11px; line-height: 1.4; }
.compose-size-meter span { color: var(--quiet); }
.compose-size-meter.compose-size-over { color: #aa3d37; }
.compose-attachment { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 8px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-soft); }
.compose-attachment-icon { color: var(--accent); }
.compose-attachment-name { display: grid; min-width: 0; flex: 1; gap: 2px; }
.compose-attachment-name strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.compose-attachment-name small { color: var(--quiet); font-size: 10px; }
.compose-attachment button { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; }
.compose-attachment button:hover { background: var(--paper); }
.compose-status, .compose-error { margin: 0; padding: 6px 0; color: var(--muted); font-size: 12px; }
.compose-error { color: #aa3d37; }
.compose-footer { position: relative; display: flex; width: min(76vw, 1240px); flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 auto; padding: 14px 0 max(20px, env(safe-area-inset-bottom)); background: var(--paper); }
.compose-footer-status { display: flex; min-width: 0; flex: 1 1 300px; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 14px; margin-right: auto; }
.compose-save-status { min-width: 142px; color: var(--quiet); font-size: 11px; }
.compose-tool-button { min-height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.compose-icon-action { display: inline-grid; width: 36px; min-height: 36px; padding: 0; place-items: center; border-radius: 9px; }
.compose-icon-action svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.compose-icon-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.compose-tool-button:hover { border-color: var(--accent); color: var(--accent); }
.compose-tool-button:disabled { opacity: .5; cursor: not-allowed; }
.compose-send, .compose-secondary, .compose-discard { min-height: 36px; padding: 0 13px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
.compose-send { border-color: var(--accent); background: var(--accent); color: white; font-weight: 650; }
.compose-send { min-height: 46px; padding-inline: 21px; border-radius: 12px; font-size: 14px; font-weight: 700; box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 22%, transparent); transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease; }
.compose-send:hover:not(:disabled) { border-color: var(--accent-hover); background: var(--accent-hover); box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 28%, transparent); transform: translateY(-1px); }
:root[data-theme="dark"] .compose-send:not(:disabled) { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
:root[data-theme="dark"] .compose-send:not(:disabled):hover { border-color: var(--accent-hover); background: var(--accent-hover); }
.compose-send:disabled, .compose-secondary:disabled, .compose-discard:disabled { opacity: .55; cursor: not-allowed; }
.compose-discard { border-color: transparent; color: var(--muted); }
.compose-discard.compose-icon-action { padding: 0; border-color: var(--line); border-radius: 9px; }
.compose-discard:hover { border-color: color-mix(in srgb, #bd4940 30%, var(--line)); color: #aa3d37; }
.compose-recipient-toggles { display: flex; flex: 0 0 auto; gap: 8px; }
.compose-recipient-toggles button { padding: 4px 2px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer; }
.compose-recipient-toggles button:hover { color: var(--accent); }
.compose-field-close { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--quiet); cursor: pointer; }
.compose-field-close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.compose-field-close:hover { background: var(--surface-soft); color: var(--ink); }
.compose-field-close:disabled { opacity: .5; cursor: not-allowed; }
.compose-state { display: grid; min-height: 220px; align-content: center; justify-items: center; gap: 10px; padding: 24px; color: var(--muted); text-align: center; }
.compose-shell-enter-active, .compose-shell-leave-active { transition: opacity 180ms ease; }
.compose-shell-enter-active .compose-window, .compose-shell-leave-active .compose-window { transition: transform 180ms cubic-bezier(.2,.75,.25,1), opacity 180ms ease; }
.compose-shell-enter-from, .compose-shell-leave-to { opacity: 0; }
.compose-shell-enter-from .compose-window, .compose-shell-leave-to .compose-window { transform: translateY(10px); opacity: .96; }
@keyframes compose-minimized-enter { from { transform: translateY(8px); } to { transform: translateY(0); } }
@media (max-width: 640px) {
  .compose-window { inset: 66px 0 0; }
  .compose-window.is-popup { inset: auto 8px max(8px, env(safe-area-inset-bottom)) auto; width: calc(100vw - 16px); height: min(720px, calc(100dvh - 82px)); border-radius: 13px; }
  .compose-header { min-height: 56px; padding: 8px 10px; }
  .compose-header h2 { font-size: 18px; }
  .compose-drafts-count { padding: 0 8px; font-size: 10px; }
  .compose-body, .compose-footer { width: calc(100% - 32px); }
  .compose-editor { padding: 22px 0 28px; }
  .compose-minimized { right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); width: min(220px, calc(100vw - 16px)); }
  .compose-footer { gap: 7px; padding: 10px 0 max(14px, env(safe-area-inset-bottom)); }
  .compose-discard { margin-left: auto; }
  .compose-footer-status { flex-basis: 100%; }
  .compose-confirm-actions { flex-direction: column-reverse; }
}
@media (prefers-reduced-motion: reduce) {
  .compose-shell-enter-active, .compose-shell-leave-active, .compose-shell-enter-active .compose-window, .compose-shell-leave-active .compose-window { transition: none; }
  .compose-minimized { animation: none; }
  .compose-slash-menu { scroll-behavior: auto; }
}

/* A full-screen draft uses the same warm desk and open writing measure as the reader. */
.compose-window { background: var(--canvas); }
.compose-window.is-popup { background: var(--sheet); box-shadow: 0 18px 44px rgb(37 48 44 / 18%); }
.compose-header { min-height: 76px; border-bottom: 1px solid var(--line); background: var(--canvas); }
.compose-header h2 { font-size: 20px; font-weight: 620; letter-spacing: -0.03em; }
.compose-body, .compose-footer { width: min(76vw, 900px); }
.compose-footer { border-top: 1px solid var(--line); background: var(--canvas); }
.compose-drafts-count { border-radius: 999px; }
.compose-icon-button { border-radius: 50%; }
.compose-icon-button:hover { background: var(--accent-wash); color: var(--accent); }
.compose-minimized { border-radius: 14px 14px 0 0; background: var(--sheet); }
.compose-recipient-badge { border-radius: 999px; background: var(--accent-wash); }
.compose-attachment { border-radius: 11px; }
.compose-send { border-color: var(--accent); border-radius: 12px; background: var(--accent); }
.compose-send:disabled { border-color: var(--line); background: var(--accent-wash); color: var(--muted); opacity: 1; box-shadow: none; cursor: not-allowed; transform: none; }
:root[data-theme="dark"] .compose-send:not(:disabled) { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
:root[data-theme="dark"] .compose-send:not(:disabled):hover { border-color: var(--accent-hover); background: var(--accent-hover); }

@media (max-width: 640px) {
  .compose-body, .compose-footer { width: calc(100% - 36px); }
  .compose-header { min-height: 58px; }
  .compose-header h2 { font-size: 17px; }
}

/* The title is carried by the oversized subject field on the full writing page. */
.compose-subject-block { display: block; margin: 34px 0 21px; }
.compose-subject-input { display: block; width: 100%; min-height: 1.2em; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: clamp(30px, 4vw, 44px); font-weight: 720; letter-spacing: -0.045em; line-height: 1.2; }
.compose-subject-input::placeholder { color: color-mix(in srgb, var(--ink) 68%, var(--quiet)); opacity: 1; }
.compose-subject-input:focus-visible { outline: 0; box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--accent) 72%, transparent); }
.compose-fields { padding: 0; }
.compose-recipient-line { display: flex; min-height: 48px; align-items: center; gap: 15px; border-bottom: 1px solid color-mix(in srgb, var(--line) 58%, transparent); }
.compose-recipient-line-label { flex: 0 0 auto; color: var(--quiet); font-size: 13px; }
.compose-recipient-control { position: relative; min-height: 42px; flex: 1; gap: 6px; padding: 4px 0; }
.compose-recipient-control input { min-width: 0; flex: 1 1 190px; min-height: 30px; border: 0; outline: 0; appearance: none; background: transparent; color: var(--ink); font: inherit; font-size: 13px; }
.compose-recipient-control input::placeholder { color: var(--quiet); opacity: .9; }
.compose-recipient-badge { display: inline-flex; max-width: min(100%, 280px); align-items: center; gap: 2px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line)); border-radius: 999px; background: color-mix(in srgb, var(--accent-wash) 72%, var(--sheet)); color: var(--ink); font-size: 12px; line-height: 1.35; }
.compose-recipient-badge-main { display: inline-flex; min-width: 0; align-items: center; gap: 6px; padding: 4px 3px 4px 10px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.compose-recipient-badge-main:focus-visible, .compose-recipient-badge-remove:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.compose-recipient-badge-remove { display: grid; width: 22px; height: 24px; flex: 0 0 22px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--quiet); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
.compose-recipient-badge-remove:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
.compose-recipient-badge-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.compose-recipient-badge.is-cc { border-color: color-mix(in srgb, var(--muted) 24%, var(--line)); background: color-mix(in srgb, var(--surface-soft) 80%, var(--sheet)); color: var(--muted); }
.compose-recipient-badge.is-bcc { border-color: color-mix(in srgb, var(--quiet) 34%, var(--line)); background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--surface-soft) 86%, var(--sheet)) 0 4px, color-mix(in srgb, var(--line) 22%, var(--sheet)) 4px 5px); color: var(--muted); }
.compose-recipient-badge-main:hover, .compose-recipient-badge-remove:hover { color: var(--accent); }
.compose-recipient-role { flex: 0 0 auto; padding: 1px 4px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--quiet); font-size: 9px; font-weight: 650; }
.compose-recipient-badge.is-bcc .compose-recipient-role { background: color-mix(in srgb, var(--ink) 8%, transparent); }
.compose-recipient-suggestions, .compose-recipient-menu { position: fixed; z-index: 140; display: grid; min-width: 220px; max-width: min(320px, calc(100vw - 24px)); overflow: hidden; padding: 5px; border: 1px solid var(--line); border-radius: 11px; background: var(--sheet); box-shadow: 0 12px 34px rgb(25 20 36 / 20%); }
.compose-recipient-suggestions { position: absolute; z-index: 6; top: calc(100% + 2px); left: -8px; width: min(360px, calc(100vw - 36px)); }
.compose-recipient-suggestions button, .compose-recipient-menu button { display: flex; min-height: 38px; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.compose-recipient-suggestions button span { overflow: hidden; color: var(--quiet); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.compose-recipient-suggestions button.active, .compose-recipient-suggestions button:hover, .compose-recipient-menu button.active, .compose-recipient-menu button:hover { background: var(--accent-wash); color: var(--accent); }
.compose-recipient-menu { width: 176px; min-width: 176px; }
.compose-recipient-menu button { justify-content: flex-start; }
.compose-editor .tiptap em, .compose-editor .tiptap i { font-style: italic; }
.compose-editor .tiptap strong em, .compose-editor .tiptap em strong { font-weight: 700; font-style: italic; }
@media (max-width: 640px) {
  .compose-subject-block { margin: 22px 0 15px; }
  .compose-subject-input { font-size: clamp(27px, 8vw, 34px); }
  .compose-recipient-line { gap: 10px; }
  .compose-recipient-control input { flex-basis: 120px; }
  .compose-recipient-badge { max-width: min(100%, 205px); }
}
</style>
