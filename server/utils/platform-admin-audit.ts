import type { AccountDb, AccountIdentity } from './account-auth'

const READ_AUDIT_DEDUPE_MINUTES = 15

export async function isAdministrativeActor(
  db: AccountDb,
  actorUserId: string,
  workspaceId: string,
) {
  const result = await db.prepare(`
    SELECT 1 AS allowed
    WHERE EXISTS (
      SELECT 1 FROM platform_admins WHERE user_id = ?
    ) OR EXISTS (
      SELECT 1 FROM workspace_memberships
      WHERE user_id = ? AND workspace_id = ? AND status = 'active'
        AND role IN ('owner', 'admin')
    )
  `).bind(actorUserId, actorUserId, workspaceId).first<{ allowed: number }>()

  return Boolean(result)
}

/**
 * Record that a platform administrator read a sensitive console resource.
 * Repeated refreshes of the same resource are collapsed for a short window.
 */
export async function auditPlatformAdminRead(
  db: AccountDb,
  actor: AccountIdentity,
  resource: 'overview' | 'mailbox_access' | 'platform_admins',
) {
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO platform_audit_log
      (id, actor_user_id, action, target_type, target_id, details_json, created_at)
    SELECT ?, ?, 'platform_admin.resource_read', 'admin_api', ?, '{}', ?
    WHERE NOT EXISTS (
      SELECT 1
      FROM platform_audit_log
      WHERE actor_user_id = ?
        AND action = 'platform_admin.resource_read'
        AND target_type = 'admin_api'
        AND target_id = ?
        AND julianday(created_at) >= julianday(?, '-${READ_AUDIT_DEDUPE_MINUTES} minutes')
    )
  `).bind(
    crypto.randomUUID(),
    actor.id,
    resource,
    now,
    actor.id,
    resource,
    now,
  ).run()
}
