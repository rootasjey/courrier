import { isTroncheAvatarConfig } from '#shared/utils/tronche-avatar'
import { assertSameOrigin, getAccountDb, requireSessionIdentity } from '../../utils/account-auth'

const avatarModes = new Set(['default', 'photo', 'tronche'])

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = await requireSessionIdentity(event)
  const body = await readBody<{ mode?: unknown, config?: unknown }>(event)

  if (typeof body?.mode !== 'string' || !avatarModes.has(body.mode)) {
    throw createError({ statusCode: 400, statusMessage: 'Choix d’avatar invalide.' })
  }

  const hasConfig = Object.prototype.hasOwnProperty.call(body ?? {}, 'config')
  if (hasConfig && !isTroncheAvatarConfig(body.config)) {
    throw createError({ statusCode: 400, statusMessage: 'Configuration Tronche invalide.' })
  }
  if (body.mode === 'tronche' && !isTroncheAvatarConfig(body.config)) {
    throw createError({ statusCode: 400, statusMessage: 'Choisis un avatar Tronche valide.' })
  }

  await getAccountDb(event).prepare(`
    UPDATE users
    SET avatar_mode = ?, avatar_config = COALESCE(?, avatar_config), updated_at = ?
    WHERE id = ? AND status = 'active'
  `).bind(
    body.mode,
    hasConfig ? JSON.stringify(body.config) : null,
    new Date().toISOString(),
    user.id,
  ).run()

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { avatarMode: body.mode, ...(hasConfig ? { avatarConfig: body.config } : {}) }
})
