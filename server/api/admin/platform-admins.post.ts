import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'

type GrantPayload = { userId?: unknown }
type D1MutationResult = { meta?: { changes?: number } }

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const body = await readBody<GrantPayload>(event)
  const userId = typeof body?.userId === 'string' ? body.userId.trim().toLowerCase() : ''

  if (!USER_ID_PATTERN.test(userId)) {
    throw createError({ statusCode: 400, statusMessage: 'Compte invalide.' })
  }
  if (userId === actor.id.toLowerCase()) {
    throw createError({ statusCode: 409, statusMessage: 'Un administrateur ne peut pas se promouvoir lui-même.' })
  }

  const target = await db.prepare(`
    SELECT u.id, u.status, EXISTS (
      SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id
    ) AS is_platform_admin
    FROM users u
    WHERE u.id = ?
    LIMIT 1
  `).bind(userId).first<{ id: string, status: string, is_platform_admin: number }>()

  if (!target) throw createError({ statusCode: 404, statusMessage: 'Compte Courrier introuvable.' })
  if (target.status !== 'active') {
    throw createError({ statusCode: 409, statusMessage: 'Seul un compte Courrier actif peut devenir administrateur.' })
  }
  if (target.is_platform_admin) {
    throw createError({ statusCode: 409, statusMessage: 'Ce compte est déjà administrateur de plateforme.' })
  }

  const now = new Date().toISOString()
  const results = await db.batch([
    db.prepare(`
      INSERT INTO platform_admins (user_id, created_at, created_by_user_id)
      SELECT ?, ?, ?
      FROM users u
      WHERE u.id = ? AND u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM platform_admins existing WHERE existing.user_id = u.id)
    `).bind(userId, now, actor.id, userId),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      SELECT ?, ?, 'platform_admin.granted', 'platform_admin', ?, '{}', ?
      WHERE changes() > 0
    `).bind(crypto.randomUUID(), actor.id, userId, now),
  ])

  const changed = Number((results[0] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!changed) {
    const current = await db.prepare(`
      SELECT u.status, EXISTS (
        SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.id
      ) AS is_platform_admin
      FROM users u WHERE u.id = ? LIMIT 1
    `).bind(userId).first<{ status: string, is_platform_admin: number }>()

    if (!current) throw createError({ statusCode: 404, statusMessage: 'Compte Courrier introuvable.' })
    if (current.status !== 'active') {
      throw createError({ statusCode: 409, statusMessage: 'Le compte n’est plus actif. Actualise la console.' })
    }
    if (current.is_platform_admin) {
      throw createError({ statusCode: 409, statusMessage: 'Ce compte est déjà administrateur de plateforme.' })
    }
    throw createError({ statusCode: 409, statusMessage: 'Le compte a changé entre-temps. Actualise la console et réessaie.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { userId, createdAt: now }
})
