import assert from 'node:assert/strict'
import test from 'node:test'
import { cloudflareRoutingTokenStatus } from '../server/utils/cloudflare-token-status.ts'

test('reports only whether Cloudflare routing secrets are configured', () => {
  assert.deepEqual(cloudflareRoutingTokenStatus(), { readConfigured: false, writeConfigured: false })
  assert.deepEqual(cloudflareRoutingTokenStatus({
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN: 'read-secret-value',
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN: '   ',
  }), { readConfigured: true, writeConfigured: false })
  assert.deepEqual(cloudflareRoutingTokenStatus({
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN: 'read-secret-value',
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN: 'write-secret-value',
  }), { readConfigured: true, writeConfigured: true })
})
