import {
  assertSameOrigin,
  requirePlatformAdmin,
  requireWorkspacePermission,
  type WorkspaceMailPermission,
} from '../utils/account-auth'

function permissionFor(path: string, method: string): WorkspaceMailPermission | null {
  if (method === 'GET' || method === 'HEAD') {
    if (path === '/api/export') return 'mail.export'
    if (path === '/api/messages' || path === '/api/search' || path === '/api/outgoing-drafts'
      || /^\/api\/messages\/[^/]+\/draft$/.test(path)
      || /^\/api\/(?:attachments\/[^/]+|outgoing-drafts\/[^/]+(?:\/attachments\/[^/]+\/content)?)$/.test(path)) {
      return 'mail.read'
    }
    return null
  }

  if (/^\/api\/(?:messages\/[^/]+\/send|outgoing-drafts\/[^/]+\/send)$/.test(path)) return 'mail.send'
  if (/^\/api\/messages\/[^/]+\/(?:trash|restore-trash)$/.test(path)) return 'mail.trash'
  if (path === '/api/threads/bulk-action') return 'mail.write'
  if (/^\/api\/(?:messages\/[^/]+\/(?:block-sender|unblock-sender|folder|group-folder|read|reply-later|restore-screener|restore-trash|sender-rule|set-aside)|screener\/clear|sender-rule-changes\/[^/]+\/undo)$/.test(path)) {
    return 'mail.classify'
  }
  if (/^\/api\/(?:messages\/[^/]+\/draft|outgoing-drafts(?:\/[^/]+(?:\/attachments(?:\/[^/]+)?)?)?|thread-merges(?:\/split)?|threads\/[^/]+\/subject)$/.test(path)) {
    return 'mail.write'
  }
  return null
}

const accountEndpoints = new Set([
  '/api/_auth/session',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/account/session',
  '/api/account/workspaces',
  '/api/account/workspaces/active',
  '/api/profile/avatar',
  '/api/dev/ingest',
])

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return
  const path = event.path.split('?')[0]!.replace(/\/$/, '') || '/'
  if (accountEndpoints.has(path)) return

  const method = getMethod(event)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) assertSameOrigin(event)

  if (path.startsWith('/api/admin/')) {
    if (path === '/api/admin/overview' && method === 'GET') {
      await requirePlatformAdmin(event)
      return
    }
    throw createError({ statusCode: 403, statusMessage: 'Cette route d’administration n’est pas ouverte.' })
  }

  const permission = permissionFor(path, method)
  if (!permission) throw createError({ statusCode: 403, statusMessage: 'Cette route API n’est pas ouverte aux comptes Courrier.' })
  await requireWorkspacePermission(event, permission)
})
