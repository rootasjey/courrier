import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const domainId = getRouterParam(event, 'id')?.trim() ?? ''

  if (!domainId || domainId.length > 256 || /[\u0000-\u001f\u007f]/u.test(domainId)) {
    throw createError({ statusCode: 400, statusMessage: 'Domaine invalide.' })
  }

  const domain = await db.prepare(`
    SELECT id, workspace_id, domain, verification_status,
      (SELECT COUNT(*) FROM mailboxes WHERE domain_id = workspace_domains.id) AS mailbox_count
    FROM workspace_domains WHERE id = ? LIMIT 1
  `).bind(domainId).first<{
    id: string, workspace_id: string, domain: string, verification_status: string, mailbox_count: number,
  }>()

  if (!domain) throw createError({ statusCode: 404, statusMessage: 'Domaine introuvable.' })
  if (!['pending', 'verified'].includes(domain.verification_status) || domain.mailbox_count > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Seul un domaine en attente ou vérifié, sans boîte associée, peut être retiré.' })
  }

  const now = new Date().toISOString()
  await db.batch([
    db.prepare(`
      DELETE FROM workspace_domains
      WHERE id = ? AND verification_status IN ('pending', 'verified')
        AND NOT EXISTS (SELECT 1 FROM mailboxes WHERE domain_id = ?)
    `).bind(domainId, domainId),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'workspace_domain.removed', 'workspace_domain', ?, ?, ?, ?
      WHERE changes() > 0
    `).bind(
      crypto.randomUUID(), actor.id, domainId, domain.workspace_id,
      JSON.stringify({ domain: domain.domain, verificationStatus: domain.verification_status }), now,
    ),
  ])

  const remaining = await db.prepare(`
    SELECT 1 AS present FROM workspace_domains WHERE id = ? LIMIT 1
  `).bind(domainId).first<{ present: number }>()
  if (remaining) {
    throw createError({ statusCode: 409, statusMessage: 'Le domaine a changé ou possède maintenant une boîte.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { domainId, deleted: true }
})
