<template>
  <main class="login-page password-reset-page">
    <section class="login-panel" aria-labelledby="password-reset-title">
      <NuxtLink class="login-brand" to="/login" :aria-label="$t('account.brand')">
        <BrandMark class="login-brand-mark" />
        <span>Courrier</span>
      </NuxtLink>

      <div class="login-copy">
        <p class="login-kicker">{{ $t('account.passwordReset.kicker') }}</p>
        <h1 id="password-reset-title">{{ pageTitle }}</h1>
        <p v-if="!token" class="login-description">{{ $t('account.passwordReset.requestDescription') }}</p>
      </div>

      <p v-if="!hydrated" class="login-description" role="status">{{ $t('account.invitation.loading') }}</p>

      <form v-else-if="!token && !requestSent" class="login-form" @submit.prevent="requestReset">
        <label class="login-field">
          <span>{{ $t('account.passwordReset.email') }}</span>
          <input
            v-model="email"
            autocomplete="username"
            inputmode="email"
            name="email"
            type="email"
            required
            maxlength="254"
            autocapitalize="none"
            spellcheck="false"
            :placeholder="$t('account.passwordReset.emailPlaceholder')"
          >
        </label>
        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
        <button class="login-submit" type="submit" :disabled="pending">
          {{ pending ? $t('account.passwordReset.sending') : $t('account.passwordReset.sendLink') }}
        </button>
      </form>

      <div v-else-if="hydrated && !token && requestSent" class="reset-status" role="status">
        <p>{{ $t('account.passwordReset.requestSent') }}</p>
        <button class="invitation-secondary" type="button" @click="startAgain">
          {{ $t('account.passwordReset.requestAgain') }}
        </button>
      </div>

      <form v-else-if="hydrated && token && !resetSuccess && !invalidLink" class="login-form" @submit.prevent="submitReset">
        <label class="login-field">
          <span>{{ $t('account.passwordReset.newPassword') }}</span>
          <input
            v-model="password"
            autocomplete="new-password"
            name="new-password"
            type="password"
            minlength="16"
            maxlength="1024"
            required
            :placeholder="$t('account.passwordReset.passwordPlaceholder')"
          >
          <small>{{ $t('account.passwordReset.passwordHint') }}</small>
        </label>
        <label class="login-field">
          <span>{{ $t('account.passwordReset.confirmPassword') }}</span>
          <input
            v-model="confirmPassword"
            autocomplete="new-password"
            name="confirm-password"
            type="password"
            minlength="16"
            maxlength="1024"
            required
            :placeholder="$t('account.passwordReset.confirmPlaceholder')"
          >
        </label>
        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
        <button class="login-submit" type="submit" :disabled="pending">
          {{ pending ? $t('account.passwordReset.saving') : $t('account.passwordReset.submit') }}
        </button>
      </form>

      <div v-else-if="hydrated && resetSuccess" class="reset-status" role="status">
        <p>{{ $t('account.passwordReset.resetSuccess') }}</p>
        <NuxtLink class="invitation-secondary invitation-link-button" to="/login">
          {{ $t('account.login.submit') }}
        </NuxtLink>
      </div>

      <div v-else-if="hydrated && invalidLink" class="reset-status" role="alert">
        <p class="login-error">{{ $t('account.passwordReset.invalidLink') }}</p>
        <NuxtLink class="invitation-secondary invitation-link-button" to="/password-reset">
          {{ $t('account.passwordReset.sendLink') }}
        </NuxtLink>
      </div>

      <p class="login-footnote">
        <NuxtLink to="/login">{{ $t('account.login.submit') }}</NuxtLink>
      </p>
    </section>

    <aside class="login-aside" aria-label="Courrier">
      <div class="login-aside-header">
        <BrandMark class="login-aside-mark" />
        <span>{{ $t('account.login.asideLabel') }}</span>
      </div>
      <div class="letter-preview" aria-hidden="true">
        <div class="letter-preview-top"><span /><span /><span /></div>
        <div class="letter-preview-lines">
          <span class="letter-preview-line is-short" />
          <span class="letter-preview-line" />
          <span class="letter-preview-line is-medium" />
        </div>
        <div class="letter-preview-envelope">
          <span class="envelope-flap" />
          <BrandMark class="envelope-mark" />
        </div>
      </div>
      <div class="login-aside-copy">
        <h2>{{ $t('account.login.asideTitle') }}</h2>
        <p>{{ $t('account.login.asideDescription') }}</p>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ pageTransition: false })

const { $t } = useI18n()
const email = ref('')
const token = ref('')
const password = ref('')
const confirmPassword = ref('')
const pending = ref(false)
const hydrated = ref(false)
const requestSent = ref(false)
const resetSuccess = ref(false)
const invalidLink = ref(false)
const errorMessage = ref('')
const pageTitle = computed(() => token.value || resetSuccess.value
  ? $t('account.passwordReset.resetTitle')
  : $t('account.passwordReset.requestTitle'))

useSeoMeta({
  title: () => `${$t('account.passwordReset.kicker')} — Courrier`,
  robots: 'noindex, nofollow',
})

onMounted(() => {
  token.value = window.location.hash.slice(1)
  if (window.location.hash) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  }
  invalidLink.value = Boolean(token.value && !/^[A-Za-z0-9_-]{43}$/.test(token.value))
  hydrated.value = true
})

function statusCode(error: unknown) {
  return error && typeof error === 'object'
    ? Number((error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }).statusCode
      || (error as { status?: unknown }).status
      || (error as { response?: { status?: unknown } }).response?.status || 0)
    : 0
}

async function requestReset() {
  if (pending.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/password-reset', {
      method: 'POST',
      body: { email: email.value.trim() },
    })
    requestSent.value = true
  } catch (error) {
    errorMessage.value = $t('account.passwordReset.unavailable')
  } finally {
    pending.value = false
  }
}

function startAgain() {
  email.value = ''
  errorMessage.value = ''
  requestSent.value = false
}

async function submitReset() {
  if (pending.value) return
  if (password.value !== confirmPassword.value) {
    errorMessage.value = $t('account.passwordReset.passwordMismatch')
    return
  }

  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    resetSuccess.value = true
    password.value = ''
    confirmPassword.value = ''
  } catch (error) {
    const status = statusCode(error)
    if (status === 400) invalidLink.value = true
    else errorMessage.value = $t('account.passwordReset.unavailable')
    password.value = ''
    confirmPassword.value = ''
  } finally {
    pending.value = false
  }
}
</script>
