import { assertSameOrigin, getAccountDb, requireSessionIdentity } from '../../utils/account-auth'

const themeModes = new Set(['system', 'light', 'dark'])
const themeNames = new Set([
  'paper',
  'forest',
  'graphite',
  'lavender',
  'ayu',
  'one-dark-pro',
  'synthwave',
  'shades-purple',
  'min',
])

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const user = await requireSessionIdentity(event)
  const body = await readBody<{ themeMode?: unknown, themeName?: unknown }>(event)

  if (typeof body?.themeMode !== 'string' || !themeModes.has(body.themeMode)
    || typeof body?.themeName !== 'string' || !themeNames.has(body.themeName)) {
    throw createError({ statusCode: 400, statusMessage: 'Préférences d’apparence invalides.' })
  }

  await getAccountDb(event).prepare(
    'UPDATE users SET theme_mode = ?, theme_name = ?, updated_at = ? WHERE id = ? AND status = \'active\'',
  ).bind(body.themeMode, body.themeName, new Date().toISOString(), user.id).run()

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { themeMode: body.themeMode, themeName: body.themeName }
})
