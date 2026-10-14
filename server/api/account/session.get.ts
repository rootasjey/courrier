import { requireAccountUser } from '../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = await requireAccountUser(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    activeWorkspaceId: user.activeWorkspaceId,
  }
})
