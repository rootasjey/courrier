import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'

type D1MutationResult = { meta?: { changes?: number } }

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const userId = getRouterParam(event, 'userId')?.trim().toLowerCase() ?? ''

  if (!USER_ID_PATTERN.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Compte administrateur invalide.' })
  }
  if (userId === actor.id.toLowerCase()) {
    throw createError({ statusCode: 409, statusMessage: 'Un administrateur ne peut pas révoquer son propre rôle.' })
  }

  const target = await db.prepare(`
    SELECT pa.user_id, u.status AS user_status
    FROM platform_admins pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.user_id = ?
    LIMIT 1
  `).bind(userId).first<{ user_id: string, user_status: string }>()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'Administrateur de plateforme introuvable.' })

  const now = new Date().toISOString()
  const results = await db.batch([
    db.prepare(`
      DELETE FROM platform_admins
      WHERE user_id = ? AND user_id <> ?
        AND (
          (SELECT u.status FROM users u WHERE u.id = platform_admins.user_id) <> 'active'
          OR (
            SELECT COUNT(*)
            FROM platform_admins current_admin
            JOIN users current_user ON current_user.id = current_admin.user_id
            WHERE current_user.status = 'active'
          ) > 1
        )
    `).bind(userId, actor.id),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'platform_admin.revoked', 'platform_admin', ?, '{}', ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, userId, now),
  ])

  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const current = await db.prepare(`
      SELECT pa.user_id, u.status AS user_status,
        (SELECT COUNT(*)
          FROM platform_admins active_admin
          JOIN users active_user ON active_user.id = active_admin.user_id
          WHERE active_user.status = 'active') AS active_admin_count
      FROM platform_admins pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.user_id = ?
      LIMIT 1
    `).bind(userId).first<{ user_id: string, user_status: string, active_admin_count: number }>()

    if (!current) throw createError({ statusCode: 404, statusMessage: 'Administrateur de plateforme introuvable.' })
    if (current.user_status === 'active' && Number(current.active_admin_count) <= 1) {
      throw createError({ statusCode: 409, statusMessage: 'Le dernier administrateur de plateforme actif doit être conservé.' })
    }
    throw createError({ statusCode: 409, statusMessage: 'Les droits ont changé entre-temps. Actualise la console et réessaie.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { userId, revoked: true }
})
