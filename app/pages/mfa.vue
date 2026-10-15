<template>
  <main class="mfa-page">
    <section class="mfa-card" aria-labelledby="mfa-heading">
      <NuxtLink class="settings-back" to="/settings#security">{{ $t('mfa.backToSettings') }}</NuxtLink>
      <div class="mfa-mark" aria-hidden="true">⌑</div>
      <h1 id="mfa-heading">{{ $t('mfa.title') }}</h1>
      <p>{{ $t('mfa.description') }}</p>

      <button class="settings-export-button mfa-primary" type="button" :disabled="busy || !accountSession?.hasPasskeys" @click="verifyWithPasskey">
        {{ busy ? $t('mfa.verifying') : $t('mfa.usePasskey') }}
      </button>

      <form class="mfa-recovery-form" @submit.prevent="verifyWithRecoveryCode">
        <label class="login-field">
          <span>{{ $t('mfa.recoveryCodeLabel') }}</span>
          <input v-model="recoveryCode" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" :placeholder="String($t('mfa.recoveryCodePlaceholder'))" required>
        </label>
        <button class="settings-export-button" type="submit" :disabled="busy || !recoveryCode.trim()">
          {{ $t('mfa.useRecoveryCode') }}
        </button>
      </form>

      <p v-if="!accountSession?.hasPasskeys" class="mfa-message" role="status">
        {{ $t('mfa.noPasskey') }}
        <NuxtLink to="/settings#security">{{ $t('mfa.configurePasskey') }}</NuxtLink>
      </p>
      <p v-if="message" class="mfa-message" :class="{ 'mfa-error': failed }" :role="failed ? 'alert' : 'status'">{{ message }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { $t } = useI18n()
type AccountSession = { user: { email: string }, activeWorkspaceId: string | null, isPlatformAdmin: boolean, hasPasskeys: boolean, requiresAdminMfa: boolean, adminMfaVerified: boolean }
const accountSession = useState<AccountSession | null>('courrier-account-session', () => null)
const busy = ref(false)
const recoveryCode = ref('')
const message = ref('')
const failed = ref(false)

useSeoMeta({ title: () => `${$t('mfa.title')} — Courrier` })

function getSafeRedirect() {
  const candidate = typeof route.query.redirect === 'string' ? route.query.redirect : '/admin'
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || candidate.startsWith('/mfa')) return '/admin'
  return candidate
}

async function completeVerification(method: 'passkey' | 'recovery_code') {
  failed.value = false
  message.value = String(method === 'passkey' ? $t('mfa.passkeyVerified') : $t('mfa.recoveryVerified'))
  recoveryCode.value = ''
  try {
    accountSession.value = await $fetch<AccountSession>('/api/account/session')
  } catch {
    // The protected destination will revalidate the account session before rendering.
  }
  await router.replace(getSafeRedirect())
}

async function verifyWithPasskey() {
  if (busy.value || !accountSession.value?.hasPasskeys) return
  busy.value = true
  failed.value = false
  message.value = ''
  try {
    const { startAuthentication } = await import('@simplewebauthn/browser')
    const { options, attemptId } = await $fetch<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'], attemptId: string }>('/api/account/passkeys/authentication/options', { method: 'POST' })
    const response = await startAuthentication({ optionsJSON: options })
    await $fetch('/api/account/passkeys/authentication/verify', { method: 'POST', body: { attemptId, response } })
    await completeVerification('passkey')
  } catch {
    failed.value = true
    message.value = String($t('mfa.verificationError'))
  } finally {
    busy.value = false
  }
}

async function verifyWithRecoveryCode() {
  if (busy.value || !recoveryCode.value.trim()) return
  busy.value = true
  failed.value = false
  message.value = ''
  try {
    await $fetch('/api/account/passkeys/authentication/verify', { method: 'POST', body: { recoveryCode: recoveryCode.value } })
    await completeVerification('recovery_code')
  } catch {
    failed.value = true
    message.value = String($t('mfa.verificationError'))
  } finally {
    busy.value = false
  }
}
</script>
