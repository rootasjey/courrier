<template>
  <main class="settings-page">
    <div class="settings-content">
      <h1>{{ $t('settings.title') }}</h1>

      <nav class="settings-tabs" role="tablist" :aria-label="$t('settings.sections')" @keydown="handleSettingsTabKeydown">
        <button
          v-for="tab in settingsTabs"
          :id="`settings-tab-${tab.id}`"
          :key="tab.id"
          class="settings-tab"
          type="button"
          role="tab"
          :aria-selected="activeSettingsTab === tab.id"
          :aria-controls="`settings-panel-${tab.id}`"
          :tabindex="activeSettingsTab === tab.id ? 0 : -1"
          @click="selectSettingsTab(tab.id)"
        >{{ $t(tab.label) }}</button>
      </nav>

      <section id="settings-panel-general" class="settings-panel" role="tabpanel" aria-labelledby="settings-tab-general" tabindex="0" v-show="activeSettingsTab === 'general'">
        <section class="settings-section" aria-labelledby="appearance-heading">
          <div class="settings-section-copy">
            <h2 id="appearance-heading">{{ $t('settings.appearance') }}</h2>
            <p>{{ $t('settings.appearanceDescription') }}</p>
          </div>
          <div class="settings-appearance-controls">
            <div class="settings-appearance-row">
              <div class="settings-appearance-copy">
                <h3>{{ $t('settings.mode') }}</h3>
                <p>{{ $t('settings.modeDescription') }}</p>
              </div>
              <NCombobox
                class="settings-appearance-combobox"
                :items="modeOptions"
                :model-value="selectedModeOption"
                :open="modeMenuOpen"
                by="value"
                :_combobox-input="{ placeholder: $t('settings.findMode'), autocomplete: 'off' }"
                :_combobox-list="{ align: 'end', side: 'bottom', sideOffset: 7, class: 'settings-appearance-list z-[120]' }"
                :_combobox-viewport="{ class: 'settings-appearance-viewport' }"
                :_combobox-trigger="{ class: 'settings-appearance-trigger', trailing: 'i-lucide-chevron-down', ariaLabel: $t('settings.mode') }"
                :_combobox-item="{ class: 'settings-appearance-item' }"
                :text-empty="$t('settings.noAppearanceOptions')"
                @update:open="setModeMenuOpen"
                @update:model-value="selectMode"
              >
                <template #trigger>
                  <span>{{ selectedModeOption?.label }}</span>
                </template>
              </NCombobox>
            </div>
            <div class="settings-appearance-row settings-theme-heading">
              <div class="settings-appearance-copy">
                <h3>{{ $t('settings.theme') }}</h3>
                <p>{{ $t('settings.themeDescription') }}</p>
              </div>
            </div>
            <fieldset class="settings-theme-fieldset">
              <legend class="sr-only">{{ $t('settings.theme') }}</legend>
              <label class="settings-theme-search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="10.8" cy="10.8" r="6.7" />
                  <path d="m16 16 4.4 4.4" />
                </svg>
                <input
                  v-model="themeSearch"
                  type="search"
                  autocomplete="off"
                  :aria-label="$t('settings.findTheme')"
                  :placeholder="$t('settings.findTheme')"
                  @keydown.enter.prevent="applyFirstThemeMatch"
                >
              </label>
              <div v-if="filteredThemeOptions.length" class="settings-theme-grid">
                <label v-for="option in filteredThemeOptions" :key="option.value" class="settings-theme-card">
                  <input v-model="themeName" class="settings-theme-native-radio" type="radio" name="courrier-theme-family" :value="option.value">
                  <span class="settings-theme-radio-mark" aria-hidden="true" />
                  <span class="settings-theme-preview" :data-palette="option.value" :data-mode="previewMode" aria-hidden="true">
                    <span class="settings-theme-preview-sidebar">
                      <span class="settings-theme-preview-brand" />
                      <span class="settings-theme-preview-nav is-active" />
                      <span class="settings-theme-preview-nav" />
                      <span class="settings-theme-preview-nav" />
                    </span>
                    <span class="settings-theme-preview-message">
                      <span class="settings-theme-preview-sender">
                        <span class="settings-theme-preview-avatar" />
                        <span class="settings-theme-preview-lines">
                          <span />
                          <span />
                        </span>
                      </span>
                      <span class="settings-theme-preview-subject" />
                      <span class="settings-theme-preview-copy">
                        <span />
                        <span />
                        <span />
                      </span>
                      <span class="settings-theme-preview-chip" />
                    </span>
                  </span>
                  <span class="settings-theme-card-copy">
                    <span class="settings-theme-card-title">{{ option.label }}</span>
                    <span class="settings-theme-card-description">{{ option.description }}</span>
                  </span>
                </label>
              </div>
              <p v-else class="settings-theme-empty" role="status">{{ $t('settings.noThemesFound') }}</p>
            </fieldset>
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
      </section>

      <section id="settings-panel-profile" class="settings-panel" role="tabpanel" aria-labelledby="settings-tab-profile" tabindex="0" v-show="activeSettingsTab === 'profile'">
        <section id="profile" class="settings-section" aria-labelledby="profile-heading">
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
      </section>

      <section id="settings-panel-security" class="settings-panel" role="tabpanel" aria-labelledby="settings-tab-security" tabindex="0" v-show="activeSettingsTab === 'security'">
      <section id="security" class="settings-section" aria-labelledby="security-heading">
        <div class="settings-section-copy">
          <h2 id="security-heading">{{ $t('settings.security') }}</h2>
          <p>{{ $t(accountSession?.isPlatformAdmin ? 'settings.securityDescriptionAdmin' : 'settings.securityDescription') }}</p>
        </div>
        <div class="settings-security-body">
          <p v-if="!securityLoaded" class="settings-security-note" role="status">{{ $t('settings.securityLoading') }}</p>
          <template v-else>
            <p v-if="!accountSession.mfaConfigured" class="settings-security-note" role="status">
              {{ $t(accountSession.isPlatformAdmin ? 'settings.securityNotEnabledAdmin' : 'settings.securityNotEnabledMember') }}
            </p>
            <p v-else class="settings-security-note" role="status">
              {{ $t('settings.securityEnabled', { count: passkeys.length, remaining: recoveryCodesRemaining }) }}
            </p>
            <p v-if="accountSession.mfaConfigured && !accountSession.mfaVerified" class="settings-security-note">
              <NuxtLink :to="{ path: '/mfa', query: { redirect: '/settings#security' } }">{{ $t('settings.verifyBeforeManaging') }}</NuxtLink>
            </p>

            <form v-if="!accountSession.mfaConfigured || accountSession.mfaVerified" class="settings-passkey-form" @submit.prevent="addPasskey">
              <label class="login-field">
                <span>{{ $t('settings.passkeyName') }}</span>
                <input v-model="passkeyLabel" maxlength="80" autocomplete="off" required>
              </label>
              <label v-if="!accountSession.adminMfaConfigured" class="login-field">
                <span>{{ $t('settings.confirmPassword') }}</span>
                <input v-model="passkeyPassword" type="password" autocomplete="current-password" required>
              </label>
              <p class="settings-security-note">
                {{ $t(accountSession.mfaConfigured ? 'settings.passkeyPrivacyAdditional' : 'settings.passkeyPrivacyFirst') }}
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
                <button v-else-if="accountSession.mfaVerified" class="settings-remove-photo" type="button" :disabled="securityBusy || (passkeys.length <= 1 && (accountSession.isPlatformAdmin || recoveryCodesRemaining === 0))" :aria-label="String($t('settings.removePasskey'))" @click="confirmingPasskey = passkey.id">
                  {{ $t('settings.removePasskey') }}
                </button>
              </li>
            </ul>

            <div v-if="accountSession.mfaConfigured && accountSession.mfaVerified" class="settings-recovery-actions">
              <template v-if="confirmRecoveryRotation">
                <p>{{ $t('settings.rotateRecoveryConfirm') }}</p>
                <button class="settings-remove-photo" type="button" :disabled="securityBusy" @click="rotateRecoveryCodes">{{ $t('settings.rotateRecoveryCodes') }}</button>
                <button class="settings-export-button" type="button" :disabled="securityBusy" @click="confirmRecoveryRotation = false">{{ $t('settings.cancel') }}</button>
              </template>
              <template v-else>
                <button class="settings-export-button" type="button" :disabled="securityBusy" @click="confirmRecoveryRotation = true">{{ $t('settings.rotateRecoveryCodes') }}</button>
              </template>
            </div>

            <div v-if="!accountSession.isPlatformAdmin && accountSession.mfaConfigured && accountSession.mfaVerified" class="settings-recovery-actions">
              <template v-if="confirmingMfaDisable">
                <p>{{ $t('settings.disableMfaConfirm') }}</p>
                <button class="settings-remove-photo" type="button" :disabled="securityBusy" @click="disableMfa">{{ $t('settings.disableMfa') }}</button>
                <button class="settings-export-button" type="button" :disabled="securityBusy" @click="confirmingMfaDisable = false">{{ $t('settings.cancel') }}</button>
              </template>
              <button v-else class="settings-remove-photo" type="button" :disabled="securityBusy" @click="confirmingMfaDisable = true">{{ $t('settings.disableMfa') }}</button>
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
      </section>

      <section id="settings-panel-data" class="settings-panel" role="tabpanel" aria-labelledby="settings-tab-data" tabindex="0" v-show="activeSettingsTab === 'data'">
      <section id="data" class="settings-section" aria-labelledby="export-heading">
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
type ThemeMode = 'system' | 'light' | 'dark'
type ThemeName = 'paper' | 'forest' | 'graphite' | 'lavender' | 'ayu' | 'one-dark-pro' | 'synthwave' | 'shades-purple' | 'min'
type SettingsTab = 'general' | 'profile' | 'security' | 'data'
const themeMode = useState<ThemeMode>('courrier-color-mode', () => 'system')
const themeName = useState<ThemeName>('courrier-theme-family', () => 'paper')
const modeMenuOpen = ref(false)
const themeSearch = ref('')
const systemPrefersDark = ref(false)
let systemThemeQuery: MediaQueryList | undefined
const settingsTabs = [
  { id: 'general', label: 'settings.general' },
  { id: 'profile', label: 'settings.profile' },
  { id: 'security', label: 'settings.securityTab' },
  { id: 'data', label: 'settings.data' },
] as const
const modeOptions = computed(() => [
  { value: 'system' as const, label: String($t('settings.system')) },
  { value: 'light' as const, label: String($t('settings.light')) },
  { value: 'dark' as const, label: String($t('settings.dark')) },
])
const themeOptions = computed(() => [
  { value: 'paper' as const, label: String($t('settings.themePaper')), description: String($t('settings.themePaperDescription')), searchTerms: 'paper papeterie ivory' },
  { value: 'forest' as const, label: String($t('settings.themeForest')), description: String($t('settings.themeForestDescription')), searchTerms: 'forest forêt foret green vert' },
  { value: 'graphite' as const, label: String($t('settings.themeGraphite')), description: String($t('settings.themeGraphiteDescription')), searchTerms: 'graphite charcoal charbon sand sable' },
  { value: 'lavender' as const, label: String($t('settings.themeLavender')), description: String($t('settings.themeLavenderDescription')), searchTerms: 'lavender lavande purple violet' },
  { value: 'ayu' as const, label: String($t('settings.themeAyu')), description: String($t('settings.themeAyuDescription')), searchTerms: 'ayu dark amber gold doré dore ardoise slate' },
  { value: 'one-dark-pro' as const, label: String($t('settings.themeOneDarkPro')), description: String($t('settings.themeOneDarkProDescription')), searchTerms: 'one dark pro atom bleu blue charcoal charbon' },
  { value: 'synthwave' as const, label: String($t('settings.themeSynthwave')), description: String($t('settings.themeSynthwaveDescription')), searchTerms: 'synthwave synth wave neon néon neon rose pink violet' },
  { value: 'shades-purple' as const, label: String($t('settings.themeShadesPurple')), description: String($t('settings.themeShadesPurpleDescription')), searchTerms: 'shades of purple pourpre violet indigo' },
  { value: 'min' as const, label: String($t('settings.themeMin')), description: String($t('settings.themeMinDescription')), searchTerms: 'min dark minimal minimaliste monochrome gris neutral' },
])
const filteredThemeOptions = computed(() => {
  const query = normalizeThemeSearch(themeSearch.value)
  if (!query) return themeOptions.value

  return themeOptions.value.filter((option) => normalizeThemeSearch(`${option.label} ${option.description} ${option.searchTerms}`).includes(query))
})
const selectedModeOption = computed(() => modeOptions.value.find(option => option.value === themeMode.value))
const previewMode = computed(() => themeMode.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : themeMode.value)
const activeSettingsTab = ref<SettingsTab>(route.hash === '#security' ? 'security' : 'general')
const avatarVersion = useState('courrier-avatar-version', () => 0)
const avatarAvailable = useState('courrier-avatar-available', () => false)
const accountSession = useState<{ user: { displayName: string, email: string }, isPlatformAdmin: boolean, mfaVerified: boolean, mfaConfigured: boolean, adminMfaVerified: boolean, adminMfaConfigured: boolean, hasPasskeys: boolean, requiresAdminMfa: boolean, recoveryCodesRemaining: number } | null>('courrier-account-session', () => null)
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
const confirmingMfaDisable = ref(false)
const recoveryCodesRemaining = ref(0)
const newRecoveryCodes = ref<string[]>([])

function normalizeThemeSearch(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function applyFirstThemeMatch() {
  if (!themeSearch.value.trim()) return
  const firstMatch = filteredThemeOptions.value[0]
  if (firstMatch) themeName.value = firstMatch.value
}

function selectMode(option: { value: ThemeMode } | null | undefined) {
  if (option && ['system', 'light', 'dark'].includes(option.value)) themeMode.value = option.value
  modeMenuOpen.value = false
}

function setModeMenuOpen(open: boolean) {
  modeMenuOpen.value = open
}

function updateSystemPreview(event: MediaQueryListEvent | MediaQueryList) {
  systemPrefersDark.value = event.matches
}

onMounted(() => {
  systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  updateSystemPreview(systemThemeQuery)
  systemThemeQuery.addEventListener('change', updateSystemPreview)
})

onBeforeUnmount(() => systemThemeQuery?.removeEventListener('change', updateSystemPreview))

useSeoMeta({
  title: () => `${$t('settings.title')} — Courrier`,
})

watch(() => route.hash, (hash) => {
  const tab = hash.slice(1)
  activeSettingsTab.value = settingsTabs.some(item => item.id === tab) ? tab as SettingsTab : 'general'
}, { immediate: true })

function selectSettingsTab(tab: SettingsTab) {
  activeSettingsTab.value = tab
  const hash = tab === 'general' ? '' : `#${tab}`
  if (route.hash !== hash) void router.replace({ path: '/settings', hash })
}

function handleSettingsTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const tabButtons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const currentIndex = tabButtons.indexOf(document.activeElement as HTMLButtonElement)
  if (currentIndex < 0) return

  event.preventDefault()
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabButtons.length - 1
      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length
  const nextTab = settingsTabs[nextIndex]
  if (!nextTab) return
  selectSettingsTab(nextTab.id)
  void nextTick(() => tabButtons[nextIndex]?.focus())
}

function changeLocale(event: Event) {
  const target = event.target
  if (target instanceof HTMLSelectElement) void $switchLocale(target.value)
}

async function loadPasskeys() {
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
      window.location.replace(`/login?redirect=${encodeURIComponent(accountSession.value?.isPlatformAdmin ? '/admin' : '/mail/inbox')}`)
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

async function disableMfa() {
  if (securityBusy.value || !accountSession.value || accountSession.value.isPlatformAdmin) return
  securityBusy.value = true
  securityMessage.value = ''
  try {
    const result = await $fetch<{ requiresReauthentication: boolean }>('/api/account/passkeys/disable', { method: 'DELETE' })
    confirmingMfaDisable.value = false
    if (result.requiresReauthentication) {
      window.location.replace('/login?redirect=%2Fmail%2Finbox')
      return
    }
    await loadPasskeys()
    await refreshAccountSession()
  } catch {
    securityMessage.value = String($t('settings.disableMfaError'))
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
  if (accountSession.value) void loadPasskeys()
})
onBeforeUnmount(() => window.removeEventListener('keydown', returnFromSettings))
</script>
