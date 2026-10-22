<template>
  <main class="contact-new-page">
    <div class="contact-new-shell">
      <NuxtLink class="contact-new-back" to="/mail/contacts">← {{ $t('contacts.title') }}</NuxtLink>
      <header><h1>{{ $t('contacts.newContact') }}</h1><p>{{ $t('contacts.newDescription') }}</p></header>
      <form @submit.prevent="save">
        <label><span>{{ $t('contactProfile.contactName') }}</span><input v-model.trim="displayName" maxlength="120" autocomplete="name" required></label>
        <label><span>{{ $t('contactProfile.company') }}</span><input v-model.trim="company" maxlength="120" autocomplete="organization" :placeholder="$t('contactProfile.companyPlaceholder')"></label>
        <fieldset><legend>{{ $t('contactProfile.primaryEmail') }}</legend><p>{{ $t('contacts.addressesHint') }}</p>
          <div v-for="(address, index) in addresses" :key="index" class="email-row">
            <input v-model.trim="addresses[index]" type="email" maxlength="254" :required="index === 0" :aria-label="$t(index === 0 ? 'contactProfile.primaryEmail' : 'contactProfile.secondaryEmailNumber', { number: index })" :placeholder="$t('contactProfile.emailPlaceholder')">
            <button v-if="index" type="button" @click="addresses.splice(index, 1)">{{ $t('contactProfile.remove') }}</button>
          </div>
          <button v-if="addresses.length < 10" class="add-email" type="button" @click="addresses.push('')">{{ $t('contactProfile.addAddress') }}</button>
        </fieldset>
        <fieldset><legend>{{ $t('contactProfile.phones') }}</legend><p>{{ $t('contactProfile.phonesHint') }}</p>
          <div v-for="(phone, index) in phones" :key="index" class="phone-row">
            <input v-model.trim="phone.label" maxlength="40" :aria-label="$t('contactProfile.phoneLabel')" :placeholder="$t('contactProfile.phoneLabelPlaceholder')">
            <input v-model.trim="phone.number" type="tel" maxlength="80" :aria-label="$t('contactProfile.phoneNumber')" :placeholder="$t('contactProfile.phoneNumberPlaceholder')">
            <button type="button" :aria-label="$t('contactProfile.removePhone')" @click="phones.splice(index, 1)">{{ $t('contactProfile.remove') }}</button>
          </div>
          <button class="add-email" type="button" :disabled="phones.length >= 10" @click="phones.push({ label: '', number: '' })">{{ $t('contactProfile.addPhone') }}</button>
        </fieldset>
        <fieldset><legend>{{ $t('contactProfile.postalAddresses') }}</legend><p>{{ $t('contactProfile.postalAddressesHint') }}</p>
          <div v-for="(item, index) in postalAddresses" :key="index" class="postal-row">
            <input v-model.trim="item.label" maxlength="40" :aria-label="$t('contactProfile.postalAddressLabel')" :placeholder="$t('contactProfile.postalAddressLabelPlaceholder')">
            <textarea v-model.trim="item.address" maxlength="1000" rows="3" :aria-label="$t('contactProfile.postalAddress')" :placeholder="$t('contactProfile.postalAddressPlaceholder')" />
            <button type="button" :aria-label="$t('contactProfile.removePostalAddress')" @click="postalAddresses.splice(index, 1)">{{ $t('contactProfile.remove') }}</button>
          </div>
          <button class="add-email" type="button" :disabled="postalAddresses.length >= 10" @click="postalAddresses.push({ label: '', address: '' })">{{ $t('contactProfile.addPostalAddress') }}</button>
        </fieldset>
        <label><span>{{ $t('contactProfile.sharedNote') }}</span><textarea v-model.trim="note" maxlength="10000" rows="5" :placeholder="$t('contactProfile.notePlaceholder')" /></label>
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <footer><NuxtLink to="/mail/contacts">{{ $t('common.cancel') }}</NuxtLink><button type="submit" :disabled="saving">{{ saving ? $t('contactProfile.savingContact') : $t('contactProfile.save') }}</button></footer>
      </form>
    </div>
  </main>
</template>

<script setup lang="ts">
const { $t } = useI18n()
const displayName = ref('')
const company = ref('')
const addresses = ref([''])
const phones = ref<{ label: string, number: string }[]>([])
const postalAddresses = ref<{ label: string, address: string }[]>([])
const note = ref('')
const saving = ref(false)
const errorMessage = ref('')

async function save() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const result = await $fetch<{ primaryAddress: string }>('/api/contacts', {
      method: 'POST',
      body: {
        displayName: displayName.value,
        company: company.value,
        addresses: addresses.value.filter(Boolean),
        phones: phones.value.filter(item => item.number.trim()),
        postalAddresses: postalAddresses.value.filter(item => item.address.trim()),
        note: note.value,
      },
    })
    await navigateTo(`/mail/senders/${encodeURIComponent(result.primaryAddress)}`)
  } catch (cause) {
    errorMessage.value = (cause as { data?: { statusMessage?: string } })?.data?.statusMessage || $t('contacts.createError')
  } finally { saving.value = false }
}

useSeoMeta({ title: computed(() => `${$t('contacts.newContact')} — Courrier`) })
</script>

<style scoped>
.contact-new-page { min-height: calc(100vh - 76px); padding: 30px clamp(20px, 5vw, 76px) 64px; }
.contact-new-shell { width: min(100%, 760px); margin: 0 auto; }
.contact-new-back { display: inline-flex; min-height: 40px; align-items: center; margin-bottom: 28px; color: var(--accent); font-size: 14px; font-weight: 620; text-decoration: none; }
header { margin-bottom: 28px; } header h1 { margin: 0; color: var(--ink); font-size: clamp(27px, 4vw, 36px); font-weight: 720; letter-spacing: -.7px; } header p { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
form { display: grid; gap: 22px; } label, fieldset { display: grid; gap: 9px; min-width: 0; margin: 0; padding: 0; border: 0; color: var(--ink); font-size: 13px; font-weight: 650; } legend { padding: 0; } fieldset p { margin: -3px 0 1px; color: var(--quiet); font-size: 12px; font-weight: 400; }
input, textarea { width: 100%; min-height: 46px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; font-weight: 450; } textarea { resize: vertical; }
.email-row, .phone-row { display: flex; gap: 9px; } .email-row input { flex: 1; min-width: 0; } .phone-row input:first-child { flex: 0 1 190px; } .phone-row input:nth-child(2) { flex: 1; min-width: 0; } .postal-row { display: grid; grid-template-columns: minmax(110px, 180px) 1fr auto; gap: 9px; align-items: start; } .postal-row textarea { min-height: 82px; padding-block: 11px; } .email-row button, .phone-row button, .postal-row button, .add-email, footer button, footer a { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 0 13px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--accent); font: inherit; font-size: 13px; font-weight: 620; text-decoration: none; cursor: pointer; } .add-email { justify-self: start; } .add-email:disabled { opacity: .5; cursor: not-allowed; }
input:focus, textarea:focus, button:focus-visible, a:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 58%, white); outline-offset: 3px; }
footer { display: flex; justify-content: flex-end; gap: 12px; padding-top: 4px; } footer button { min-height: 42px; border-color: var(--accent); background: var(--accent); color: white; } footer button:disabled { opacity: .6; cursor: wait; } .form-error { margin: 0; color: var(--error); font-size: 13px; }
@media (max-width: 560px) { .phone-row { flex-direction: column; } .postal-row { grid-template-columns: 1fr; } .phone-row button, .postal-row button { justify-self: end; } }
</style>
