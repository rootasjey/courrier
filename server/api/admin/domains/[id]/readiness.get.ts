import { getAccountDb, requirePlatformAdmin } from '../../../../utils/account-auth'
import { auditPlatformAdminRead } from '../../../../utils/platform-admin-audit'
import { assessDomainEmailReadiness, queryPublicDns } from '../../../../utils/domain-email-readiness'

type DomainRow = { id: string, workspace_id: string, domain: string, verification_status: string }

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const domainId = getRouterParam(event, 'id')?.trim() ?? ''
  if (!domainId || domainId.length > 256 || /[\u0000-\u001f\u007f]/u.test(domainId)) {
    throw createError({ statusCode: 400, statusMessage: 'Domaine invalide.' })
  }

  const domain = await db.prepare(`
    SELECT d.id, d.workspace_id, lower(d.domain) AS domain, d.verification_status
    FROM workspace_domains d
    JOIN workspaces w ON w.id = d.workspace_id AND w.status = 'active'
    WHERE d.id = ?
    LIMIT 1
  `).bind(domainId).first<DomainRow>()
  if (!domain) throw createError({ statusCode: 404, statusMessage: 'Domaine introuvable.' })
  if (domain.verification_status !== 'verified') {
    throw createError({ statusCode: 409, statusMessage: 'Vérifie le domaine avant de contrôler sa configuration de réception.' })
  }

  await auditPlatformAdminRead(db, actor, 'domains')

  const checks = await Promise.all([
    queryPublicDns(domain.domain, 'MX').catch(() => null),
    queryPublicDns(domain.domain, 'TXT').catch(() => null),
    queryPublicDns(`cf2024-1._domainkey.${domain.domain}`, 'TXT').catch(() => null),
  ])
  const readiness = assessDomainEmailReadiness({ mx: checks[0], routingSpf: checks[1], routingDkim: checks[2] })

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    domainId: domain.id,
    domain: domain.domain,
    checkedAt: new Date().toISOString(),
    ...readiness,
    routingRule: 'not_checked' as const,
  }
})
