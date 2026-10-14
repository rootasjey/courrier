import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../../utils/account-auth'
import { domainVerificationRecord, normalizeTxtAnswer } from '../../../../utils/domain-verification'

type DomainChallenge = { id: string, workspace_id: string, domain: string, verification_status: string, verification_token: string | null, expires_at: string | null }
type DnsJsonResponse = { Status?: number, Answer?: { type?: number, data?: string }[] }
type D1MutationResult = { meta?: { changes?: number } }

async function hasTxtVerificationRecord(name: string, expectedValue: string) {
  const url = new URL('https://cloudflare-dns.com/dns-query')
  url.searchParams.set('name', name)
  url.searchParams.set('type', 'TXT')

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Le résolveur DNS ne répond pas. Réessaie dans un instant.' })
  }

  if (!response.ok) {
    throw createError({ statusCode: 502, statusMessage: 'La vérification DNS est temporairement indisponible.' })
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > 32_768) {
    throw createError({ statusCode: 502, statusMessage: 'La réponse DNS est trop volumineuse.' })
  }

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
      if (byteCount > 32_768) {
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
    throw createError({ statusCode: 502, statusMessage: 'La réponse du résolveur DNS est invalide.' })
  }

  if (result.Status !== 0 && result.Status !== 3) {
    throw createError({ statusCode: 502, statusMessage: 'La recherche DNS a échoué. Réessaie dans un instant.' })
  }

  return (result.Answer ?? []).some(answer =>
    answer.type === 16 && typeof answer.data === 'string' && normalizeTxtAnswer(answer.data) === expectedValue,
  )
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const domainId = getRouterParam(event, 'id')?.trim() ?? ''
  if (!domainId || domainId.length > 256 || /[\u0000-\u001f\u007f]/u.test(domainId)) {
    throw createError({ statusCode: 400, statusMessage: 'Domaine invalide.' })
  }

  const domain = await db.prepare(`
    SELECT d.id, d.workspace_id, d.domain, d.verification_status,
      c.verification_token, c.expires_at
    FROM workspace_domains d
    LEFT JOIN domain_verification_challenges c ON c.domain_id = d.id
    WHERE d.id = ?
    LIMIT 1
  `).bind(domainId).first<DomainChallenge>()

  if (!domain) throw createError({ statusCode: 404, statusMessage: 'Domaine introuvable.' })
  if (domain.verification_status === 'verified') {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return { domainId, verified: true, unchanged: true }
  }
  if (domain.verification_status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: 'Ce domaine ne peut pas être vérifié dans son état actuel.' })
  }
  if (!domain.verification_token || !domain.expires_at) {
    throw createError({ statusCode: 409, statusMessage: 'Prépare d’abord le défi DNS de ce domaine.' })
  }
  const expiresAt = new Date(domain.expires_at)
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'Le défi DNS a expiré. Prépare un nouvel enregistrement TXT.' })
  }

  const { recordName, recordValue } = domainVerificationRecord(domain.domain, domain.verification_token)
  if (!await hasTxtVerificationRecord(recordName, recordValue)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return { domainId, verified: false }
  }

  const now = new Date().toISOString()
  const results = await db.batch([
    db.prepare(`
      UPDATE workspace_domains
      SET verification_status = 'verified', verification_method = 'dns_txt', verified_at = ?
      WHERE id = ? AND verification_status = 'pending'
        AND EXISTS (
          SELECT 1 FROM domain_verification_challenges c
          WHERE c.domain_id = ? AND c.verification_token = ? AND c.expires_at > ?
        )
    `).bind(now, domainId, domainId, domain.verification_token, now),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'workspace_domain.verified', 'workspace_domain', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(
      crypto.randomUUID(), actor.id, domainId, domain.workspace_id,
      JSON.stringify({ domain: domain.domain, verificationMethod: 'dns_txt' }), now,
    ),
    db.prepare(`
      DELETE FROM domain_verification_challenges
      WHERE domain_id = ? AND verification_token = ?
    `).bind(domainId, domain.verification_token),
  ])

  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const latest = await db.prepare(`
      SELECT verification_status FROM workspace_domains WHERE id = ? LIMIT 1
    `).bind(domainId).first<{ verification_status: string }>()
    if (latest?.verification_status === 'verified') {
      setResponseHeader(event, 'Cache-Control', 'private, no-store')
      return { domainId, verified: true, unchanged: true }
    }
    throw createError({ statusCode: 409, statusMessage: 'Le défi DNS a changé pendant la vérification. Recharge la console et réessaie.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { domainId, verified: true }
})
