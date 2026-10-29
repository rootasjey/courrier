import assert from 'node:assert/strict'
import test from 'node:test'
import { checkCloudflareMailboxRouting } from '../server/utils/cloudflare-email-routing.ts'

test('reports explicit Cloudflare rules for active mailbox addresses', async () => {
  const calls: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token')
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    assert.equal(url.pathname, '/client/v4/zones/zone-1/email/routing/rules')
    return Response.json({
      success: true,
      result: [
        {
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
          actions: [{ type: 'worker', value: ['courrier'] }],
        },
        {
          enabled: false,
          matchers: [{ type: 'literal', field: 'to', value: 'archive@corpinot.cc' }],
          actions: [{ type: 'worker', value: ['courrier'] }],
        },
        {
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: 'support@corpinot.cc' }],
          actions: [{ type: 'forward', value: ['external@example.net'] }],
        },
      ],
      result_info: { total_pages: 1 },
    })
  }

  const checks = await checkCloudflareMailboxRouting({
    domain: 'corpinot.cc',
    addresses: ['JEREMIE@CORPINOT.CC', 'archive@corpinot.cc', 'support@corpinot.cc', 'missing@corpinot.cc'],
    token: 'test-token',
    fetcher,
  })

  assert.deepEqual(checks, [
    { address: 'jeremie@corpinot.cc', state: 'configured' },
    { address: 'archive@corpinot.cc', state: 'disabled' },
    { address: 'support@corpinot.cc', state: 'other_target' },
    { address: 'missing@corpinot.cc', state: 'missing' },
  ])
  assert.equal(calls.length, 2)
})

test('reports unavailable without a token and for failed Cloudflare responses', async () => {
  const noToken = await checkCloudflareMailboxRouting({ domain: 'corpinot.cc', addresses: ['jeremie@corpinot.cc'] })
  assert.deepEqual(noToken, [{ address: 'jeremie@corpinot.cc', state: 'unavailable' }])

  const failed = await checkCloudflareMailboxRouting({
    domain: 'corpinot.cc',
    addresses: ['jeremie@corpinot.cc'],
    token: 'test-token',
    fetcher: async () => Response.json({ success: false, result: [] }, { status: 403 }),
  })
  assert.deepEqual(failed, [{ address: 'jeremie@corpinot.cc', state: 'unavailable' }])
})

test('checks later pages when Cloudflare paginates routing rules', async () => {
  const pages: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    const page = url.searchParams.get('page') ?? '1'
    pages.push(page)
    return Response.json({
      success: true,
      result: page === '2'
        ? [{
            enabled: true,
            matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
            actions: [{ type: 'worker', value: ['courrier'] }],
          }]
        : [],
      result_info: { total_pages: 2 },
    })
  }

  const checks = await checkCloudflareMailboxRouting({
    domain: 'corpinot.cc',
    addresses: ['jeremie@corpinot.cc'],
    token: 'test-token',
    fetcher,
  })

  assert.deepEqual(checks, [{ address: 'jeremie@corpinot.cc', state: 'configured' }])
  assert.deepEqual(pages, ['1', '2'])
})
