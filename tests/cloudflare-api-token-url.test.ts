import assert from 'node:assert/strict'
import test from 'node:test'
import { cloudflareApiTokenCreationUrl } from '../app/utils/cloudflare-api-token-url.ts'

test('opens the Cloudflare user-token form with a normalized Courrier token name', () => {
  const url = new URL(cloudflareApiTokenCreationUrl(' Corpinot.CC '))

  assert.equal(url.origin, 'https://dash.cloudflare.com')
  assert.equal(url.pathname, '/profile/api-tokens')
  assert.equal(url.searchParams.get('name'), 'Courrier corpinot.cc')
})

test('does not preselect broad permissions or all-zone scope', () => {
  const url = new URL(cloudflareApiTokenCreationUrl('corpinot.cc'))

  assert.equal(url.searchParams.has('permissionGroupKeys'), false)
  assert.equal(url.searchParams.has('accountId'), false)
  assert.equal(url.searchParams.has('zoneId'), false)
})
