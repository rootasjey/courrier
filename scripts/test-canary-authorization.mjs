import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRecoveryEnvironmentConfig, RECOVERY_ENVIRONMENTS } from './lib/admin-mfa-recovery.mjs'
import { protectedApiRoutes } from './lib/protected-api-routes.mjs'

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ORIGIN = RECOVERY_ENVIRONMENTS.canary.publicOrigin
const API_ROOT = join(PROJECT_ROOT, 'server', 'api')

await assertRecoveryEnvironmentConfig(await readFile(join(PROJECT_ROOT, 'wrangler.canary.jsonc'), 'utf8'), 'canary')

async function request(route, { method = 'GET', headers: extraHeaders = {} } = {}) {
  return fetch(new URL(route, ORIGIN), {
    method,
    headers: { origin: ORIGIN, ...extraHeaders },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  })
}

const adminPage = await request('/admin')
assert.equal(adminPage.status, 302, `Expected /admin to redirect to login, got ${adminPage.status}.`)
assert.equal(new URL(adminPage.headers.get('location'), ORIGIN).pathname, '/login')
assert.equal(new URL(adminPage.headers.get('location'), ORIGIN).searchParams.get('redirect'), '/admin')
console.log('PASS anonymous /admin redirects to the application login.')

const routes = await protectedApiRoutes(API_ROOT)
assert.ok(routes.length >= 40, `Expected broad API coverage, found ${routes.length} routes.`)
for (const { method, path } of routes) {
  const response = await request(path, { method })
  assert.equal(response.status, 401, `Anonymous ${method} ${path} returned ${response.status}.`)
}
console.log(`PASS ${routes.length} protected API routes reject anonymous requests.`)

for (const route of ['/api/account/session', '/api/messages', '/api/admin/overview']) {
  const response = await request(route)
  assert.equal(response.status, 401, `Anonymous GET ${route} returned ${response.status}.`)
}
console.log('PASS session, mail, and admin APIs reject anonymous requests.')

const forgedIdentity = await request('/api/admin/overview', {
  headers: {
    'cf-access-authenticated-user-email': 'admin@example.invalid',
    'cf-access-user-id': '00000000-0000-4000-8000-000000000001',
    'cf-access-jwt-assertion': 'forged-canary-check',
  },
})
assert.equal(forgedIdentity.status, 401, `Forged Access headers returned ${forgedIdentity.status}.`)
console.log('PASS forged Cloudflare Access identity headers do not authenticate.')
