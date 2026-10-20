<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <NuxtLink class="login-brand" to="/login" :aria-label="$t('account.brand')">
        <BrandMark class="login-brand-mark" />
        <span>Courrier</span>
      </NuxtLink>

      <div class="login-copy">
        <p class="login-kicker">{{ $t('account.login.kicker') }}</p>
        <h1 id="login-title">{{ $t('account.login.title') }}</h1>
        <p class="login-description">{{ $t('account.login.description') }}</p>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <label class="login-field">
          <span>{{ $t('account.login.email') }}</span>
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
            :placeholder="$t('account.login.emailPlaceholder')"
          >
        </label>
        <label class="login-field">
          <span>{{ $t('account.login.password') }}</span>
          <input
            v-model="password"
            autocomplete="current-password"
            name="password"
            type="password"
            required
            maxlength="1024"
            :placeholder="$t('account.login.passwordPlaceholder')"
          >
        </label>
        <NuxtLink class="login-forgot" to="/password-reset">{{ $t('account.login.forgotPassword') }}</NuxtLink>
        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
        <button class="login-submit" type="submit" :disabled="pending">
          {{ pending ? $t('account.login.submitting') : $t('account.login.submit') }}
        </button>
      </form>

      <p class="login-footnote">{{ $t('account.login.footer') }}</p>
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
          <span class="envelope-mark">C</span>
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
const route = useRoute()
const email = ref('')
const password = ref('')
const pending = ref(false)
const errorMessage = ref('')

useSeoMeta({ title: () => `${$t('account.login.title')} — Courrier` })

function getLoginErrorMessage(error: unknown) {
  const status = error && typeof error === 'object'
    ? Number((error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }).statusCode
      || (error as { status?: unknown }).status
      || (error as { response?: { status?: unknown } }).response?.status || 0)
    : 0

  if (status === 429) return $t('account.login.rateLimited')
  if (status === 503) return $t('account.login.unavailable')
  return $t('account.login.invalid')
}

function safeRedirectPath(value: unknown) {
  if (typeof value !== 'string') return '/mail/inbox'
  try {
    const destination = new URL(value, 'https://courrier.invalid')
    if (destination.origin !== 'https://courrier.invalid' || destination.pathname === '/login') return '/mail/inbox'
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return '/mail/inbox'
  }
}

async function submitLogin() {
  if (pending.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value.trim(), password: password.value },
    })

    const requestedDestination = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect
    const destination = safeRedirectPath(requestedDestination)
    await navigateTo(destination, { replace: true })
  } catch (error) {
    errorMessage.value = getLoginErrorMessage(error)
  } finally {
    pending.value = false
    password.value = ''
  }
}
</script>
