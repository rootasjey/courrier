import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'
import { auditPlatformAdminRead } from '../../../utils/platform-admin-audit'
import { assessDomainEmailReadiness, queryPublicDns } from '../../../utils/domain-email-readiness'
import { normalizeWorkspaceDomain } from '../../../utils/domain-verification'

type DomainPreflightPayload = { domain?: unknown }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const body = await readBody<DomainPreflightPayload>(event)
  const domain = normalizeWorkspaceDomain(body?.domain)
  if (!domain) throw createError({ statusCode: 400, statusMessage: 'Domaine invalide.' })

  await auditPlatformAdminRead(db, actor, 'domains')

  const [mx, routingSpf, routingDkim] = await Promise.all([
    queryPublicDns(domain, 'MX').catch(() => null),
    queryPublicDns(domain, 'TXT').catch(() => null),
    queryPublicDns(`cf2024-1._domainkey.${domain}`, 'TXT').catch(() => null),
  ])

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    domain,
    checkedAt: new Date().toISOString(),
    ...assessDomainEmailReadiness({ mx, routingSpf, routingDkim }),
  }
})
