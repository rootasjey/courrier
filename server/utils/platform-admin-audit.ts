import type { AccountDb, AccountIdentity } from './account-auth'

const READ_AUDIT_DEDUPE_MINUTES = 15

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
