const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
const MAX_RULE_PAGES = 20

type CloudflareEnvelope<T> = {
  success?: boolean
  result?: T
  result_info?: { total_pages?: number }
}

type CloudflareZone = { id?: string, name?: string, status?: string }
type CloudflareRule = {
  actions?: { type?: string, value?: string[] }[]
  enabled?: boolean
  matchers?: { type?: string, field?: string, value?: string }[]
}

export type CloudflareRoutingState = 'configured' | 'disabled' | 'other_target' | 'missing' | 'unavailable'
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
    const zoneUrl = new URL(`${CLOUDFLARE_API}/zones`)
    zoneUrl.searchParams.set('name', input.domain.toLowerCase())
    zoneUrl.searchParams.set('status', 'active')
    zoneUrl.searchParams.set('per_page', '50')
    const zones = await getCloudflareJson<CloudflareZone[]>(zoneUrl.toString(), input.token, fetcher)
    const zone = zones.result?.find(candidate => candidate.name?.toLowerCase() === input.domain.toLowerCase() && candidate.status === 'active')
    if (!zone?.id) return addresses.map(address => ({ address, state: 'unavailable' }))

    const rules: CloudflareRule[] = []
    let totalPages = 1
    for (let page = 1; page <= totalPages; page++) {
      const rulesUrl = new URL(`${CLOUDFLARE_API}/zones/${encodeURIComponent(zone.id)}/email/routing/rules`)
      rulesUrl.searchParams.set('page', String(page))
      rulesUrl.searchParams.set('per_page', '50')
      const response = await getCloudflareJson<CloudflareRule[]>(rulesUrl.toString(), input.token, fetcher)
      rules.push(...(response.result ?? []))
      totalPages = Math.max(totalPages, response.result_info?.total_pages ?? 1)
      if (totalPages > MAX_RULE_PAGES) throw new Error('CLOUDFLARE_TOO_MANY_RULES')
    }

    return addresses.map(address => ({ address, state: ruleState(address, rules) }))
  } catch {
    return addresses.map(address => ({ address, state: 'unavailable' }))
  }
}
