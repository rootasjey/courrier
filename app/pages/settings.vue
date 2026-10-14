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
            <Avatar v-else name="Courrier profile" variant="beam" :size="64" />
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
import { Avatar } from 'tronche/vue'

const route = useRoute()
const router = useRouter()
const { $t, $switchLocale } = useI18n()
const { locale } = useI18nLocale()
const theme = useState<'system' | 'light' | 'dark'>('courrier-theme', () => 'system')
const avatarVersion = useState('courrier-avatar-version', () => 0)
const avatarAvailable = useState('courrier-avatar-available', () => false)
const photoInput = ref<HTMLInputElement | null>(null)
const photoBusy = ref(false)
const photoMessage = ref('')

useSeoMeta({
  title: () => `${$t('settings.title')} — Courrier`,
})

function changeLocale(event: Event) {
  const target = event.target
  if (target instanceof HTMLSelectElement) void $switchLocale(target.value)
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

onMounted(() => window.addEventListener('keydown', returnFromSettings))
onBeforeUnmount(() => window.removeEventListener('keydown', returnFromSettings))
</script>
