<template>
  <main class="settings-page">
    <div class="settings-content">
      <h1>{{ $t('settings.title') }}</h1>

      <section class="settings-section" aria-labelledby="profile-heading">
        <div class="settings-section-copy">
          <h2 id="profile-heading">{{ $t('settings.profile') }}</h2>
          <p>{{ $t('settings.profileDescription') }}</p>
        </div>
        <div class="settings-profile-row">
          <div class="settings-avatar-preview" aria-hidden="true">
            <img v-if="avatarAvailable" :key="avatarVersion" :src="`/api/profile/avatar?v=${avatarVersion}`" alt="" @error="avatarAvailable = false">
            <Avatar v-else :name="avatarName" variant="beam" :size="64" />
          </div>
          <div class="settings-profile-controls">
            <input ref="photoInput" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" @change="uploadPhoto">
            <button class="settings-export-button" type="button" :disabled="photoBusy" @click="photoInput?.click()">{{ photoBusy ? '…' : $t('settings.uploadPhoto') }}</button>
            <button v-if="avatarAvailable" class="settings-remove-photo" type="button" :disabled="photoBusy" @click="removePhoto">{{ $t('settings.removePhoto') }}</button>
            <small>{{ $t('settings.photoHint') }}</small>
            <p v-if="photoMessage" class="settings-photo-status" role="status">{{ photoMessage }}</p>
          </div>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="language-heading">
        <div class="settings-section-copy">
          <h2 id="language-heading">{{ $t('settings.language') }}</h2>
          <p>{{ $t('settings.languageDescription') }}</p>
        </div>
        <label class="settings-select-row">
          <span>{{ $t('settings.language') }}</span>
          <select :value="locale || 'fr'" :aria-label="$t('settings.language')" @change="changeLocale">
            <option value="fr">{{ $t('settings.french') }}</option>
            <option value="en">{{ $t('settings.english') }}</option>
          </select>
        </label>
      </section>

      <section class="settings-section" aria-labelledby="appearance-heading">
        <div class="settings-section-copy">
          <h2 id="appearance-heading">{{ $t('settings.appearance') }}</h2>
          <p>{{ $t('settings.appearanceDescription') }}</p>
        </div>
        <label class="settings-select-row">
          <span>{{ $t('settings.theme') }}</span>
          <select v-model="theme" :aria-label="$t('settings.theme')">
            <option value="system">{{ $t('settings.system') }}</option>
            <option value="light">{{ $t('settings.light') }}</option>
            <option value="dark">{{ $t('settings.dark') }}</option>
          </select>
        </label>
      </section>

      <section v-if="accountSession?.isPlatformAdmin" id="security" class="settings-section" aria-labelledby="security-heading">
        <div class="settings-section-copy">
          <h2 id="security-heading">{{ $t('settings.security') }}</h2>
          <p>{{ $t('settings.securityDescription') }}</p>
        </div>
        <div class="settings-security-body">
          <p v-if="!securityLoaded" class="settings-security-note" role="status">{{ $t('settings.securityLoading') }}</p>
          <template v-else>
            <p v-if="!accountSession.adminMfaConfigured" class="settings-security-note" role="status">{{ $t('settings.securityNotEnabled') }}</p>
            <p v-else class="settings-security-note" role="status">
              {{ $t('settings.securityEnabled', { count: passkeys.length, remaining: recoveryCodesRemaining }) }}
            </p>
            <p v-if="accountSession.adminMfaConfigured && !accountSession.adminMfaVerified" class="settings-security-note">
              <NuxtLink :to="{ path: '/mfa', query: { redirect: '/settings#security' } }">{{ $t('settings.verifyBeforeManaging') }}</NuxtLink>
            </p>

            <form v-if="!accountSession.adminMfaConfigured || accountSession.adminMfaVerified" class="settings-passkey-form" @submit.prevent="addPasskey">
              <label class="login-field">
                <span>{{ $t('settings.passkeyName') }}</span>
                <input v-model="passkeyLabel" maxlength="80" autocomplete="off" required>
              </label>
              <label v-if="!accountSession.adminMfaConfigured" class="login-field">
                <span>{{ $t('settings.confirmPassword') }}</span>
                <input v-model="passkeyPassword" type="password" autocomplete="current-password" required>
              </label>
              <p class="settings-security-note">
                {{ $t(accountSession.adminMfaConfigured ? 'settings.passkeyPrivacyAdditional' : 'settings.passkeyPrivacyFirst') }}
              </p>
              <button class="settings-export-button" type="submit" :disabled="securityBusy">
                {{ securityBusy ? $t('settings.passkeyWorking') : $t(passkeys.length ? 'settings.addPasskey' : 'settings.enablePasskey') }}
              </button>
            </form>

            <ul v-if="passkeys.length" class="settings-passkey-list">
              <li v-for="passkey in passkeys" :key="passkey.id">
                <div>
                  <strong>{{ passkey.label }}</strong>
                  <small>{{ $t('settings.passkeyAdded', { date: formatDate(passkey.createdAt) }) }}</small>
                </div>
                <div v-if="confirmingPasskey === passkey.id" class="settings-passkey-actions">
                  <span>{{ $t('settings.removePasskeyConfirm') }}</span>
                  <button type="button" :disabled="securityBusy" @click="removePasskey(passkey.id)">{{ $t('settings.removePasskey') }}</button>
                  <button type="button" :disabled="securityBusy" @click="confirmingPasskey = null">{{ $t('settings.cancel') }}</button>
                </div>
                <button v-else-if="accountSession.adminMfaVerified" class="settings-remove-photo" type="button" :disabled="securityBusy || passkeys.length <= 1" :aria-label="String($t('settings.removePasskey'))" @click="confirmingPasskey = passkey.id">
                  {{ $t('settings.removePasskey') }}
                </button>
              </li>
            </ul>

            <div v-if="accountSession.adminMfaConfigured && accountSession.adminMfaVerified" class="settings-recovery-actions">
              <template v-if="confirmRecoveryRotation">
                <p>{{ $t('settings.rotateRecoveryConfirm') }}</p>
                <button class="settings-remove-photo" type="button" :disabled="securityBusy" @click="rotateRecoveryCodes">{{ $t('settings.rotateRecoveryCodes') }}</button>
                <button class="settings-export-button" type="button" :disabled="securityBusy" @click="confirmRecoveryRotation = false">{{ $t('settings.cancel') }}</button>
              </template>
              <template v-else>
                <button class="settings-export-button" type="button" :disabled="securityBusy" @click="confirmRecoveryRotation = true">{{ $t('settings.rotateRecoveryCodes') }}</button>
              </template>
            </div>

            <div v-if="newRecoveryCodes.length" class="settings-recovery-codes" role="status">
              <h3>{{ $t('settings.recoveryCodesTitle') }}</h3>
              <p>{{ $t('settings.recoveryCodesHint') }}</p>
              <ul><li v-for="code in newRecoveryCodes" :key="code"><code>{{ code }}</code></li></ul>
              <button class="settings-export-button" type="button" @click="downloadRecoveryCodes">
                {{ $t('settings.downloadRecoveryCodes') }}
                <span aria-hidden="true">↓</span>
              </button>
            </div>
            <p v-if="securityMessage" class="settings-photo-status" role="status">{{ securityMessage }}</p>
          </template>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="export-heading">
        <div class="settings-section-copy">
          <h2 id="export-heading">{{ $t('settings.export') }}</h2>
          <p>{{ $t('settings.exportDescription') }}</p>
        </div>
        <div class="settings-export-row">
          <p>{{ $t('settings.exportContents') }}</p>
          <a class="settings-export-button" href="/api/export" download>
            {{ $t('settings.downloadArchive') }}
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { startRegistration } from '@simplewebauthn/browser'
import { Avatar } from 'tronche/vue'

const route = useRoute()
const router = useRouter()
const { $t, $switchLocale } = useI18n()
const { locale } = useI18nLocale()
const theme = useState<'system' | 'light' | 'dark'>('courrier-theme', () => 'system')
const avatarVersion = useState('courrier-avatar-version', () => 0)
const avatarAvailable = useState('courrier-avatar-available', () => false)
const accountSession = useState<{ user: { displayName: string, email: string }, isPlatformAdmin: boolean, adminMfaVerified: boolean, adminMfaConfigured: boolean, hasPasskeys: boolean, requiresAdminMfa: boolean, recoveryCodesRemaining: number } | null>('courrier-account-session', () => null)
const avatarName = computed(() => accountSession.value?.user.displayName || accountSession.value?.user.email || 'Courrier')
const photoInput = ref<HTMLInputElement | null>(null)
const photoBusy = ref(false)
const photoMessage = ref('')
const passkeys = ref<Array<{ id: string, label: string, deviceType: string, backedUp: boolean, createdAt: string, lastUsedAt: string | null }>>([])
const securityLoaded = ref(false)
const securityBusy = ref(false)
const securityMessage = ref('')
const passkeyLabel = ref('Courrier')
const passkeyPassword = ref('')
const confirmingPasskey = ref<string | null>(null)
const confirmRecoveryRotation = ref(false)
const recoveryCodesRemaining = ref(0)
const newRecoveryCodes = ref<string[]>([])

useSeoMeta({
  title: () => `${$t('settings.title')} — Courrier`,
})

function changeLocale(event: Event) {
  const target = event.target
  if (target instanceof HTMLSelectElement) void $switchLocale(target.value)
}

async function loadPasskeys() {
  if (!accountSession.value?.isPlatformAdmin) return
  try {
    const result = await $fetch<{ passkeys: typeof passkeys.value, recoveryCodesRemaining: number }>('/api/account/passkeys')
    passkeys.value = result.passkeys
    recoveryCodesRemaining.value = result.recoveryCodesRemaining
  } catch {
    securityMessage.value = String($t('settings.securityError'))
  } finally {
    securityLoaded.value = true
  }
}

async function addPasskey() {
  if (securityBusy.value) return
  securityBusy.value = true
  securityMessage.value = ''
  newRecoveryCodes.value = []
  let setupStage: 'request' | 'browser' | 'verification' = 'request'
  try {
    const { options, attemptId } = await $fetch<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'], attemptId: string }>('/api/account/passkeys/register/options', {
      method: 'POST',
      body: { label: passkeyLabel.value, password: passkeyPassword.value },
    })
    setupStage = 'browser'
    const response = await startRegistration({ optionsJSON: options })
    setupStage = 'verification'
    const result = await $fetch<{ ok: true, recoveryCodes: string[] }>('/api/account/passkeys/register/verify', {
      method: 'POST',
      body: { attemptId, response },
    })
    newRecoveryCodes.value = result.recoveryCodes
    passkeyPassword.value = ''
    await refreshAccountSession()
    await loadPasskeys()
    securityMessage.value = String($t('settings.passkeyAddedSuccess'))
  } catch (error) {
    const failure = error as { name?: string, statusCode?: number, data?: { statusMessage?: unknown } }
    const apiMessage = typeof failure.data?.statusMessage === 'string' ? failure.data.statusMessage : ''
    if (setupStage === 'request' && apiMessage === 'Le mot de passe est incorrect.') {
      securityMessage.value = String($t('settings.passkeyPasswordError'))
    } else if (setupStage === 'request' && apiMessage) {
      securityMessage.value = apiMessage
    } else if (setupStage === 'request' && failure.statusCode) {
      securityMessage.value = `${$t('settings.passkeySetupError')} (HTTP ${failure.statusCode})`
    } else if (setupStage === 'browser' && failure.name === 'NotAllowedError') {
      securityMessage.value = String($t('settings.passkeyBrowserCancelled'))
    } else if (setupStage === 'browser') {
      securityMessage.value = String($t('settings.passkeyBrowserError'))
    } else if (setupStage === 'verification') {
      securityMessage.value = String($t('settings.passkeyVerificationError'))
    } else {
      securityMessage.value = String($t('settings.passkeySetupError'))
    }
  } finally {
    securityBusy.value = false
  }
}

async function refreshAccountSession() {
  if (!accountSession.value) return
  try {
    const response = await fetch('/api/account/session', { credentials: 'same-origin' })
    if (response.ok) accountSession.value = await response.json()
  } catch { /* The page middleware will handle a session error on navigation. */ }
}

async function removePasskey(id: string) {
  if (securityBusy.value) return
  securityBusy.value = true
  securityMessage.value = ''
  try {
    const response = await fetch(`/api/account/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
    if (!response.ok) throw new Error('Passkey removal failed.')
    const result = await response.json() as { requiresReauthentication?: boolean }
    confirmingPasskey.value = null
    if (result.requiresReauthentication) {
      await router.replace({ path: '/login', query: { redirect: '/admin' } })
      return
    }
    await loadPasskeys()
    await refreshAccountSession()
    securityMessage.value = String($t('settings.passkeyRemovedSuccess'))
  } catch {
    securityMessage.value = String($t('settings.passkeyRemoveError'))
  } finally {
    securityBusy.value = false
  }
}

async function rotateRecoveryCodes() {
  if (securityBusy.value) return
  securityBusy.value = true
  securityMessage.value = ''
  try {
    const result = await $fetch<{ recoveryCodes: string[] }>('/api/account/passkeys/recovery-codes', { method: 'POST' })
    newRecoveryCodes.value = result.recoveryCodes
    confirmRecoveryRotation.value = false
    recoveryCodesRemaining.value = result.recoveryCodes.length
    await refreshAccountSession()
    securityMessage.value = String($t('settings.recoveryCodesRotated'))
  } catch {
    securityMessage.value = String($t('settings.securityError'))
  } finally {
    securityBusy.value = false
  }
}

function downloadRecoveryCodes() {
  if (!newRecoveryCodes.value.length) return

  const content = [
    String($t('settings.recoveryCodesTitle')),
    '',
    ...newRecoveryCodes.value,
    '',
    String($t('settings.recoveryCodesHint')),
  ].join('\n')
  const file = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = 'courrier-recovery-codes.txt'
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value || 'fr', { dateStyle: 'medium' }).format(date)
}

async function uploadPhoto(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const body = new FormData()
  body.append('file', file)
  photoBusy.value = true
  photoMessage.value = ''
  try {
    await $fetch('/api/profile/avatar', { method: 'POST', body })
    avatarAvailable.value = true
    avatarVersion.value += 1
    photoMessage.value = $t('settings.photoSaved')
  } catch {
    photoMessage.value = $t('settings.photoError')
  } finally {
    photoBusy.value = false
  }
}

async function removePhoto() {
  if (photoBusy.value || !avatarAvailable.value) return
  photoBusy.value = true
  photoMessage.value = ''
  try {
    await $fetch('/api/profile/avatar', { method: 'DELETE' })
    avatarAvailable.value = false
    avatarVersion.value += 1
    photoMessage.value = $t('settings.photoRemoved')
  } catch {
    photoMessage.value = $t('settings.photoError')
  } finally {
    photoBusy.value = false
  }
}

function returnFromSettings(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (document.querySelector('details[open]')) return
  if (event.target instanceof HTMLSelectElement) {
    event.target.blur()
    return
  }

  event.preventDefault()
  const previousPath = router.options.history.state.back
  if (typeof previousPath === 'string' && previousPath.startsWith('/') && previousPath !== route.fullPath && !previousPath.startsWith('/settings')) {
    void router.back()
  } else {
    void router.push('/mail/inbox')
  }
}

onMounted(() => {
  window.addEventListener('keydown', returnFromSettings)
  void loadPasskeys()
})
onBeforeUnmount(() => window.removeEventListener('keydown', returnFromSettings))
</script>
