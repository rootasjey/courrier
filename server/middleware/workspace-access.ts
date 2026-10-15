import {
  assertSameOrigin,
  requirePlatformAdmin,
  requireWorkspacePermission,
} from '../utils/account-auth'
import {
  isAccountEndpoint,
  isPlatformAdminEndpoint,
  isPublicInvitationEndpoint,
  permissionFor,
} from '../utils/workspace-access-policy'

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const path = event.path.split('?')[0]!.replace(/\/$/, '') || '/'
  const method = getMethod(event)
  if (isAccountEndpoint(path, method)) return
  if (isPublicInvitationEndpoint(path, method)) {
    if (method === 'POST') assertSameOrigin(event)
    return
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) assertSameOrigin(event)

  if (path.startsWith('/api/admin/')) {
    if (isPlatformAdminEndpoint(path, method)) {
      await requirePlatformAdmin(event)
      return
    }
    throw createError({ statusCode: 403, statusMessage: 'Cette route d’administration n’est pas ouverte.' })
  }

  const permission = permissionFor(path, method)
  if (!permission) throw createError({ statusCode: 403, statusMessage: 'Cette route API n’est pas ouverte aux comptes Courrier.' })
  await requireWorkspacePermission(event, permission)
})
