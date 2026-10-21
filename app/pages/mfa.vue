<template>
  <main class="mfa-page">
    <section class="mfa-card" aria-labelledby="mfa-heading">
      <NTooltip :content="$t('mfa.backToSettings')" :una="{ tooltipContent: 'compose-tooltip-content z-[130]' }">
        <NuxtLink class="settings-back" to="/settings#security" :aria-label="$t('mfa.backToSettings')">
          <span class="i-tabler-arrow-left" aria-hidden="true" />
        </NuxtLink>
      </NTooltip>
      <div class="mfa-mark" aria-hidden="true">⌑</div>
      <h1 id="mfa-heading">{{ $t('mfa.title') }}</h1>
      <p>{{ $t(accountSession?.isPlatformAdmin ? 'mfa.adminDescription' : 'mfa.accountDescription') }}</p>

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
type AccountSession = { user: { email: string }, activeWorkspaceId: string | null, isPlatformAdmin: boolean, hasPasskeys: boolean, mfaConfigured: boolean, mfaVerified: boolean, mfaPending: boolean, adminMfaConfigured: boolean, requiresAdminMfa: boolean, adminMfaVerified: boolean }
const accountSession = useState<AccountSession | null>('courrier-account-session', () => null)
const busy = ref(false)
const recoveryCode = ref('')
const message = ref('')
const failed = ref(false)

useSeoMeta({ title: () => `${$t('mfa.title')} — Courrier` })

function getSafeRedirect() {
  const fallback = accountSession.value?.activeWorkspaceId ? '/mail/inbox' : '/admin'
  const candidate = typeof route.query.redirect === 'string' ? route.query.redirect : fallback
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || candidate.startsWith('/mfa')) return fallback
  return candidate
}

async function completeVerification(method: 'passkey' | 'recovery_code') {
  failed.value = false
  message.value = String(method === 'passkey' ? $t('mfa.passkeyVerified') : $t('mfa.recoveryVerified'))
  recoveryCode.value = ''
  let refreshedSession: AccountSession | null = null
  try {
    refreshedSession = await $fetch<AccountSession>('/api/account/session')
    accountSession.value = refreshedSession
  } catch {
    // The protected destination will revalidate the account session before rendering.
  }
  if (method === 'recovery_code' && refreshedSession && !refreshedSession.mfaConfigured) {
    await router.replace('/settings#security')
    return
  }
  // Rebuild the destination page after MFA rather than reusing a view that may
  // have been mounted before the route guard redirected to this page.
  window.location.replace(getSafeRedirect())
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
