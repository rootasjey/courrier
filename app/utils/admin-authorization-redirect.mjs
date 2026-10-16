export function getAdminAuthorizationRedirect(session) {
  if (session?.isPlatformAdmin) {
    if (session.requiresAdminMfa && !session.adminMfaVerified) {
      return { path: '/mfa', query: { redirect: '/admin' } }
    }
    return null
  }

  if (session?.activeWorkspaceId) return '/mail/inbox'
  return { path: '/login', query: { redirect: '/admin' } }
}
