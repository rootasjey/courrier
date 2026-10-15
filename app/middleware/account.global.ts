type AccountSession = {
  user: { id: string, email: string, displayName: string }
  activeWorkspaceId: string | null
  isPlatformAdmin: boolean
  hasPasskeys: boolean
  recoveryCodesRemaining: number
  requiresAdminMfa: boolean
  adminMfaVerified: boolean
}

function getHttpStatus(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const value = error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  return Number(value.statusCode || value.status || value.response?.status || 0)
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/invitation/')) return
  if (to.path === '/password-reset') return

  const accountSession = useState<AccountSession | null>('courrier-account-session', () => null)
  const requestFetch = useRequestFetch()

  if (to.path === '/login') {
    try {
      accountSession.value = await requestFetch<AccountSession>('/api/account/session')
      return navigateTo(accountSession.value.activeWorkspaceId ? '/mail/inbox' : '/admin', { replace: true })
    } catch {
      accountSession.value = null
      return
    }
  }

  try {
    accountSession.value = await requestFetch<AccountSession>('/api/account/session')
  } catch (error) {
    accountSession.value = null
    if (getHttpStatus(error) === 401) {
      return navigateTo({ path: '/login', query: { redirect: to.fullPath } }, { replace: true })
    }

    throw createError({
      statusCode: getHttpStatus(error) || 503,
      statusMessage: 'La session Courrier n’a pas pu être vérifiée. Réessaie dans un instant.',
    })
  }

  if (to.path === '/mfa' && !accountSession.value.isPlatformAdmin) {
    return navigateTo(accountSession.value.activeWorkspaceId ? '/mail/inbox' : '/login', { replace: true })
  }

  if (to.path.startsWith('/admin')) {
    if (!accountSession.value.isPlatformAdmin) {
      return accountSession.value.activeWorkspaceId
        ? navigateTo('/mail/inbox', { replace: true })
        : navigateTo('/login', { replace: true })
    }
    if (accountSession.value.requiresAdminMfa && !accountSession.value.adminMfaVerified) {
      return navigateTo({ path: '/mfa', query: { redirect: to.fullPath } }, { replace: true })
    }
    return
  }

  if (!accountSession.value.activeWorkspaceId) {
    if (accountSession.value.isPlatformAdmin && (to.path === '/settings' || to.path === '/mfa')) return
    return accountSession.value.isPlatformAdmin
      ? navigateTo('/admin', { replace: true })
      : navigateTo('/login', { replace: true })
  }
})
