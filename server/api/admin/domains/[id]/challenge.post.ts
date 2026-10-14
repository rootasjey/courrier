import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../../utils/account-auth'
import { createDomainVerificationToken, domainVerificationRecord } from '../../../../utils/domain-verification'

type DomainChallenge = { id: string, workspace_id: string, domain: string, verification_status: string, verification_token: string | null, expires_at: string | null }
type D1MutationResult = { meta?: { changes?: number } }

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
  if (domain.verification_status !== 'pending' && domain.verification_status !== 'legacy_unverified') {
    throw createError({ statusCode: 409, statusMessage: 'Seuls les domaines en attente ou historiques non vérifiés peuvent recevoir un défi DNS.' })
  }

  const expiresAt = domain.expires_at ? new Date(domain.expires_at) : null
  let token = domain.verification_token
  let expiresAtIso = domain.expires_at
  if (!token || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    const newToken = createDomainVerificationToken()
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()
    const results = await db.batch([
      db.prepare(`
        INSERT INTO domain_verification_challenges
          (domain_id, verification_token, expires_at, created_by_user_id, created_at)
        SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM workspace_domains
          WHERE id = ? AND verification_status IN ('pending', 'legacy_unverified')
        )
          AND NOT EXISTS (
            SELECT 1 FROM domain_verification_challenges
            WHERE domain_id = ? AND datetime(expires_at) > datetime(?)
          )
        ON CONFLICT(domain_id) DO UPDATE SET
          verification_token = excluded.verification_token,
          expires_at = excluded.expires_at,
          created_by_user_id = excluded.created_by_user_id,
          created_at = excluded.created_at
        WHERE datetime(domain_verification_challenges.expires_at) <= datetime(?)
      `).bind(domainId, newToken, newExpiresAt, actor.id, now, domainId, domainId, now, now),
      db.prepare(`
        INSERT INTO platform_audit_log
          (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
        SELECT ?, ?, 'workspace_domain.challenge_created', 'workspace_domain', ?, ?, ?, ?
        WHERE changes() > 0
      `).bind(
        crypto.randomUUID(), actor.id, domainId, domain.workspace_id,
        JSON.stringify({ domain: domain.domain, expiresAt: newExpiresAt }), now,
      ),
    ])

    if (Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0) {
      token = newToken
      expiresAtIso = newExpiresAt
    } else {
      const latest = await db.prepare(`
        SELECT d.verification_status, c.verification_token, c.expires_at
        FROM workspace_domains d
        LEFT JOIN domain_verification_challenges c ON c.domain_id = d.id
        WHERE d.id = ? LIMIT 1
      `).bind(domainId).first<{ verification_status: string, verification_token: string | null, expires_at: string | null }>()
      if (latest?.verification_status !== 'pending' && latest?.verification_status !== 'legacy_unverified') {
        throw createError({ statusCode: 409, statusMessage: 'Ce domaine a changé pendant la préparation du défi DNS.' })
      }
      token = latest.verification_token
      expiresAtIso = latest.expires_at
      if (!token || !expiresAtIso || new Date(expiresAtIso).getTime() <= Date.now()) {
        throw createError({ statusCode: 409, statusMessage: 'Le défi DNS a changé pendant sa préparation. Recharge la console et réessaie.' })
      }
    }
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    domainId,
    domain: domain.domain,
    ...domainVerificationRecord(domain.domain, token),
    expiresAt: expiresAtIso,
  }
})
