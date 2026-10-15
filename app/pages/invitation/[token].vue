<template>
  <main class="invitation-page">
    <section class="invitation-card" aria-labelledby="invitation-title">
      <NuxtLink class="login-brand" to="/login" :aria-label="$t('account.brand')">
        <span class="login-brand-mark" aria-hidden="true">C</span>
        <span>Courrier</span>
      </NuxtLink>

      <template v-if="loading">
        <p class="login-kicker">{{ $t('account.invitation.kicker') }}</p>
        <h1 id="invitation-title">{{ $t('account.invitation.loading') }}</h1>
      </template>
      <template v-else-if="!invitation">
        <p class="login-kicker">{{ $t('account.invitation.kicker') }}</p>
        <h1 id="invitation-title">{{ $t(previewUnavailable ? 'account.invitation.unavailableTitle' : 'account.invitation.invalidTitle') }}</h1>
        <p class="login-description">{{ $t(previewUnavailable ? 'account.invitation.unavailableDescription' : 'account.invitation.invalidDescription') }}</p>
        <button v-if="previewUnavailable" class="invitation-secondary" type="button" @click="retryPreview">
          {{ $t('account.invitation.retry') }}
        </button>
        <NuxtLink v-else class="invitation-secondary" to="/login">{{ $t('account.login.submit') }}</NuxtLink>
      </template>
      <template v-else>
        <div class="invitation-copy">
          <p class="login-kicker">{{ $t('account.invitation.kicker') }}</p>
          <h1 id="invitation-title">{{ $t('account.invitation.title') }}</h1>
          <p class="login-description">
            {{ $t('account.invitation.description', { workspace: invitation.workspaceName }) }}
          </p>
        </div>

        <dl class="invitation-details">
          <div><dt>{{ $t('account.invitation.email') }}</dt><dd>{{ invitation.email }}</dd></div>
          <div><dt>{{ $t('account.invitation.role') }}</dt><dd>{{ roleLabel(invitation.role) }}</dd></div>
          <div><dt>{{ $t('account.invitation.expires') }}</dt><dd>{{ formatDate(invitation.expiresAt) }}</dd></div>
        </dl>

        <p v-if="accountSession && isWrongAccount" class="login-error" role="alert">
          {{ $t('account.invitation.wrongAccount', { email: accountSession.user.email }) }}
        </p>
        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
        <p class="invitation-note">{{ $t('account.invitation.mailboxAccessNote') }}</p>

        <form v-if="!accountSession || !isWrongAccount" class="login-form invitation-form" @submit.prevent="acceptInvitation">
          <label v-if="!accountSession && !existingAccount" class="login-field">
            <span>{{ $t('account.invitation.displayName') }}</span>
            <input v-model="displayName" name="name" type="text" maxlength="80" autocomplete="name" required :placeholder="$t('account.invitation.displayNamePlaceholder')">
          </label>
          <label v-if="!accountSession && !existingAccount" class="login-field">
            <span>{{ $t('account.invitation.newPassword') }}</span>
            <input v-model="password" name="new-password" type="password" minlength="16" maxlength="1024" autocomplete="new-password" required :placeholder="$t('account.invitation.passwordPlaceholder')">
            <small>{{ $t('account.invitation.passwordHint') }}</small>
          </label>
          <label v-if="!accountSession && !existingAccount" class="login-field">
            <span>{{ $t('account.invitation.confirmPassword') }}</span>
            <input v-model="confirmPassword" name="confirm-password" type="password" minlength="16" maxlength="1024" autocomplete="new-password" required :placeholder="$t('account.invitation.confirmPasswordPlaceholder')">
          </label>
          <button class="login-submit" type="submit" :disabled="pending || existingAccount">
            {{ pending ? $t('account.invitation.accepting') : accountSession ? $t('account.invitation.accept') : $t('account.invitation.createAccount') }}
          </button>
        </form>

        <div v-if="existingAccount" class="invitation-actions">
          <NuxtLink class="login-submit invitation-link-button" :to="loginDestination">{{ $t('account.invitation.signIn') }}</NuxtLink>
        </div>
        <div v-else-if="isWrongAccount" class="invitation-actions">
          <button class="invitation-secondary" type="button" :disabled="pending" @click="signOutCurrentAccount">
            {{ pending ? $t('account.signingOut') : $t('account.invitation.switchAccount') }}
          </button>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
type InvitationPreview = { email: string, role: 'member' | 'viewer', expiresAt: string, workspaceName: string }
type AccountSession = { user: { id: string, email: string, displayName: string }, activeWorkspaceId: string | null, isPlatformAdmin: boolean }

const { $t } = useI18n()
const route = useRoute()
const token = computed(() => Array.isArray(route.params.token) ? route.params.token[0] ?? '' : String(route.params.token || ''))
const invitation = ref<InvitationPreview | null>(null)
const accountSession = ref<AccountSession | null>(null)
const loading = ref(true)
const previewUnavailable = ref(false)
const pending = ref(false)
const existingAccount = ref(false)
const errorMessage = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const isWrongAccount = computed(() => Boolean(accountSession.value && invitation.value
  && accountSession.value.user.email.trim().toLocaleLowerCase('en-US') !== invitation.value.email.toLocaleLowerCase('en-US')))
const loginDestination = computed(() => ({ path: '/login', query: { redirect: `/invitation/${encodeURIComponent(token.value)}` } }))

useSeoMeta({ title: () => `${$t('account.invitation.title')} — Courrier` })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })

function roleLabel(role: InvitationPreview['role']) {
  return $t(`account.invitation.roles.${role}`)
}

function formatDate(value: string) {
  const date = new Date(value.includes('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusCode(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const value = error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  return Number(value.statusCode || value.status || value.response?.status || 0)
}

function retryPreview() {
  window.location.reload()
}

onMounted(async () => {
  try {
    invitation.value = await $fetch<InvitationPreview>(`/api/invitations/${encodeURIComponent(token.value)}`)
    displayName.value = invitation.value.email.split('@')[0] || ''
    accountSession.value = await $fetch<AccountSession>('/api/account/session').catch(() => null)
  } catch (error) {
    invitation.value = null
    previewUnavailable.value = statusCode(error) !== 404
  } finally {
    loading.value = false
  }
})

async function acceptInvitation() {
  if (pending.value || !invitation.value) return
  if (!accountSession.value && password.value !== confirmPassword.value) {
    errorMessage.value = $t('account.invitation.passwordMismatch')
    return
  }
  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/invitations/${encodeURIComponent(token.value)}/accept`, {
      method: 'POST',
      body: accountSession.value ? {} : { displayName: displayName.value, password: password.value },
    })
    await navigateTo('/mail/inbox', { replace: true })
  } catch (error) {
    const status = statusCode(error)
    if (status === 409) {
      existingAccount.value = !accountSession.value
      errorMessage.value = existingAccount.value
        ? $t('account.invitation.existingAccount')
        : $t('account.invitation.alreadyMember')
    } else if (status === 403) {
      errorMessage.value = $t('account.invitation.accountInactive')
    } else if (status === 404) {
      invitation.value = null
    } else {
      errorMessage.value = $t('account.invitation.acceptError')
    }
  } finally {
    pending.value = false
    password.value = ''
    confirmPassword.value = ''
  }
}

async function signOutCurrentAccount() {
  if (pending.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    accountSession.value = null
    existingAccount.value = false
  } catch {
    errorMessage.value = $t('account.invitation.acceptError')
  } finally {
    pending.value = false
  }
}
</script>
