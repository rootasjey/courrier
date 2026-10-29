import assert from 'node:assert/strict'
import test from 'node:test'
import { checkCloudflareMailboxRouting, CloudflareMailboxRuleError, setCloudflareMailboxRule } from '../server/utils/cloudflare-email-routing.ts'

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

test('reports a conflict when multiple exact rules match one mailbox', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    return Response.json({
      success: true,
      result: [
        {
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
          actions: [{ type: 'worker', value: ['courrier'] }],
        },
        {
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
          actions: [{ type: 'forward', value: ['external@example.net'] }],
        },
      ],
      result_info: { total_pages: 1 },
    })
  }

  const checks = await checkCloudflareMailboxRouting({
    domain: 'corpinot.cc',
    addresses: ['jeremie@corpinot.cc'],
    token: 'test-token',
    fetcher,
  })

  assert.deepEqual(checks, [{ address: 'jeremie@corpinot.cc', state: 'conflict' }])
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

test('creates an exact enabled Cloudflare route for a missing mailbox', async () => {
  const calls: { method: string, body?: Record<string, unknown> }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    if (url.pathname.endsWith('/email/routing/rules') && !init?.method) {
      return Response.json({ success: true, result: [], result_info: { total_pages: 1 } })
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push({ method: init?.method ?? 'GET', body })
    return Response.json({
      success: true,
      result: {
        id: 'rule-1',
        enabled: body.enabled,
        matchers: body.matchers,
        actions: body.actions,
        name: body.name,
      },
    })
  }

  const result = await setCloudflareMailboxRule({
    domain: 'CORPINOT.CC',
    address: 'Jeremie@corpinot.cc',
    enabled: true,
    token: 'write-token',
    fetcher,
  })

  assert.equal(result, 'created')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.method, 'POST')
  assert.deepEqual(calls[0]?.body?.matchers, [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }])
  assert.deepEqual(calls[0]?.body?.actions, [{ type: 'worker', value: ['courrier'] }])
})

test('disables a matching route and is idempotent when it is already disabled', async () => {
  const methods: string[] = []
  let enabled = true
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    if (url.pathname.endsWith('/email/routing/rules') && !init?.method) {
      return Response.json({
        success: true,
        result: [{
          id: 'rule-1', name: 'jeremie@corpinot.cc', enabled,
          matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
          actions: [{ type: 'worker', value: ['courrier'] }],
        }],
        result_info: { total_pages: 1 },
      })
    }
    methods.push(init?.method ?? 'GET')
    const body = JSON.parse(String(init?.body)) as { enabled: boolean }
    enabled = body.enabled
    return Response.json({ success: true, result: {
      id: 'rule-1', enabled,
      matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
      actions: [{ type: 'worker', value: ['courrier'] }],
    } })
  }

  const input = { domain: 'corpinot.cc', address: 'jeremie@corpinot.cc', enabled: false, token: 'write-token', fetcher }
  assert.equal(await setCloudflareMailboxRule(input), 'disabled')
  assert.deepEqual(methods, ['PUT'])
  assert.equal(await setCloudflareMailboxRule(input), 'unchanged')
  assert.deepEqual(methods, ['PUT'])
})

test('does not overwrite an exact route pointing to another destination', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    return Response.json({
      success: true,
      result: [{
        id: 'other-rule', enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: 'jeremie@corpinot.cc' }],
        actions: [{ type: 'forward', value: ['personal@example.net'] }],
      }],
      result_info: { total_pages: 1 },
    })
  }

  await assert.rejects(
    setCloudflareMailboxRule({ domain: 'corpinot.cc', address: 'jeremie@corpinot.cc', enabled: true, token: 'write-token', fetcher }),
    (error: unknown) => error instanceof CloudflareMailboxRuleError && error.code === 'conflict',
  )
})

test('disabling a missing route is idempotent and performs no write', async () => {
  let writes = 0
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (init?.method) writes++
    if (url.pathname === '/client/v4/zones') {
      return Response.json({ success: true, result: [{ id: 'zone-1', name: 'corpinot.cc', status: 'active' }] })
    }
    return Response.json({ success: true, result: [], result_info: { total_pages: 1 } })
  }

  assert.equal(await setCloudflareMailboxRule({
    domain: 'corpinot.cc', address: 'jeremie@corpinot.cc', enabled: false, token: 'write-token', fetcher,
  }), 'unchanged')
  assert.equal(writes, 0)
})
