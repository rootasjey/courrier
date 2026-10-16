import { getAdminAuthorizationRedirect } from './admin-authorization-redirect.mjs'

export function createAdminAuthorizationRecovery({
  refreshSession,
  setSession,
  clearAdminData,
  markAuthorizationFailure,
  navigate,
  getRedirect = getAdminAuthorizationRedirect,
}) {
  let recoveryInProgress = null

  return async function recover(status) {
    if (status !== 401 && status !== 403) return false

    if (!recoveryInProgress) {
      recoveryInProgress = (async () => {
        let session = null
        try {
          session = await refreshSession()
          setSession(session)
        } catch {
          setSession(null)
        }

        const redirect = getRedirect(session)
        if (!redirect) return false

        clearAdminData()
        markAuthorizationFailure()
        await navigate(redirect, { replace: true })
        return true
      })().finally(() => {
        recoveryInProgress = null
      })
    }

    return await recoveryInProgress
  }
}
