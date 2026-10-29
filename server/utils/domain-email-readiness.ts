type DnsAnswer = { type?: number, data?: string }
type DnsJsonResponse = { Status?: number, Answer?: DnsAnswer[] }

export type DomainEmailReadiness = {
  mx: { state: 'configured' | 'missing' | 'mixed' | 'other_provider' | 'unavailable', records: { target: string, priority: number | null }[] }
  routingSpf: { state: 'configured' | 'missing' | 'conflict' | 'other_provider' | 'unavailable' }
  routingDkim: { state: 'present' | 'missing' | 'unavailable' }
}

const MAX_DNS_RESPONSE_BYTES = 32_768
const CLOUDFLARE_ROUTING_MX = new Set([
  'route1.mx.cloudflare.net',
  'route2.mx.cloudflare.net',
  'route3.mx.cloudflare.net',
])

export async function queryPublicDns(name: string, type: 'MX' | 'TXT', fetcher: typeof fetch = fetch) {
  const url = new URL('https://cloudflare-dns.com/dns-query')
  url.searchParams.set('name', name)
  url.searchParams.set('type', type)

  const response = await fetcher(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('DNS_RESOLVER_UNAVAILABLE')

  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_DNS_RESPONSE_BYTES) throw new Error('DNS_RESPONSE_TOO_LARGE')

  const reader = response.body?.getReader()
  if (!reader) throw new Error('DNS_RESPONSE_MISSING')
  const chunks: Uint8Array[] = []
  let byteCount = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteCount += value.byteLength
    if (byteCount > MAX_DNS_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('DNS_RESPONSE_TOO_LARGE')
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(byteCount)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let result: DnsJsonResponse
  try {
    result = JSON.parse(new TextDecoder().decode(bytes)) as DnsJsonResponse
  } catch {
    throw new Error('DNS_RESPONSE_INVALID')
  }

  if (result.Status === 3) return []
  if (result.Status !== 0 || !Array.isArray(result.Answer)) {
    if (result.Status === 0 && result.Answer === undefined) return []
    throw new Error('DNS_QUERY_FAILED')
  }

  const answerType = type === 'MX' ? 15 : 16
  return result.Answer.filter(answer => answer.type === answerType && typeof answer.data === 'string')
}

function unavailableReadiness(): DomainEmailReadiness {
  return {
    mx: { state: 'unavailable', records: [] },
    routingSpf: { state: 'unavailable' },
    routingDkim: { state: 'unavailable' },
  }
}

function mxReadiness(answers: DnsAnswer[]): DomainEmailReadiness['mx'] {
  const records = answers.flatMap((answer) => {
    const value = answer.data?.trim() ?? ''
    const separator = value.search(/\s/u)
    if (separator < 1) return []
    const priority = Number(value.slice(0, separator))
    const target = value.slice(separator).trim().replace(/\.$/u, '').toLowerCase()
    if (!target || !Number.isInteger(priority) || priority < 0 || priority > 65_535) return []
    return [{ target, priority }]
  })

  if (!records.length) return { state: 'missing', records }
  const cloudflareTargets = new Set(records.filter(record => CLOUDFLARE_ROUTING_MX.has(record.target)).map(record => record.target))
  const externalTargets = records.some(record => !CLOUDFLARE_ROUTING_MX.has(record.target))
  if (externalTargets && cloudflareTargets.size) return { state: 'mixed', records }
  if (externalTargets) return { state: 'other_provider', records }
  return { state: cloudflareTargets.size === CLOUDFLARE_ROUTING_MX.size ? 'configured' : 'mixed', records }
}

function spfReadiness(answers: DnsAnswer[]): DomainEmailReadiness['spf'] {
  const records = answers
    .map(answer => answer.data?.replaceAll('"', '').trim() ?? '')
    .filter(value => /^v=spf1\b/iu.test(value))

  if (records.length > 1) return { state: 'conflict' }
  if (!records.length) return { state: 'missing' }
  return { state: /\binclude:_spf\.mx\.cloudflare\.net\b/iu.test(records[0]!) ? 'configured' : 'other_provider' }
}

function dkimReadiness(answers: DnsAnswer[]): DomainEmailReadiness['dkim'] {
  const exists = answers.some(answer => /^v=DKIM1\b/iu.test(answer.data?.replaceAll('"', '').trim() ?? ''))
  return { state: exists ? 'present' : 'missing' }
}

export function assessDomainEmailReadiness(input: {
  mx: DnsAnswer[] | null
  routingSpf: DnsAnswer[] | null
  routingDkim: DnsAnswer[] | null
}): DomainEmailReadiness {
  const unavailable = unavailableReadiness()
  return {
    mx: input.mx === null ? unavailable.mx : mxReadiness(input.mx),
    routingSpf: input.routingSpf === null ? unavailable.routingSpf : spfReadiness(input.routingSpf),
    routingDkim: input.routingDkim === null ? unavailable.routingDkim : dkimReadiness(input.routingDkim),
  }
}
