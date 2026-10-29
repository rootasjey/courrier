import { getAccountDb, requirePlatformAdmin } from '../../../../utils/account-auth'
import { auditPlatformAdminRead } from '../../../../utils/platform-admin-audit'
import { assessDomainEmailReadiness, queryPublicDns } from '../../../../utils/domain-email-readiness'
import { checkCloudflareMailboxRouting } from '../../../../utils/cloudflare-email-routing'

type DomainRow = { id: string, workspace_id: string, domain: string, verification_status: string }
type MailboxRow = { address: string }

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

  const mailboxes = await db.prepare(`
    SELECT address FROM mailboxes WHERE domain_id = ? AND workspace_id = ? AND status = 'active'
    ORDER BY lower(address)
  `).bind(domain.id, domain.workspace_id).all<MailboxRow>()
  const bindings = event.context.cloudflare?.env as { COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN?: string } | undefined

  const checks = await Promise.all([
    queryPublicDns(domain.domain, 'MX').catch(() => null),
    queryPublicDns(domain.domain, 'TXT').catch(() => null),
    queryPublicDns(`cf2024-1._domainkey.${domain.domain}`, 'TXT').catch(() => null),
    checkCloudflareMailboxRouting({
      domain: domain.domain,
      addresses: mailboxes.results.map(mailbox => mailbox.address),
      token: bindings?.COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN,
    }),
  ])
  const readiness = assessDomainEmailReadiness({ mx: checks[0], routingSpf: checks[1], routingDkim: checks[2] })

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    domainId: domain.id,
    domain: domain.domain,
    checkedAt: new Date().toISOString(),
    ...readiness,
    routingRules: checks[3],
  }
})
