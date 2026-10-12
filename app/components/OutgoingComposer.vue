<template>
  <Teleport to="body">
    <Transition name="compose-dialog">
      <div v-if="open" class="compose-backdrop" @click.self="closeComposer">
        <section class="compose-window" role="dialog" aria-modal="true" aria-labelledby="compose-title">
          <header class="compose-header">
            <h2 id="compose-title">Nouveau message</h2>
            <div class="compose-window-actions">
              <button class="compose-icon-button" type="button" aria-label="Réduire le compositeur" title="Réduire" @click="closeComposer">−</button>
              <button class="compose-icon-button" type="button" aria-label="Fermer le compositeur" title="Fermer" :disabled="sending" @click="closeComposer">×</button>
            </div>
          </header>

          <div v-if="loading" class="compose-state">Chargement du brouillon…</div>
          <div v-else-if="error && !draftId" class="compose-state compose-error" role="alert">
            <p>{{ error }}</p>
            <button class="compose-secondary" type="button" @click="loadDraft">Réessayer</button>
          </div>
          <template v-else>
            <div class="compose-fields">
              <label class="compose-field">
                <span>À</span>
                <input v-model="to" type="text" inputmode="email" autocomplete="email" placeholder="nom@exemple.fr, autre@exemple.fr" :disabled="sending || draftStatus === 'sending'" @keydown.enter.prevent="saveDraft">
              </label>
              <label class="compose-field">
                <span>Objet</span>
                <input v-model="subject" type="text" placeholder="Objet du message" :disabled="sending || draftStatus === 'sending'">
              </label>
            </div>
            <p v-if="recipientError" class="compose-field-error" role="alert">{{ recipientError }}</p>

            <div class="compose-editor-shell">
              <div class="compose-toolbar" role="toolbar" aria-label="Mise en forme">
                <button type="button" :class="{ active: editor?.isActive('bold') }" aria-label="Gras" title="Gras" :disabled="!editor || sending || draftStatus === 'sending'" @click="editor?.chain().focus().toggleBold().run()"><strong>G</strong></button>
                <button type="button" :class="{ active: editor?.isActive('italic') }" aria-label="Italique" title="Italique" :disabled="!editor || sending || draftStatus === 'sending'" @click="editor?.chain().focus().toggleItalic().run()"><em>I</em></button>
                <button type="button" :class="{ active: editor?.isActive('strike') }" aria-label="Barré" title="Barré" :disabled="!editor || sending || draftStatus === 'sending'" @click="editor?.chain().focus().toggleStrike().run()"><s>S</s></button>
                <span class="compose-toolbar-separator" aria-hidden="true" />
                <button type="button" aria-label="Liste à puces" title="Liste à puces" :disabled="!editor || sending || draftStatus === 'sending'" @click="editor?.chain().focus().toggleBulletList().run()">• Liste</button>
                <button type="button" aria-label="Ajouter un lien" title="Ajouter un lien" :disabled="!editor || sending || draftStatus === 'sending'" @click="addLink">Lien</button>
                <button type="button" aria-label="Insérer une image" title="Insérer une image" :disabled="!editor || sending || draftStatus === 'sending'" @click="chooseFiles('inline')">Image</button>
                <button type="button" aria-label="Joindre des fichiers" title="Joindre des fichiers" :disabled="sending || draftStatus === 'sending'" @click="chooseFiles('attachment')">Joindre</button>
              </div>
              <EditorContent v-if="editor" class="compose-editor" :editor="editor" />
            </div>

            <input ref="attachmentInput" class="sr-only" type="file" multiple @change="onFilesSelected">

            <div v-if="attachments.length" class="compose-attachments" aria-label="Pièces jointes">
              <div v-for="attachment in attachments" :key="attachment.id" class="compose-attachment">
                <span class="compose-attachment-icon" aria-hidden="true">{{ attachment.disposition === 'inline' ? '▧' : '↗' }}</span>
                <span class="compose-attachment-name"><strong>{{ attachment.filename }}</strong><small>{{ formatSize(attachment.sizeBytes) }}{{ attachment.disposition === 'inline' ? ' · image intégrée' : '' }}</small></span>
                <button type="button" :aria-label="`Retirer ${attachment.filename}`" :disabled="sending || draftStatus === 'sending'" @click="removeAttachment(attachment)">×</button>
              </div>
            </div>

            <p class="compose-size-meter" :class="{ 'compose-size-over': estimatedEmailBytes > OUTBOUND_MESSAGE_BUDGET_BYTES }" role="status">
              Taille estimée : {{ formatSize(estimatedEmailBytes) }} / {{ formatSize(OUTBOUND_MESSAGE_BUDGET_BYTES) }}
              <span v-if="estimatedEmailBytes <= OUTBOUND_MESSAGE_BUDGET_BYTES"> (limite de 5 Mio, marge incluse)</span>
              <span v-else> · Réduis le corps ou retire une pièce jointe.</span>
            </p>

            <p v-if="uploading" class="compose-status" role="status">Ajout des fichiers…</p>
            <p v-else-if="error" class="compose-error" role="alert">{{ error }}</p>
            <p v-else-if="draftStatus === 'sending'" class="compose-status" role="status">Un envoi a déjà commencé. Vérifie la boîte destinataire avant toute nouvelle tentative.</p>

            <footer class="compose-footer">
              <span class="compose-save-status" role="status">{{ saving ? 'Enregistrement…' : saved ? 'Brouillon enregistré' : 'Brouillon en cours' }}</span>
              <button class="compose-discard" type="button" :disabled="sending || draftStatus === 'sending'" @click="discardDraft">Supprimer le brouillon</button>
              <button class="compose-send" type="button" :disabled="!canSend" @click="requestSend">{{ sending ? 'Envoi…' : 'Envoyer' }}</button>
            </footer>
          </template>

          <div v-if="confirmSend" class="compose-confirm-backdrop">
            <section class="compose-confirm" role="alertdialog" aria-labelledby="compose-confirm-title" aria-describedby="compose-confirm-description">
              <p class="compose-confirm-kicker">Vérification avant envoi</p>
              <h3 id="compose-confirm-title">Envoyer ce message ?</h3>
              <p id="compose-confirm-description">Il sera envoyé depuis <strong>courrier-test@verbatims.cc</strong> à <strong>{{ to }}</strong>.</p>
              <div class="compose-confirm-actions">
                <button class="compose-secondary" type="button" :disabled="sending" @click="confirmSend = false">Continuer à écrire</button>
                <button class="compose-send" type="button" :disabled="sending" @click="sendDraft">{{ sending ? 'Envoi…' : 'Confirmer l’envoi' }}</button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { estimateOutgoingEmailBytes, formatEmailSize, OUTBOUND_MESSAGE_BUDGET_BYTES } from '#shared/utils/outgoing-email-size'

type ComposeAttachment = { id: string, filename: string, mimeType: string, sizeBytes: number, contentId: string, disposition: 'attachment' | 'inline' }
type ComposeDraft = { id: string, to: string, subject: string, content: Record<string, unknown>, status: 'draft' | 'sending', attachments: ComposeAttachment[] }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], sent: [messageId: string] }>()

const draftId = ref('')
const to = ref('')
const subject = ref('')
const attachments = ref<ComposeAttachment[]>([])
const draftStatus = ref<'draft' | 'sending'>('draft')
const loading = ref(false)
const editorRevision = ref(0)
const saving = ref(false)
const saved = ref(false)
const uploading = ref(false)
const sending = ref(false)
const confirmSend = ref(false)
const error = ref('')
const attachmentInput = ref<HTMLInputElement | null>(null)
const nextDisposition = ref<'attachment' | 'inline'>('attachment')
let saveTimer: ReturnType<typeof setTimeout> | undefined
let saveRevision = 0
let hydrating = false

const editor = useEditor({
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ['mailto'] }),
    Image.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder: 'Écrire votre message…' }),
  ],
  onUpdate: () => {
    editorRevision.value += 1
    scheduleSave()
  },
})

const recipientList = computed(() => to.value.split(/[;,\n]+/).map(address => address.trim()).filter(Boolean))
const estimatedEmailBytes = computed(() => {
  editorRevision.value
  return estimateOutgoingEmailBytes({
    to: recipientList.value,
    subject: subject.value,
    text: editor.value?.getText() || '',
    html: editor.value?.getHTML() || '',
    attachments: attachments.value,
  })
})
const recipientError = computed(() => recipientList.value.length > 50 || recipientList.value.some(address => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))
  ? 'Vérifie les adresses et sépare-les par une virgule.'
  : '')
const canSend = computed(() => Boolean(draftId.value && recipientList.value.length && !recipientError.value && estimatedEmailBytes.value <= OUTBOUND_MESSAGE_BUDGET_BYTES && !loading.value && !saving.value && !uploading.value && !sending.value && draftStatus.value === 'draft' && (editor.value?.getText().trim() || attachments.value.length)))

watch(() => props.open, (open) => {
  if (open) {
    window.addEventListener('keydown', onWindowKeydown)
    void loadDraft()
  }
  else {
    window.removeEventListener('keydown', onWindowKeydown)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
  }
})

watch([to, subject], () => scheduleSave())

async function loadDraft() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  hydrating = true
  try {
    let draft = await $fetch<ComposeDraft | null>('/api/outgoing-drafts')
    if (!draft) draft = await $fetch<ComposeDraft>('/api/outgoing-drafts', { method: 'POST' })
    draftId.value = draft.id
    to.value = draft.to
    subject.value = draft.subject
    attachments.value = draft.attachments || []
    draftStatus.value = draft.status
    editor.value?.commands.setContent(draft.content || { type: 'doc', content: [{ type: 'paragraph' }] })
    editor.value?.setEditable(draft.status === 'draft')
    saved.value = Boolean(draft.updatedAt)
  } catch (cause) {
    error.value = readError(cause, 'Le brouillon n’a pas pu être chargé.')
  } finally {
    hydrating = false
    loading.value = false
  }
}

function scheduleSave() {
  if (hydrating || !draftId.value || draftStatus.value !== 'draft' || !props.open) return
  saveRevision += 1
  saved.value = false
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void saveDraft() }, 700)
}

async function saveDraft() {
  if (!draftId.value || draftStatus.value !== 'draft' || saving.value || !editor.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  const revision = saveRevision
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}`, {
      method: 'PATCH',
      body: { to: to.value, subject: subject.value, content: editor.value.getJSON() },
    })
    if (revision === saveRevision) saved.value = true
  } catch (cause) {
    error.value = readError(cause, 'Le brouillon n’a pas pu être enregistré.')
  } finally {
    saving.value = false
    if (revision !== saveRevision && draftStatus.value === 'draft') void saveDraft()
  }
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
  if (!files.length || !draftId.value) return
  uploading.value = true
  error.value = ''
  try {
    await saveDraft()
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
    error.value = readError(cause, 'Un fichier n’a pas pu être ajouté.')
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
    error.value = readError(cause, 'Cette pièce jointe n’a pas pu être retirée.')
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
  if (event.key !== 'Escape' || !props.open) return
  event.preventDefault()
  event.stopPropagation()
  if (confirmSend.value) confirmSend.value = false
  else void closeComposer()
}

async function requestSend() {
  await saveDraft()
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
    error.value = readError(cause, 'Le message n’a pas pu être envoyé. Le brouillon est conservé.')
    if (error.value.includes('état est incertain') || error.value.includes('accepté par Cloudflare')) {
      draftStatus.value = 'sending'
      editor.value?.setEditable(false)
    }
  } finally {
    sending.value = false
  }
}

async function discardDraft() {
  if (!draftId.value || !window.confirm('Supprimer ce brouillon et ses pièces jointes ?')) return
  try {
    await $fetch(`/api/outgoing-drafts/${encodeURIComponent(draftId.value)}`, { method: 'DELETE' })
    emit('update:open', false)
    reset()
  } catch (cause) {
    error.value = readError(cause, 'Le brouillon n’a pas pu être supprimé.')
  }
}

async function closeComposer() {
  if (sending.value) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
    await saveDraft()
  }
  emit('update:open', false)
}

function reset() {
  draftId.value = ''
  to.value = ''
  subject.value = ''
  attachments.value = []
  draftStatus.value = 'draft'
  saved.value = false
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
  window.removeEventListener('keydown', onWindowKeydown)
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<style>
.compose-backdrop { position: fixed; z-index: 80; inset: 0; display: grid; align-items: end; justify-items: end; padding: 24px; background: rgb(24 20 35 / 20%); }
.compose-window { position: relative; display: grid; width: min(100%, 720px); max-height: min(780px, calc(100dvh - 48px)); grid-template-rows: auto auto minmax(180px, 1fr) auto auto; overflow: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); box-shadow: 0 24px 80px rgb(24 20 35 / 25%); color: var(--ink); }
.compose-header { position: sticky; z-index: 2; top: 0; display: flex; align-items: center; justify-content: space-between; min-height: 48px; padding: 9px 14px 9px 18px; background: var(--surface-soft); }
.compose-header h2 { margin: 0; font-size: 14px; font-weight: 650; }
.compose-window-actions { display: flex; gap: 4px; }
.compose-icon-button { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font-size: 22px; cursor: pointer; }
.compose-icon-button:hover { background: var(--paper); color: var(--ink); }
.compose-fields { display: grid; padding: 4px 18px 0; }
.compose-field { display: grid; min-height: 43px; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 8px; border-bottom: 1px solid var(--line); color: var(--quiet); font-size: 13px; }
.compose-field input { min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; }
.compose-field input::placeholder { color: var(--quiet); }
.compose-field-error { margin: 5px 18px 0; color: #aa3d37; font-size: 11px; }
.compose-editor-shell { display: grid; min-height: 230px; grid-template-rows: auto minmax(170px, 1fr); padding: 0 18px; }
.compose-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.compose-toolbar button { min-width: 31px; min-height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.compose-toolbar button:hover, .compose-toolbar button.active { background: var(--violet-wash); color: var(--violet); }
.compose-toolbar button:disabled { opacity: .45; cursor: not-allowed; }
.compose-toolbar-separator { width: 1px; height: 20px; margin: 0 3px; background: var(--line); }
.compose-editor { min-height: 170px; padding: 16px 0; color: var(--ink); font-size: 14px; line-height: 1.65; }
.compose-editor .tiptap { min-height: 170px; outline: 0; }
.compose-editor .tiptap p { margin: 0 0 12px; }
.compose-editor .tiptap p.is-editor-empty:first-child::before { float: left; height: 0; color: var(--quiet); content: attr(data-placeholder); pointer-events: none; }
.compose-editor .tiptap ul, .compose-editor .tiptap ol { padding-left: 24px; }
.compose-editor .tiptap blockquote { margin: 10px 0; padding-left: 14px; border-left: 3px solid var(--line); color: var(--muted); }
.compose-editor .tiptap img { display: block; max-width: 100%; max-height: 360px; margin: 10px 0; border-radius: 5px; object-fit: contain; }
.compose-editor .tiptap a { color: var(--violet); text-decoration: underline; text-underline-offset: 2px; }
.compose-attachments { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 7px; padding: 0 18px 12px; }
.compose-size-meter { margin: 0; padding: 0 18px 12px; color: var(--quiet); font-size: 11px; }
.compose-size-meter span { color: var(--quiet); }
.compose-size-meter.compose-size-over { color: #aa3d37; }
.compose-attachment { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 8px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-soft); }
.compose-attachment-icon { color: var(--violet); }
.compose-attachment-name { display: grid; min-width: 0; flex: 1; gap: 2px; }
.compose-attachment-name strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.compose-attachment-name small { color: var(--quiet); font-size: 10px; }
.compose-attachment button { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; }
.compose-attachment button:hover { background: var(--paper); }
.compose-status, .compose-error { margin: 0; padding: 6px 18px; color: var(--muted); font-size: 12px; }
.compose-error { color: #aa3d37; }
.compose-footer { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--paper); }
.compose-save-status { margin-right: auto; color: var(--quiet); font-size: 11px; }
.compose-send, .compose-secondary, .compose-discard { min-height: 36px; padding: 0 13px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer; }
.compose-send { border-color: var(--violet); background: var(--violet); color: white; font-weight: 650; }
.compose-send:disabled, .compose-secondary:disabled, .compose-discard:disabled { opacity: .55; cursor: not-allowed; }
.compose-discard { border-color: transparent; color: var(--muted); }
.compose-discard:hover { border-color: color-mix(in srgb, #bd4940 30%, var(--line)); color: #aa3d37; }
.compose-confirm-backdrop { position: absolute; z-index: 3; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(25 21 36 / 42%); }
.compose-confirm { width: min(100%, 420px); padding: 22px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); box-shadow: 0 20px 55px rgb(24 20 35 / 24%); }
.compose-confirm-kicker { margin: 0 0 7px; color: var(--violet); font-size: 11px; font-weight: 650; }
.compose-confirm h3 { margin: 0; font-size: 20px; }
.compose-confirm > p:last-of-type { color: var(--muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.compose-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.compose-state { display: grid; min-height: 220px; align-content: center; justify-items: center; gap: 10px; padding: 24px; color: var(--muted); text-align: center; }
.compose-dialog-enter-active, .compose-dialog-leave-active { transition: opacity 180ms ease; }
.compose-dialog-enter-active .compose-window, .compose-dialog-leave-active .compose-window { transition: transform 180ms cubic-bezier(.2,.75,.25,1); }
.compose-dialog-enter-from, .compose-dialog-leave-to { opacity: 0; }
.compose-dialog-enter-from .compose-window, .compose-dialog-leave-to .compose-window { transform: translateY(14px) scale(.985); }
@media (max-width: 640px) {
  .compose-backdrop { align-items: stretch; justify-items: stretch; padding: 8px; }
  .compose-window { width: 100%; max-height: calc(100dvh - 16px); border-radius: 13px; }
  .compose-footer { gap: 7px; padding: 10px; }
  .compose-discard { margin-left: auto; }
  .compose-save-status { width: 100%; }
  .compose-confirm-actions { flex-direction: column-reverse; }
}
@media (prefers-reduced-motion: reduce) {
  .compose-dialog-enter-active, .compose-dialog-leave-active, .compose-dialog-enter-active .compose-window, .compose-dialog-leave-active .compose-window { transition: none; }
}
</style>
