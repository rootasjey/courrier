import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { auditPlatformAdminRead } from '../../utils/platform-admin-audit'

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  await auditPlatformAdminRead(db, actor, 'mailbox_routing')

  const result = await db.prepare(`
    SELECT mb.id, mb.workspace_id, w.name AS workspace_name, d.domain, mb.address, mb.status
    FROM mailboxes mb
    JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
    JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      AND d.verification_status IN ('verified', 'legacy_unverified')
    ORDER BY w.name COLLATE NOCASE, mb.address COLLATE NOCASE
    LIMIT 500
  `).all<{
    id: string, workspace_id: string, workspace_name: string, domain: string, address: string, status: 'active' | 'suspended',
  }>()

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { mailboxes: result.results }
})
