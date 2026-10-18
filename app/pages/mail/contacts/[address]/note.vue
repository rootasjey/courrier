<template>
  <main class="contact-note-page">
    <div class="contact-note-shell">
      <NuxtLink class="contact-note-back" :to="profilePath">← {{ $t('contactProfile.backToContact') }}</NuxtLink>
      <section v-if="profileError" class="contact-note-state" role="alert">
        <strong>{{ $t('sender.loadErrorTitle') }}</strong>
        <span>{{ $t('sender.loadErrorDescription') }}</span>
      </section>
      <section v-else-if="profilePending" class="contact-note-state" role="status">{{ $t('sender.loading') }}</section>
      <template v-else>
        <header class="contact-note-heading">
          <h1>{{ profileData?.contact?.note ? $t('contactProfile.editNote') : $t('contactProfile.addNote') }}</h1>
          <p>{{ $t('contactProfile.noteDescription', { name: contactName }) }}</p>
        </header>
        <form class="contact-note-form" @submit.prevent="save">
          <label class="contact-note-field">
            <span>{{ $t('contactProfile.sharedNote') }}</span>
            <textarea v-model="body" maxlength="10000" rows="9" :placeholder="$t('contactProfile.notePlaceholder')" />
          </label>
          <p class="contact-note-hint">{{ $t('contactProfile.noteSharedHint') }}</p>
          <p v-if="errorMessage" class="contact-note-error" role="alert">{{ errorMessage }}</p>
          <div class="contact-note-actions">
            <NuxtLink :to="profilePath">{{ $t('common.cancel') }}</NuxtLink>
            <button type="submit" :disabled="saving">{{ saving ? $t('contactProfile.savingNote') : $t('contactProfile.save') }}</button>
          </div>
        </form>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type ContactProfile = {
  contact: {
    id: string
    displayName: string
    addresses: { address: string, isPrimary: boolean }[]
    note: { body: string } | null
  } | null
  suggestedName: string
}

const route = useRoute()
const { $t } = useI18n()
const rawAddress = Array.isArray(route.params.address) ? route.params.address[0] : route.params.address
const sourceAddress = computed(() => {
  try { return decodeURIComponent(String(rawAddress ?? '')).trim().toLocaleLowerCase('en-US') }
  catch { return String(rawAddress ?? '').trim().toLocaleLowerCase('en-US') }
})
const profilePath = computed(() => `/mail/senders/${encodeURIComponent(sourceAddress.value)}`)
const { data: profileData, pending: profilePending, error: profileError } = await useFetch<ContactProfile>('/api/contacts/profile', {
  query: computed(() => ({ address: sourceAddress.value })),
  default: () => ({ contact: null, suggestedName: '' }),
})
const contactName = computed(() => profileData.value?.contact?.displayName || profileData.value?.suggestedName || sourceAddress.value)
const body = ref('')
const saving = ref(false)
const errorMessage = ref('')

watch(profileData, (profile) => { body.value = profile?.contact?.note?.body || '' }, { immediate: true })

async function save() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    let contactId = profileData.value?.contact?.id
    if (!contactId && !body.value.trim()) {
      await navigateTo(profilePath.value)
      return
    }
    if (!contactId) {
      const profile = await $fetch<{ id: string }>('/api/contacts/profile', {
        method: 'PUT',
        body: {
          sourceAddress: sourceAddress.value,
          displayName: contactName.value,
          primaryAddress: sourceAddress.value,
          secondaryAddresses: [],
        },
      })
      contactId = profile.id
    }
    await $fetch(`/api/contacts/${encodeURIComponent(contactId)}/note`, { method: 'PUT', body: { body: body.value } })
    await navigateTo(profilePath.value)
  } catch (cause) {
    errorMessage.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage || $t('contactProfile.saveNoteError')
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: computed(() => `${$t('contactProfile.sharedNote')} · ${contactName.value} — Courrier`) })
</script>

<style scoped>
.contact-note-page { min-height: calc(100vh - 76px); padding: 30px clamp(20px, 5vw, 76px) 64px; }
.contact-note-shell { width: min(100%, 760px); margin: 0 auto; }
.contact-note-back { display: inline-flex; align-items: center; min-height: 40px; margin-bottom: 28px; color: var(--accent); font-size: 14px; font-weight: 620; text-decoration: none; }
.contact-note-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.contact-note-heading { margin-bottom: 28px; }
.contact-note-heading h1 { margin: 0; color: var(--ink); font-size: clamp(27px, 4vw, 36px); font-weight: 720; letter-spacing: -.7px; }
.contact-note-heading p { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
.contact-note-form { display: grid; gap: 12px; }
.contact-note-field { display: grid; gap: 9px; color: var(--ink); font-size: 13px; font-weight: 650; }
.contact-note-field textarea { width: 100%; min-height: 230px; padding: 13px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; font-weight: 450; line-height: 1.65; resize: vertical; }
.contact-note-field textarea:focus-visible, .contact-note-actions button:focus-visible, .contact-note-actions a:focus-visible, .contact-note-back:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
.contact-note-hint { margin: 0; color: var(--quiet); font-size: 12px; line-height: 1.5; }
.contact-note-error, .contact-note-state { color: var(--error); font-size: 13px; }
.contact-note-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 8px; }
.contact-note-actions a { display: inline-flex; min-height: 42px; align-items: center; padding: 0 13px; color: var(--muted); font-size: 13px; text-decoration: none; }
.contact-note-actions button { min-height: 42px; padding: 0 19px; border: 0; border-radius: 22px; background: var(--accent); color: var(--accent-ink, white); font: inherit; font-size: 13px; font-weight: 680; cursor: pointer; transition: opacity 140ms ease, background-color 140ms ease; }
.contact-note-actions button:hover:not(:disabled) { background: var(--accent-hover); }
.contact-note-actions button:disabled { opacity: .55; cursor: wait; }
.contact-note-state { display: grid; justify-items: start; gap: 9px; padding: 22px; border: 1px solid var(--line); border-radius: 12px; }
.contact-note-state strong { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .contact-note-actions button { transition: none; } }
</style>
