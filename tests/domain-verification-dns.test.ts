import assert from 'node:assert/strict'
import test from 'node:test'
import { DomainVerificationDnsError, hasDomainVerificationRecord } from '../server/utils/domain-verification-dns.ts'

const domain = '_courrier-verification.example.test'
const expected = 'courrier-verification=abc123'

test('matches the exact TXT challenge, including DNS split strings', async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('name'), domain)
    assert.equal(url.searchParams.get('type'), 'TXT')
    assert.equal(new Headers(init?.headers).get('accept'), 'application/dns-json')
    return Response.json({
      Status: 0,
      Answer: [{ type: 16, data: '"courrier-verification=abc" "123"' }],
    })
  }

  assert.equal(await hasDomainVerificationRecord(domain, expected, fetcher), true)
})

test('returns false when the challenge is absent or a different TXT value is present', async () => {
  const notFound: typeof fetch = async () => Response.json({ Status: 3 })
  const mismatch: typeof fetch = async () => Response.json({
    Status: 0,
    Answer: [{ type: 16, data: 'courrier-verification=wrong' }],
  })

  assert.equal(await hasDomainVerificationRecord(domain, expected, notFound), false)
  assert.equal(await hasDomainVerificationRecord(domain, expected, mismatch), false)
})

test('distinguishes resolver failures from invalid DNS responses', async () => {
  await assert.rejects(
    hasDomainVerificationRecord(domain, expected, async () => { throw new Error('network down') }),
    (error: unknown) => error instanceof DomainVerificationDnsError && error.code === 'resolver_unavailable',
  )
  await assert.rejects(
    hasDomainVerificationRecord(domain, expected, async () => new Response('bad json')),
    (error: unknown) => error instanceof DomainVerificationDnsError && error.code === 'invalid_response',
  )
  await assert.rejects(
    hasDomainVerificationRecord(domain, expected, async () => Response.json({ Status: 0, Answer: [null] })),
    (error: unknown) => error instanceof DomainVerificationDnsError && error.code === 'invalid_response',
  )
})
