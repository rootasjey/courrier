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
            <span>{{ $t('contactProfile.company') }}</span>
            <input v-model.trim="company" type="text" maxlength="120" autocomplete="organization" :placeholder="$t('contactProfile.companyPlaceholder')">
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
          <fieldset class="contact-aliases-fieldset">
            <legend>{{ $t('contactProfile.phones') }}</legend>
            <p>{{ $t('contactProfile.phonesHint') }}</p>
            <div v-for="(phone, index) in phones" :key="index" class="contact-alias-row contact-detail-row">
              <input v-model.trim="phone.label" type="text" maxlength="40" :aria-label="$t('contactProfile.phoneLabel')" :placeholder="$t('contactProfile.phoneLabelPlaceholder')">
              <input v-model.trim="phone.number" type="tel" maxlength="80" :aria-label="$t('contactProfile.phoneNumber')" :placeholder="$t('contactProfile.phoneNumberPlaceholder')">
              <button type="button" :aria-label="$t('contactProfile.removePhone')" @click="phones.splice(index, 1)">{{ $t('contactProfile.remove') }}</button>
            </div>
            <button class="contact-add-address" type="button" :disabled="phones.length >= 10" @click="phones.push({ label: '', number: '' })">{{ $t('contactProfile.addPhone') }}</button>
          </fieldset>
          <fieldset class="contact-aliases-fieldset">
            <legend>{{ $t('contactProfile.postalAddresses') }}</legend>
            <p>{{ $t('contactProfile.postalAddressesHint') }}</p>
            <div v-for="(item, index) in postalAddresses" :key="index" class="contact-postal-row">
              <input v-model.trim="item.label" type="text" maxlength="40" :aria-label="$t('contactProfile.postalAddressLabel')" :placeholder="$t('contactProfile.postalAddressLabelPlaceholder')">
              <textarea v-model.trim="item.address" maxlength="1000" rows="3" :aria-label="$t('contactProfile.postalAddress')" :placeholder="$t('contactProfile.postalAddressPlaceholder')" />
              <button type="button" :aria-label="$t('contactProfile.removePostalAddress')" @click="postalAddresses.splice(index, 1)">{{ $t('contactProfile.remove') }}</button>
            </div>
            <button class="contact-add-address" type="button" :disabled="postalAddresses.length >= 10" @click="postalAddresses.push({ label: '', address: '' })">{{ $t('contactProfile.addPostalAddress') }}</button>
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
  contact: { id: string, displayName: string, company: string, addresses: { address: string, isPrimary: boolean }[], phones: { label: string, number: string }[], postalAddresses: { label: string, address: string }[] } | null
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
const company = ref('')
const primaryAddress = ref('')
const secondaryAddresses = ref<string[]>([])
const phones = ref<{ label: string, number: string }[]>([])
const postalAddresses = ref<{ label: string, address: string }[]>([])
const saving = ref(false)
const errorMessage = ref('')

watch(profileData, (profile) => {
  const contact = profile?.contact
  const primary = contact?.addresses.find(item => item.isPrimary)
  displayName.value = contact?.displayName || profile?.suggestedName || sourceAddress.value
  company.value = contact?.company || ''
  primaryAddress.value = primary?.address || sourceAddress.value
  secondaryAddresses.value = contact?.addresses.filter(item => !item.isPrimary).map(item => item.address) || []
  phones.value = contact?.phones.map(({ label, number }) => ({ label, number })) || []
  postalAddresses.value = contact?.postalAddresses.map(({ label, address }) => ({ label, address })) || []
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
        company: company.value,
        primaryAddress: primaryAddress.value,
        secondaryAddresses: secondaryAddresses.value.filter(Boolean),
        phones: phones.value.filter(item => item.number.trim()),
        postalAddresses: postalAddresses.value.filter(item => item.address.trim()),
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
.contact-editor-field input, .contact-alias-row input, .contact-postal-row input, .contact-postal-row textarea { width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; font-weight: 450; }
.contact-postal-row textarea { min-height: 82px; padding-block: 11px; resize: vertical; }
.contact-editor-field input:focus, .contact-alias-row input:focus, .contact-postal-row input:focus, .contact-postal-row textarea:focus, .contact-editor-actions button:focus-visible, .contact-alias-row button:focus-visible, .contact-postal-row button:focus-visible, .contact-add-address:focus-visible, .contact-editor-actions a:focus-visible, .contact-editor-back:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
.contact-aliases-fieldset { display: grid; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0; }
.contact-aliases-fieldset legend { padding: 0; color: var(--ink); font-size: 13px; font-weight: 650; }
.contact-aliases-fieldset > p { margin: -4px 0 2px; color: var(--quiet); font-size: 12px; }
.contact-alias-row { display: flex; align-items: center; gap: 9px; }
.contact-alias-row input { flex: 1; min-width: 0; }
.contact-detail-row input:first-child { flex: 0 1 190px; }
.contact-detail-row input:nth-child(2) { flex: 1 1 260px; }
.contact-postal-row { display: grid; grid-template-columns: minmax(110px, 180px) 1fr auto; align-items: start; gap: 9px; }
.contact-alias-row button, .contact-add-address { min-height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--muted); font: inherit; font-size: 12px; font-weight: 620; cursor: pointer; }
.contact-alias-row button:hover, .contact-add-address:hover { background: var(--accent-wash); color: var(--ink); }
.contact-add-address { justify-self: start; color: var(--accent); }
.contact-add-address:disabled { opacity: .5; cursor: not-allowed; }
.contact-editor-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-top: 6px; }
.contact-editor-actions a { display: inline-flex; min-height: 42px; align-items: center; padding: 0 13px; color: var(--muted); font-size: 13px; text-decoration: none; }
.contact-editor-actions button { min-height: 42px; padding: 0 19px; border: 0; border-radius: 22px; background: var(--accent); color: var(--accent-ink, white); font: inherit; font-size: 13px; font-weight: 680; cursor: pointer; transition: opacity 140ms ease, background-color 140ms ease; }
.contact-editor-actions button:hover:not(:disabled) { background: var(--accent-hover); }
.contact-editor-actions button:disabled { opacity: .55; cursor: not-allowed; }
.contact-editor-error, .contact-editor-state { color: var(--error); font-size: 13px; }
.contact-editor-state { display: grid; justify-items: start; gap: 9px; padding: 22px; border: 1px solid var(--line); border-radius: 12px; }
.contact-editor-state strong { color: var(--ink); }
@media (max-width: 520px) { .contact-alias-row { align-items: stretch; flex-direction: column; } .contact-alias-row button { align-self: flex-end; } .contact-postal-row { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .contact-editor-actions button { transition: none; } }
</style>
