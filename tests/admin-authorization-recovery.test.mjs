import assert from 'node:assert/strict'
import test from 'node:test'
import { createAdminAuthorizationRecovery } from '../app/utils/admin-authorization-recovery.mjs'

function makeRecovery({ session, refreshError, refreshSession } = {}) {
  const state = {
    session: 'old-session',
    adminData: { workspace: 'synthetic workspace' },
    failure: null,
    navigations: [],
    refreshCount: 0,
  }
  const recover = createAdminAuthorizationRecovery({
    refreshSession: async () => {
      state.refreshCount += 1
      if (refreshSession) return await refreshSession()
      if (refreshError) throw refreshError
      return session
    },
    setSession: value => { state.session = value },
    clearAdminData: () => { state.adminData = null },
    markAuthorizationFailure: () => { state.failure = 'access' },
    navigate: async (...args) => { state.navigations.push(args) },
  })
  return { recover, state }
}

test('a mounted admin console clears visible data and redirects to MFA after step-up expires', async () => {
  const { recover, state } = makeRecovery({
    session: {
      isPlatformAdmin: true,
      requiresAdminMfa: true,
      adminMfaVerified: false,
      activeWorkspaceId: null,
    },
  })

  assert.equal(await recover(403), true)
  assert.equal(state.session.adminMfaVerified, false)
  assert.equal(state.adminData, null)
  assert.equal(state.failure, 'access')
  assert.deepEqual(state.navigations, [[{ path: '/mfa', query: { redirect: '/admin' } }, { replace: true }]])
})

test('a mounted admin console clears data and returns to the app when its platform role is revoked', async () => {
  const { recover, state } = makeRecovery({
    session: { isPlatformAdmin: false, activeWorkspaceId: 'synthetic-workspace' },
  })

  assert.equal(await recover(401), true)
  assert.equal(state.adminData, null)
  assert.equal(state.failure, 'access')
  assert.deepEqual(state.navigations, [['/mail/inbox', { replace: true }]])
})

test('an expired account session clears data and sends the user to login', async () => {
  const { recover, state } = makeRecovery({ refreshError: new Error('expired') })

  assert.equal(await recover(403), true)
  assert.equal(state.session, null)
  assert.equal(state.adminData, null)
  assert.deepEqual(state.navigations, [[{ path: '/login', query: { redirect: '/admin' } }, { replace: true }]])
})

test('a non-authentication error does not clear an already mounted console', async () => {
  const { recover, state } = makeRecovery({ session: { isPlatformAdmin: true, adminMfaVerified: true } })

  assert.equal(await recover(500), false)
  assert.equal(state.refreshCount, 0)
  assert.deepEqual(state.adminData, { workspace: 'synthetic workspace' })
  assert.deepEqual(state.navigations, [])
})

test('a 403 with a still-valid admin session preserves the console for a scoped permission denial', async () => {
  const { recover, state } = makeRecovery({
    session: { isPlatformAdmin: true, requiresAdminMfa: true, adminMfaVerified: true },
  })

  assert.equal(await recover(403), false)
  assert.equal(state.refreshCount, 1)
  assert.deepEqual(state.adminData, { workspace: 'synthetic workspace' })
  assert.equal(state.failure, null)
  assert.deepEqual(state.navigations, [])
})

test('concurrent 401 and 403 responses share one session refresh and redirect', async () => {
  let resolveRefresh
  const { recover, state } = makeRecovery({
    refreshSession: () => new Promise(resolve => { resolveRefresh = resolve }),
  })

  const first = recover(401)
  const second = recover(403)
  await new Promise(resolve => setImmediate(resolve))
  resolveRefresh({ isPlatformAdmin: true, requiresAdminMfa: true, adminMfaVerified: false })

  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(state.refreshCount, 1)
  assert.equal(state.adminData, null)
  assert.equal(state.navigations.length, 1)
})
