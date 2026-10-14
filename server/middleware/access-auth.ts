import { requireAccessIdentity } from '../utils/access-auth'

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return
  setResponseHeader(event, 'Cache-Control', 'private, no-store')

  // Nuxt Auth Utils owns this endpoint. Cloudflare Access remains enabled at
  // the edge during migration, while this middleware leaves session reads to
  // the module.
  if (event.path === '/api/_auth/session') return

  // These endpoints establish and validate Courrier sessions. They are still
  // protected by Cloudflare Access at the edge for now, but do not depend on
  // an Access identity in application code so the edge can be retired later.
  if ([
    '/api/auth/login',
    '/api/auth/logout',
    '/api/account/session',
    '/api/account/workspaces',
    '/api/account/workspaces/active',
  ].includes(event.path)) return

  const identity = await requireAccessIdentity(event)
  event.context.identity = identity
})
