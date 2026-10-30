const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
const MAX_RULE_PAGES = 20

type CloudflareEnvelope<T> = {
  success?: boolean
  result?: T
  result_info?: { total_pages?: number }
}

type CloudflareZone = { id?: string, name?: string, status?: string }
type CloudflareRule = {
  id?: string
  name?: string
  actions?: { type?: string, value?: string[] }[]
  enabled?: boolean
  matchers?: { type?: string, field?: string, value?: string }[]
  priority?: number
  source?: 'api' | 'wrangler'
}

type CloudflareMutationEnvelope = { success?: boolean, result?: CloudflareRule, errors?: unknown[] }

export type CloudflareMailboxRuleChange = 'created' | 'enabled' | 'disabled' | 'unchanged'
export type CloudflareMailboxRuleDeletion = 'removed' | 'missing'

export class CloudflareMailboxRuleError extends Error {
  readonly code: 'unavailable' | 'conflict' | 'invalid_input' | 'invalid_response'

  constructor(code: 'unavailable' | 'conflict' | 'invalid_input' | 'invalid_response') {
    super(`CLOUDFLARE_MAILBOX_RULE_${code.toUpperCase()}`)
    this.code = code
  }
}

export type CloudflareRoutingState = 'configured' | 'conflict' | 'disabled' | 'other_target' | 'missing' | 'unavailable'
export type MailboxRoutingCheck = { address: string, state: CloudflareRoutingState }

async function getCloudflareJson<T>(url: string, token: string, fetcher: typeof fetch): Promise<CloudflareEnvelope<T>> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('CLOUDFLARE_API_UNAVAILABLE')
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > 512_000) throw new Error('CLOUDFLARE_RESPONSE_TOO_LARGE')
  const body = await response.json() as CloudflareEnvelope<T>
  if (body.success !== true || !Array.isArray(body.result)) throw new Error('CLOUDFLARE_RESPONSE_INVALID')
  return body
}

function isCourrierWorkerRule(rule: CloudflareRule) {
  return rule.actions?.some(action =>
    action.type === 'worker' && action.value?.some(value => value.trim().toLowerCase() === 'courrier'),
  ) === true
}

function ruleState(address: string, rules: CloudflareRule[]): CloudflareRoutingState {
  const matches = rules.filter(rule => rule.matchers?.some(matcher =>
    matcher.type === 'literal' && matcher.field === 'to' && matcher.value?.trim().toLowerCase() === address,
  ))
  if (matches.length > 1) return 'conflict'
  if (matches.some(rule => rule.enabled === true && isCourrierWorkerRule(rule))) return 'configured'
  if (matches.some(rule => rule.enabled === false && isCourrierWorkerRule(rule))) return 'disabled'
  if (matches.length) return 'other_target'
  return 'missing'
}

export async function checkCloudflareMailboxRouting(input: {
  domain: string
  addresses: string[]
  token?: string
  fetcher?: typeof fetch
}): Promise<MailboxRoutingCheck[]> {
  const addresses = input.addresses.map(address => address.trim().toLowerCase())
  if (!addresses.length) return []
  if (!input.token?.trim()) return addresses.map(address => ({ address, state: 'unavailable' }))

  const fetcher = input.fetcher ?? fetch
  try {
    const { rules } = await listCloudflareZoneRules(input.domain.trim().toLowerCase(), input.token, fetcher)
    return addresses.map(address => ({ address, state: ruleState(address, rules) }))
  } catch {
    return addresses.map(address => ({ address, state: 'unavailable' }))
  }
}

async function listCloudflareZoneRules(domain: string, token: string, fetcher: typeof fetch) {
  const zoneUrl = new URL(`${CLOUDFLARE_API}/zones`)
  zoneUrl.searchParams.set('name', domain)
  zoneUrl.searchParams.set('status', 'active')
  zoneUrl.searchParams.set('per_page', '50')
  const zones = await getCloudflareJson<CloudflareZone[]>(zoneUrl.toString(), token, fetcher)
  const zone = zones.result?.find(candidate => candidate.name?.toLowerCase() === domain && candidate.status === 'active')
  if (!zone?.id) throw new CloudflareMailboxRuleError('unavailable')

  const rules: CloudflareRule[] = []
  let totalPages = 1
  for (let page = 1; page <= totalPages; page++) {
    const rulesUrl = new URL(`${CLOUDFLARE_API}/zones/${encodeURIComponent(zone.id)}/email/routing/rules`)
    rulesUrl.searchParams.set('page', String(page))
    rulesUrl.searchParams.set('per_page', '50')
    const response = await getCloudflareJson<CloudflareRule[]>(rulesUrl.toString(), token, fetcher)
    rules.push(...(response.result ?? []))
    totalPages = Math.max(totalPages, response.result_info?.total_pages ?? 1)
    if (totalPages > MAX_RULE_PAGES) throw new CloudflareMailboxRuleError('unavailable')
  }
  return { zoneId: zone.id, rules }
}

async function mutateCloudflareRule(url: string, method: 'POST' | 'PUT', body: CloudflareRule, token: string, fetcher: typeof fetch) {
  try {
    const response = await fetcher(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new CloudflareMailboxRuleError('unavailable')
    const envelope = await response.json() as CloudflareMutationEnvelope
    if (envelope.success !== true || !envelope.result || typeof envelope.result !== 'object') {
      throw new CloudflareMailboxRuleError('invalid_response')
    }
    return envelope.result
  } catch (error) {
    if (error instanceof CloudflareMailboxRuleError) throw error
    throw new CloudflareMailboxRuleError('unavailable')
  }
}

/** Removes one exact, disabled Courrier rule and confirms it is absent afterward. */
export async function deleteCloudflareMailboxRule(input: {
  domain: string
  address: string
  token?: string
  fetcher?: typeof fetch
}): Promise<CloudflareMailboxRuleDeletion> {
  const domain = input.domain.trim().toLowerCase()
  const address = input.address.trim().toLowerCase()
  if (!input.token?.trim()) throw new CloudflareMailboxRuleError('unavailable')
  if (!domain || !address.endsWith(`@${domain}`) || address.length > 90) {
    throw new CloudflareMailboxRuleError('invalid_input')
  }

  const fetcher = input.fetcher ?? fetch
  let zoneId: string
  let rules: CloudflareRule[]
  try {
    ({ zoneId, rules } = await listCloudflareZoneRules(domain, input.token, fetcher))
  } catch (error) {
    if (error instanceof CloudflareMailboxRuleError) throw error
    throw new CloudflareMailboxRuleError('unavailable')
  }

  const matches = rules.filter(rule => matchesAddress(rule, address))
  if (!matches.length) return 'missing'
  if (matches.length !== 1 || !isCourrierWorkerRule(matches[0])) {
    throw new CloudflareMailboxRuleError('conflict')
  }

  const existing = matches[0]!
  if (!existing.id || existing.enabled !== false) throw new CloudflareMailboxRuleError('conflict')

  try {
    const response = await fetcher(
      `${CLOUDFLARE_API}/zones/${encodeURIComponent(zoneId)}/email/routing/rules/${encodeURIComponent(existing.id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${input.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!response.ok) throw new CloudflareMailboxRuleError('unavailable')
    const envelope = await response.json() as CloudflareMutationEnvelope
    if (envelope.success !== true) throw new CloudflareMailboxRuleError('invalid_response')
  } catch (error) {
    if (error instanceof CloudflareMailboxRuleError) throw error
    throw new CloudflareMailboxRuleError('unavailable')
  }

  try {
    const latest = await listCloudflareZoneRules(domain, input.token, fetcher)
    if (latest.rules.some(rule => matchesAddress(rule, address))) {
      throw new CloudflareMailboxRuleError('invalid_response')
    }
  } catch (error) {
    if (error instanceof CloudflareMailboxRuleError) throw error
    throw new CloudflareMailboxRuleError('unavailable')
  }

  return 'removed'
}

function matchesAddress(rule: CloudflareRule, address: string) {
  return rule.matchers?.some(matcher =>
    matcher.type === 'literal' && matcher.field === 'to' && matcher.value?.trim().toLowerCase() === address,
  ) === true
}

/** Ensures one exact address rule targets Courrier, or safely toggles that rule. */
export async function setCloudflareMailboxRule(input: {
  domain: string
  address: string
  enabled: boolean
  token?: string
  fetcher?: typeof fetch
}): Promise<CloudflareMailboxRuleChange> {
  const domain = input.domain.trim().toLowerCase()
  const address = input.address.trim().toLowerCase()
  if (!input.token?.trim()) throw new CloudflareMailboxRuleError('unavailable')
  if (!domain || !address.endsWith(`@${domain}`) || address.length > 90) {
    throw new CloudflareMailboxRuleError('invalid_input')
  }

  const fetcher = input.fetcher ?? fetch
  let zoneId: string
  let rules: CloudflareRule[]
  try {
    ({ zoneId, rules } = await listCloudflareZoneRules(domain, input.token, fetcher))
  } catch (error) {
    if (error instanceof CloudflareMailboxRuleError) throw error
    throw new CloudflareMailboxRuleError('unavailable')
  }
  const matches = rules.filter(rule => matchesAddress(rule, address))
  if (!matches.length) {
    if (!input.enabled) return 'unchanged'
    const rule = await mutateCloudflareRule(
      `${CLOUDFLARE_API}/zones/${encodeURIComponent(zoneId)}/email/routing/rules`,
      'POST',
      {
        name: address,
        enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: address }],
        actions: [{ type: 'worker', value: ['courrier'] }],
        source: 'api',
      },
      input.token,
      fetcher,
    )
    if (!matchesAddress(rule, address) || !isCourrierWorkerRule(rule) || rule.enabled !== true) {
      throw new CloudflareMailboxRuleError('invalid_response')
    }
    return 'created'
  }

  if (matches.length !== 1 || !isCourrierWorkerRule(matches[0]!)) {
    throw new CloudflareMailboxRuleError('conflict')
  }

  const existing = matches[0]!
  if (!existing.id) throw new CloudflareMailboxRuleError('invalid_response')
  if (existing.enabled === input.enabled) return 'unchanged'

  const updated = await mutateCloudflareRule(
    `${CLOUDFLARE_API}/zones/${encodeURIComponent(zoneId)}/email/routing/rules/${encodeURIComponent(existing.id)}`,
    'PUT',
    {
      name: existing.name ?? address,
      enabled: input.enabled,
      matchers: existing.matchers,
      actions: existing.actions,
      ...(typeof existing.priority === 'number' ? { priority: existing.priority } : {}),
      source: existing.source ?? 'api',
    },
    input.token,
    fetcher,
  )
  if (!matchesAddress(updated, address) || !isCourrierWorkerRule(updated) || updated.enabled !== input.enabled) {
    throw new CloudflareMailboxRuleError('invalid_response')
  }
  return input.enabled ? 'enabled' : 'disabled'
}
