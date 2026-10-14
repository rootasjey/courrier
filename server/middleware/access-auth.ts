import { requireAccessIdentity } from '../utils/access-auth'

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  // Nuxt Auth Utils owns this endpoint. Cloudflare Access remains enabled at
  // the edge during migration, while this middleware leaves session reads to
  // the module.
  if (event.path === '/api/_auth/session') return

  const identity = await requireAccessIdentity(event)
  event.context.identity = identity
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
})
