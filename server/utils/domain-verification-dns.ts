import { normalizeTxtAnswer } from './domain-verification'

const MAX_DNS_RESPONSE_BYTES = 32_768

export type DomainVerificationDnsErrorCode = 'resolver_unavailable' | 'lookup_failed' | 'invalid_response'

export class DomainVerificationDnsError extends Error {
  readonly code: DomainVerificationDnsErrorCode

  constructor(code: DomainVerificationDnsErrorCode) {
    super(`DOMAIN_VERIFICATION_DNS_${code.toUpperCase()}`)
    this.code = code
  }
}

type DnsJsonResponse = { Status?: number, Answer?: { type?: number, data?: string }[] }

export async function hasDomainVerificationRecord(
  name: string,
  expectedValue: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL('https://cloudflare-dns.com/dns-query')
  url.searchParams.set('name', name)
  url.searchParams.set('type', 'TXT')

  let response: Response
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw new DomainVerificationDnsError('resolver_unavailable')
  }

  if (!response.ok) throw new DomainVerificationDnsError('lookup_failed')

  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_DNS_RESPONSE_BYTES) throw new DomainVerificationDnsError('invalid_response')

  let result: DnsJsonResponse
  try {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Missing DNS response body')
    const chunks: Uint8Array[] = []
    let byteCount = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteCount += value.byteLength
      if (byteCount > MAX_DNS_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('DNS response too large')
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(byteCount)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    result = JSON.parse(new TextDecoder().decode(bytes)) as DnsJsonResponse
  } catch {
    throw new DomainVerificationDnsError('invalid_response')
  }

  if (result.Status === 3) return false
  if (result.Status !== 0) {
    throw new DomainVerificationDnsError('lookup_failed')
  }
  if (result.Answer !== undefined && (
    !Array.isArray(result.Answer)
    || result.Answer.some(answer => typeof answer !== 'object' || answer === null)
  )) {
    throw new DomainVerificationDnsError('invalid_response')
  }

  return (result.Answer ?? []).some(answer =>
    answer.type === 16 && typeof answer.data === 'string' && normalizeTxtAnswer(answer.data) === expectedValue,
  )
}
