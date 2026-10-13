<template>
  <main class="mail-page drafts-page">
    <section class="drafts-view" aria-labelledby="drafts-title">
      <header class="drafts-heading">
        <NuxtLink class="drafts-back" to="/mail/inbox">← Boîte de réception</NuxtLink>
        <h1 id="drafts-title">Brouillons</h1>
        <p>{{ drafts.length }} brouillon{{ drafts.length === 1 ? '' : 's' }}</p>
      </header>

      <div v-if="error" class="drafts-error" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="loadDrafts">Réessayer</button>
      </div>
      <div v-else-if="loading" class="drafts-state" role="status">Chargement des brouillons…</div>
      <div v-else-if="!drafts.length" class="drafts-empty">
        <h2>Aucun brouillon</h2>
        <p>Les messages que tu commenceras à écrire apparaîtront ici.</p>
        <button class="drafts-primary" type="button" @click="startNewDraft">Écrire un message</button>
      </div>
      <ul v-else class="drafts-list" aria-label="Liste des brouillons">
        <li v-for="draft in drafts" :key="draft.id" class="draft-row">
          <button class="draft-open" type="button" @click="openDraft(draft.id)">
            <span class="draft-avatar" aria-hidden="true">{{ avatarLabel(draft.to) }}</span>
            <span class="draft-copy">
              <strong>{{ draft.subject || 'Sans objet' }}</strong>
              <span class="draft-meta">{{ recipientSummary(draft.to) }}<template v-if="draft.cc || draft.bcc"> · Cc/Cci</template><template v-if="draft.attachmentCount"> · {{ draft.attachmentCount }} pièce{{ draft.attachmentCount === 1 ? '' : 's' }} jointe{{ draft.attachmentCount === 1 ? '' : 's' }}</template></span>
              <span v-if="draft.preview" class="draft-preview">{{ draft.preview }}</span>
            </span>
            <time class="draft-date" :datetime="draft.updatedAt">{{ formatDate(draft.updatedAt) }}</time>
          </button>
          <NTooltip content="Supprimer le brouillon">
            <button class="draft-delete" type="button" :aria-label="`Supprimer le brouillon ${draft.subject || 'sans objet'}`" :disabled="deletingId === draft.id" @click="askDelete(draft)">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13m-11.5 0 .7 11h8.6l.7-11M7.5 5.5V3.8h5v1.7m-3.5 3v5m2-5v5" /></svg>
            </button>
          </NTooltip>
        </li>
      </ul>
    </section>

    <OutgoingComposer
      v-if="composeOpen"
      :open="composeOpen"
      :draft-id="selectedDraftId"
      @update:open="onComposerOpenChange"
      @show-drafts="onShowDrafts"
      @sent="loadDrafts"
    />

    <NDialog
      :open="Boolean(draftToDelete)"
      title="Supprimer ce brouillon ?"
      description="Le brouillon et ses pièces jointes seront supprimés définitivement."
      :show-close="false"
      :_dialog-content="{ class: 'classification-dialog' }"
      @update:open="(open: boolean) => { if (!open && !deletingId) draftToDelete = null }"
    >
      <template #content>
        <header class="dialog-header">
          <p class="dialog-kicker">Suppression définitive</p>
          <NDialogTitle class="dialog-title">Supprimer ce brouillon ?</NDialogTitle>
          <NDialogDescription class="screener-confirm-copy">« {{ draftToDelete?.subject || 'Sans objet' }} » et ses pièces jointes seront supprimés définitivement.</NDialogDescription>
        </header>
        <footer class="dialog-actions">
          <NDialogClose as-child><button class="dialog-cancel" type="button" :disabled="Boolean(deletingId)">Annuler</button></NDialogClose>
          <button class="dialog-danger" type="button" :disabled="Boolean(deletingId)" @click="deleteDraft">{{ deletingId ? 'Suppression…' : 'Supprimer le brouillon' }}</button>
        </footer>
      </template>
    </NDialog>
  </main>
</template>

<script setup lang="ts">
type DraftSummary = {
  id: string
  to: string
  cc: string
  bcc: string
  subject: string
  preview: string
  updatedAt: string
  attachmentCount: number
}

const drafts = ref<DraftSummary[]>([])
const loading = ref(true)
const error = ref('')
const composeOpen = ref(false)
const selectedDraftId = ref<string | null>(null)
const draftToDelete = ref<DraftSummary | null>(null)
const deletingId = ref('')

async function loadDrafts() {
  loading.value = true
  error.value = ''
  try {
    drafts.value = await $fetch<DraftSummary[]>('/api/outgoing-drafts')
  } catch (cause) {
    error.value = cause && typeof cause === 'object' && 'data' in cause && (cause as { data?: { statusMessage?: string } }).data?.statusMessage
      ? (cause as { data: { statusMessage: string } }).data.statusMessage
      : 'Les brouillons n’ont pas pu être chargés.'
  } finally {
    loading.value = false
  }
}

function openDraft(id: string) {
  selectedDraftId.value = id
  composeOpen.value = true
}

function startNewDraft() {
  selectedDraftId.value = null
  composeOpen.value = true
}

function onComposerOpenChange(open: boolean) {
  composeOpen.value = open
  if (!open) {
    selectedDraftId.value = null
    void loadDrafts()
  }
}

function onShowDrafts() {
  composeOpen.value = false
  selectedDraftId.value = null
  void loadDrafts()
}

function askDelete(draft: DraftSummary) {
  draftToDelete.value = draft
}

async function deleteDraft() {
  const draft = draftToDelete.value
  if (!draft || deletingId.value) return
  deletingId.value = draft.id
  error.value = ''
  try {
    await $fetch(`/api/outgoing-drafts/${encodeURIComponent(draft.id)}`, { method: 'DELETE' })
    drafts.value = drafts.value.filter(item => item.id !== draft.id)
    draftToDelete.value = null
  } catch (cause) {
    error.value = cause && typeof cause === 'object' && 'data' in cause && (cause as { data?: { statusMessage?: string } }).data?.statusMessage
      ? (cause as { data: { statusMessage: string } }).data.statusMessage
      : 'Le brouillon n’a pas pu être supprimé.'
    draftToDelete.value = null
  } finally {
    deletingId.value = ''
  }
}

function recipientSummary(addresses: string) {
  return addresses.trim() || 'Aucun destinataire'
}

function avatarLabel(addresses: string) {
  const first = addresses.trim().split(/[;,\s]+/)[0]
  return first ? first.slice(0, 1).toLocaleUpperCase('fr') : '•'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

onMounted(() => void loadDrafts())
</script>

<style scoped>
.drafts-page { padding-top: 30px; }
.drafts-view { width: min(100%, 1290px); min-height: 360px; margin: 0 auto; padding: 26px clamp(20px, 4vw, 56px) 38px; border: 1px solid var(--line); border-radius: 20px; background: var(--paper); }
.drafts-heading { position: relative; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; margin: 18px 0 28px; }
.drafts-heading::before, .drafts-heading::after { height: 1px; background: var(--line); content: ''; }
.drafts-heading h1 { margin: 0 10px; font-size: clamp(34px, 4vw, 52px); font-weight: 730; letter-spacing: -2px; }
.drafts-heading p { position: absolute; top: calc(100% + 6px); left: 50%; margin: 0; color: var(--quiet); font-size: 12px; transform: translateX(-50%); }
.drafts-back { position: absolute; top: -32px; left: 0; color: var(--muted); font-size: 12px; text-decoration: none; }
.drafts-back:hover { color: var(--violet); }
.drafts-list { display: grid; margin: 0; padding: 0; list-style: none; }
.draft-row { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 12px 6px; border-bottom: 1px solid var(--line); }
.draft-row:last-child { border-bottom: 0; }
.draft-open { display: flex; min-width: 0; flex: 1; align-items: center; gap: 12px; padding: 4px; border: 0; border-radius: 10px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.draft-open:hover { background: var(--surface-soft); }
.draft-open:focus-visible, .draft-delete:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
.draft-avatar { display: grid; width: 42px; height: 42px; flex: 0 0 42px; place-items: center; border-radius: 50%; background: var(--violet-wash); color: var(--violet); font-weight: 650; }
.draft-copy { display: grid; min-width: 0; flex: 1; gap: 3px; }
.draft-copy strong, .draft-meta, .draft-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.draft-copy strong { font-size: 14px; font-weight: 650; }
.draft-meta, .draft-preview, .draft-date { color: var(--quiet); font-size: 12px; }
.draft-preview { color: var(--muted); }
.draft-date { flex: 0 0 auto; white-space: nowrap; }
.draft-delete { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 1px solid color-mix(in srgb, var(--violet) 48%, var(--line)); border-radius: 50%; background: transparent; color: var(--violet); cursor: pointer; }
.draft-delete:hover { background: var(--violet-wash); }
.draft-delete:disabled { opacity: .55; cursor: wait; }
.draft-delete svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
.drafts-state, .drafts-empty, .drafts-error { display: grid; min-height: 220px; align-content: center; justify-items: center; gap: 8px; color: var(--muted); text-align: center; }
.drafts-empty h2, .drafts-empty p, .drafts-error p { margin: 0; }
.drafts-empty h2 { color: var(--ink); font-size: 20px; }
.drafts-primary, .drafts-error button { margin-top: 8px; padding: 10px 15px; border: 1px solid var(--violet); border-radius: 9px; background: var(--violet); color: white; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.drafts-error { color: #aa3d37; }
@media (max-width: 640px) {
  .drafts-page { padding: 18px 12px 30px; }
  .drafts-view { padding: 22px 14px; border-radius: 15px; }
  .drafts-heading { margin-top: 20px; }
  .drafts-heading h1 { font-size: 34px; }
  .draft-date { display: none; }
  .draft-row { gap: 5px; padding-inline: 0; }
  .draft-open { gap: 9px; }
  .draft-avatar { width: 36px; height: 36px; flex-basis: 36px; }
  .draft-copy strong { font-size: 13px; }
  .draft-meta, .draft-preview { font-size: 11px; }
}
</style>
