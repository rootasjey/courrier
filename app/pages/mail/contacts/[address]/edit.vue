<template>
  <main class="contact-edit-page">
    <div class="contact-edit-shell">
      <NuxtLink class="contact-editor-back" :to="profilePath">← {{ $t('contactProfile.backToContact') }}</NuxtLink>
      <section v-if="profileError" class="contact-editor-state" role="alert">
        <strong>{{ $t('sender.loadErrorTitle') }}</strong>
        <span>{{ $t('sender.loadErrorDescription') }}</span>
      </section>
      <section v-else-if="profilePending" class="contact-editor-state" role="status">{{ $t('sender.loading') }}</section>
      <template v-else>
        <header class="contact-editor-heading">
          <h1>{{ $t('contactProfile.editContact') }}</h1>
          <p>{{ $t('contactProfile.contactEditDescription') }}</p>
        </header>
        <form class="contact-editor-form" @submit.prevent="save">
          <label class="contact-editor-field">
            <span>{{ $t('contactProfile.contactName') }}</span>
            <input v-model.trim="displayName" type="text" maxlength="120" autocomplete="name" required :placeholder="$t('contactProfile.contactNamePlaceholder')">
          </label>
          <label class="contact-editor-field">
            <span>{{ $t('contactProfile.primaryEmail') }}</span>
            <input v-model.trim="primaryAddress" type="email" maxlength="254" autocomplete="email" required>
          </label>
          <fieldset class="contact-aliases-fieldset">
            <legend>{{ $t('contactProfile.secondaryEmails') }}</legend>
            <p>{{ $t('contactProfile.secondaryEmailsHint') }}</p>
            <div v-for="(email, index) in secondaryAddresses" :key="index" class="contact-alias-row">
              <input v-model.trim="secondaryAddresses[index]" type="email" maxlength="254" :aria-label="$t('contactProfile.secondaryEmailNumber', { number: index + 1 })" :placeholder="$t('contactProfile.emailPlaceholder')">
              <button type="button" :aria-label="$t('contactProfile.removeAddress')" @click="removeAddress(index)">{{ $t('contactProfile.remove') }}</button>
            </div>
            <button v-if="secondaryAddresses.length < 9" class="contact-add-address" type="button" @click="secondaryAddresses.push('')">{{ $t('contactProfile.addAddress') }}</button>
          </fieldset>
          <p v-if="errorMessage" class="contact-editor-error" role="alert">{{ errorMessage }}</p>
          <div class="contact-editor-actions">
            <NuxtLink :to="profilePath">{{ $t('common.cancel') }}</NuxtLink>
            <button type="submit" :disabled="saving || !displayName.trim() || !primaryAddress.trim()">
              {{ saving ? $t('contactProfile.savingContact') : $t('contactProfile.save') }}
            </button>
          </div>
        </form>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type ContactProfile = {
  contact: { id: string, displayName: string, addresses: { address: string, isPrimary: boolean }[] } | null
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
const displayName = ref('')
const primaryAddress = ref('')
const secondaryAddresses = ref<string[]>([])
const saving = ref(false)
const errorMessage = ref('')

watch(profileData, (profile) => {
  const contact = profile?.contact
  const primary = contact?.addresses.find(item => item.isPrimary)
  displayName.value = contact?.displayName || profile?.suggestedName || sourceAddress.value
  primaryAddress.value = primary?.address || sourceAddress.value
  secondaryAddresses.value = contact?.addresses.filter(item => !item.isPrimary).map(item => item.address) || []
}, { immediate: true })

function removeAddress(index: number) {
  secondaryAddresses.value.splice(index, 1)
}

async function save() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const result = await $fetch<{ primaryAddress: string }>('/api/contacts/profile', {
      method: 'PUT',
      body: {
        id: profileData.value?.contact?.id,
        sourceAddress: sourceAddress.value,
        displayName: displayName.value,
        primaryAddress: primaryAddress.value,
        secondaryAddresses: secondaryAddresses.value.filter(Boolean),
      },
    })
    await navigateTo(`/mail/senders/${encodeURIComponent(result.primaryAddress)}`)
  } catch (cause) {
    errorMessage.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage || $t('contactProfile.saveContactError')
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: computed(() => `${$t('contactProfile.editContact')} — Courrier`) })
</script>

<style scoped>
.contact-edit-page { min-height: calc(100vh - 76px); padding: 30px clamp(20px, 5vw, 76px) 64px; }
.contact-edit-shell { width: min(100%, 760px); margin: 0 auto; }
.contact-editor-back { display: inline-flex; align-items: center; min-height: 40px; margin-bottom: 28px; color: var(--accent); font-size: 14px; font-weight: 620; text-decoration: none; }
.contact-editor-back:hover { text-decoration: underline; text-underline-offset: 3px; }
.contact-editor-heading { margin-bottom: 28px; }
.contact-editor-heading h1 { margin: 0; color: var(--ink); font-size: clamp(27px, 4vw, 36px); font-weight: 720; letter-spacing: -.7px; }
.contact-editor-heading p { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
.contact-editor-form { display: grid; gap: 22px; }
.contact-editor-field { display: grid; gap: 8px; color: var(--ink); font-size: 13px; font-weight: 650; }
.contact-editor-field input, .contact-alias-row input { width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; font-weight: 450; }
.contact-editor-field input:focus, .contact-alias-row input:focus, .contact-editor-actions button:focus-visible, .contact-alias-row button:focus-visible, .contact-add-address:focus-visible, .contact-editor-actions a:focus-visible, .contact-editor-back:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
.contact-aliases-fieldset { display: grid; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0; }
.contact-aliases-fieldset legend { padding: 0; color: var(--ink); font-size: 13px; font-weight: 650; }
.contact-aliases-fieldset > p { margin: -4px 0 2px; color: var(--quiet); font-size: 12px; }
.contact-alias-row { display: flex; align-items: center; gap: 9px; }
.contact-alias-row input { flex: 1; min-width: 0; }
.contact-alias-row button, .contact-add-address { min-height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--muted); font: inherit; font-size: 12px; font-weight: 620; cursor: pointer; }
.contact-alias-row button:hover, .contact-add-address:hover { background: var(--accent-wash); color: var(--ink); }
.contact-add-address { justify-self: start; color: var(--accent); }
.contact-editor-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 6px; }
.contact-editor-actions a { display: inline-flex; min-height: 42px; align-items: center; padding: 0 13px; color: var(--muted); font-size: 13px; text-decoration: none; }
.contact-editor-actions button { min-height: 42px; padding: 0 19px; border: 0; border-radius: 22px; background: var(--accent); color: var(--accent-ink, white); font: inherit; font-size: 13px; font-weight: 680; cursor: pointer; transition: opacity 140ms ease, background-color 140ms ease; }
.contact-editor-actions button:hover:not(:disabled) { background: var(--accent-hover); }
.contact-editor-actions button:disabled { opacity: .55; cursor: not-allowed; }
.contact-editor-error, .contact-editor-state { color: var(--error); font-size: 13px; }
.contact-editor-state { display: grid; justify-items: start; gap: 9px; padding: 22px; border: 1px solid var(--line); border-radius: 12px; }
.contact-editor-state strong { color: var(--ink); }
@media (max-width: 520px) { .contact-alias-row { align-items: stretch; flex-direction: column; } .contact-alias-row button { align-self: flex-end; } }
@media (prefers-reduced-motion: reduce) { .contact-editor-actions button { transition: none; } }
</style>
