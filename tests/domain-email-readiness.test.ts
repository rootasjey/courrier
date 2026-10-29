import assert from 'node:assert/strict'
import test from 'node:test'
import { assessDomainEmailReadiness } from '../server/utils/domain-email-readiness.ts'

const cloudflareMx = [
  { type: 15, data: '10 route1.mx.cloudflare.net.' },
  { type: 15, data: '20 route2.mx.cloudflare.net.' },
  { type: 15, data: '30 route3.mx.cloudflare.net.' },
]

test('detects Cloudflare MX and Email Sending records independently', () => {
  const readiness = assessDomainEmailReadiness({
    mx: cloudflareMx,
    routingSpf: [{ type: 16, data: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' }],
    routingDkim: [{ type: 16, data: '"v=DKIM1; k=rsa; p=public-key"' }],
  })

  assert.deepEqual(readiness.mx, {
    state: 'configured',
    records: [
      { target: 'route1.mx.cloudflare.net', priority: 10 },
      { target: 'route2.mx.cloudflare.net', priority: 20 },
      { target: 'route3.mx.cloudflare.net', priority: 30 },
    ],
  })
  assert.equal(readiness.routingSpf.state, 'configured')
  assert.equal(readiness.routingDkim.state, 'present')
})

test('preserves existing MX providers and flags a mixed setup', () => {
  const external = assessDomainEmailReadiness({
    mx: [{ type: 15, data: '10 mx.example.net.' }],
    routingSpf: [],
    routingDkim: [],
  })
  const mixed = assessDomainEmailReadiness({
    mx: [cloudflareMx[0]!, { type: 15, data: '10 mx.example.net.' }],
    routingSpf: [],
    routingDkim: [],
  })

  assert.equal(external.mx.state, 'other_provider')
  assert.equal(mixed.mx.state, 'mixed')
  assert.deepEqual(external.mx.records, [{ target: 'mx.example.net', priority: 10 }])
})

test('reports incomplete DNS, duplicate SPF, and unavailable checks distinctly', () => {
  const readiness = assessDomainEmailReadiness({
    mx: [cloudflareMx[0]!],
    routingSpf: [
      { type: 16, data: '"v=spf1 include:_spf.mx.cloudflare.net ~all"' },
      { type: 16, data: '"v=spf1 include:other.example ~all"' },
    ],
    routingDkim: null,
  })

  assert.equal(readiness.mx.state, 'mixed')
  assert.equal(readiness.routingSpf.state, 'conflict')
  assert.equal(readiness.routingDkim.state, 'unavailable')
  assert.equal(assessDomainEmailReadiness({ mx: [], routingSpf: [], routingDkim: [] }).mx.state, 'missing')
})
