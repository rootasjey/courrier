import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { normalizeWorkspaceDomain } from '../../utils/domain-verification'

type DomainPayload = { workspaceId?: unknown, domain?: unknown }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const body = await readBody<DomainPayload>(event)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : ''
  const domain = normalizeWorkspaceDomain(body?.domain)

  if (!workspaceId || workspaceId.length > 256 || /[\u0000-\u001f\u007f]/u.test(workspaceId) || !domain) {
    throw createError({ statusCode: 400, statusMessage: 'Espace ou domaine invalide.' })
  }

  const workspace = await db.prepare(`
    SELECT id FROM workspaces WHERE id = ? AND status = 'active' LIMIT 1
  `).bind(workspaceId).first<{ id: string }>()
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Espace actif introuvable.' })

  const existingDomain = await db.prepare(`
    SELECT id, workspace_id, verification_status
    FROM workspace_domains WHERE domain = ? COLLATE NOCASE LIMIT 1
  `).bind(domain).first<{ id: string, workspace_id: string, verification_status: string }>()
  if (existingDomain) {
    throw createError({ statusCode: 409, statusMessage: 'Ce domaine est déjà associé à un espace.' })
  }

  const domainId = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await db.batch([
      db.prepare(`
        INSERT INTO workspace_domains
          (id, workspace_id, domain, verification_status, verification_method, created_at)
        VALUES (?, ?, ?, 'pending', 'dns_txt', ?)
      `).bind(domainId, workspaceId, domain, now),
      db.prepare(`
        INSERT INTO platform_audit_log
          (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
        VALUES (?, ?, 'workspace_domain.created', 'workspace_domain', ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), actor.id, domainId, workspaceId,
        JSON.stringify({ domain, verificationMethod: 'dns_txt' }), now,
      ),
    ])
  } catch (error) {
    const racedDomain = await db.prepare(`
      SELECT id FROM workspace_domains WHERE domain = ? COLLATE NOCASE LIMIT 1
    `).bind(domain).first<{ id: string }>()
    if (racedDomain) throw createError({ statusCode: 409, statusMessage: 'Ce domaine est déjà associé à un espace.' })
    throw error
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { domainId, workspaceId, domain, verificationStatus: 'pending' }
})
