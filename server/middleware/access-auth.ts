import { requireAccessIdentity } from '../utils/access-auth'

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const identity = await requireAccessIdentity(event)
  event.context.identity = identity
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
})
