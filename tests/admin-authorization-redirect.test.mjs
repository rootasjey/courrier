import assert from 'node:assert/strict'
import test from 'node:test'
import { getAdminAuthorizationRedirect } from '../app/utils/admin-authorization-redirect.mjs'

test('an authenticated platform admin without a fresh MFA step-up is sent to MFA', () => {
  assert.deepEqual(getAdminAuthorizationRedirect({
    isPlatformAdmin: true,
    requiresAdminMfa: true,
    adminMfaVerified: false,
    activeWorkspaceId: null,
  }), { path: '/mfa', query: { redirect: '/admin' } })
})

test('a platform admin with fresh MFA remains on the console after a non-auth 403', () => {
  assert.equal(getAdminAuthorizationRedirect({
    isPlatformAdmin: true,
    requiresAdminMfa: true,
    adminMfaVerified: true,
    activeWorkspaceId: null,
  }), null)
})

test('a platform admin without a mandatory MFA step-up remains authorized', () => {
  assert.equal(getAdminAuthorizationRedirect({
    isPlatformAdmin: true,
    requiresAdminMfa: false,
    adminMfaVerified: false,
    activeWorkspaceId: null,
  }), null)
})

test('a non-admin with a workspace returns to the mailbox app', () => {
  assert.equal(getAdminAuthorizationRedirect({
    isPlatformAdmin: false,
    activeWorkspaceId: 'workspace-1',
  }), '/mail/inbox')
})

test('an expired or missing account session returns to login', () => {
  assert.deepEqual(getAdminAuthorizationRedirect(null), { path: '/login', query: { redirect: '/admin' } })
  assert.deepEqual(getAdminAuthorizationRedirect({ isPlatformAdmin: false, activeWorkspaceId: null }), {
    path: '/login', query: { redirect: '/admin' },
  })
})
