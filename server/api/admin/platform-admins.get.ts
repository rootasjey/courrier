import { getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'
import { auditPlatformAdminRead } from '../../utils/platform-admin-audit'

const CANDIDATE_LIMIT = 200

export default defineEventHandler(async (event) => {
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  await auditPlatformAdminRead(db, actor, 'platform_admins')

  const [admins, candidateCount, candidates] = await Promise.all([
    db.prepare(`
      SELECT pa.user_id, u.email, u.display_name, u.status AS user_status,
        pa.created_at, pa.created_by_user_id, creator.email AS created_by_email
      FROM platform_admins pa
      JOIN users u ON u.id = pa.user_id
      LEFT JOIN users creator ON creator.id = pa.created_by_user_id
      ORDER BY CASE WHEN u.status = 'active' THEN 0 ELSE 1 END,
        pa.created_at ASC, u.email COLLATE NOCASE
    `).all<{
      user_id: string
      email: string
      display_name: string
      user_status: string
      created_at: string
      created_by_user_id: string | null
      created_by_email: string | null
    }>(),
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM users u
      WHERE u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id)
    `).first<{ count: number }>(),
    db.prepare(`
      SELECT u.id AS user_id, u.email, u.display_name
      FROM users u
      WHERE u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id)
      ORDER BY u.email COLLATE NOCASE
      LIMIT ?
    `).bind(CANDIDATE_LIMIT).all<{
      user_id: string
      email: string
      display_name: string
    }>(),
  ])

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    actorUserId: actor.id,
    admins: admins.results,
    candidates: candidates.results,
    candidatesTruncated: Number(candidateCount?.count ?? 0) > candidates.results.length,
  }
})
