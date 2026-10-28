export type WorkspaceMailPermission =
  | 'mail.read'
  | 'mail.write'
  | 'mail.tags.manage'
  | 'mail.send'
  | 'mail.classify'
  | 'mail.trash'
  | 'mail.export'

const accountEndpoints = new Set([
  'GET /api/_auth/session',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/password-reset',
  'POST /api/auth/password-reset/confirm',
  'GET /api/account/session',
  'PATCH /api/account/preferences',
  'PATCH /api/account/avatar',
  'GET /api/account/passkeys',
  'POST /api/account/passkeys/register/options',
  'POST /api/account/passkeys/register/verify',
  'POST /api/account/passkeys/authentication/options',
  'POST /api/account/passkeys/authentication/verify',
  'POST /api/account/passkeys/recovery-codes',
  'DELETE /api/account/passkeys/disable',
  'GET /api/account/workspaces',
  'PATCH /api/account/workspaces/active',
  'GET /api/profile/avatar',
  'POST /api/profile/avatar',
  'DELETE /api/profile/avatar',
  'POST /api/dev/ingest',
  'POST /api/dev/reindex-attachments',
])

export function isAccountEndpoint(path: string, method: string) {
  const normalizedMethod = method.toUpperCase()
  return accountEndpoints.has(`${normalizedMethod} ${path}`)
    || (normalizedMethod === 'DELETE' && /^\/api\/account\/passkeys\/[A-Za-z0-9_-]{1,1024}$/.test(path))
}

export function isPublicInvitationEndpoint(path: string, method: string) {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod === 'GET') return /^\/api\/invitations\/[A-Za-z0-9_-]{43}$/.test(path)
  if (normalizedMethod === 'POST') return /^\/api\/invitations\/[A-Za-z0-9_-]{43}\/accept$/.test(path)
  return false
}

export function isPlatformAdminEndpoint(path: string, method: string) {
  const normalizedMethod = method.toUpperCase()
  if (path === '/api/admin/overview') return normalizedMethod === 'GET'
  if (path === '/api/admin/legacy-forward-deliveries') return normalizedMethod === 'GET'
  if (/^\/api\/admin\/legacy-forward-deliveries\/[0-9a-f-]{36}\/replay$/i.test(path)) return normalizedMethod === 'POST'
  if (path === '/api/admin/blocked-senders') return normalizedMethod === 'DELETE'
  if (path === '/api/admin/platform-admins') return ['GET', 'POST'].includes(normalizedMethod)
  if (/^\/api\/admin\/platform-admins\/[0-9a-f-]{36}$/i.test(path)) return normalizedMethod === 'DELETE'
  if (/^\/api\/admin\/platform-admins\/[0-9a-f-]{36}\/mfa-recovery$/i.test(path)) return normalizedMethod === 'POST'
  if (path === '/api/admin/mailbox-access') return ['GET', 'POST', 'DELETE'].includes(normalizedMethod)
  if (path === '/api/admin/invitations') return normalizedMethod === 'POST'
  if (/^\/api\/admin\/invitations\/[0-9a-f-]{36}$/i.test(path)) return normalizedMethod === 'DELETE'
  if (path === '/api/admin/domains') return normalizedMethod === 'POST'
  if (/^\/api\/admin\/domains\/[^/]+$/.test(path)) return normalizedMethod === 'DELETE'
  if (/^\/api\/admin\/domains\/[^/]+\/(?:challenge|verify)$/.test(path)) return normalizedMethod === 'POST'
  if (/^\/api\/admin\/memberships\/[^/]+$/.test(path)) return normalizedMethod === 'PATCH'
  return false
}

export function permissionFor(path: string, method: string): WorkspaceMailPermission | null {
  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') {
    if (path === '/api/export') return 'mail.export'
    if (path === '/api/messages' || path === '/api/search' || path === '/api/files' || path === '/api/outgoing-drafts'
      || path === '/api/contacts' || path === '/api/contacts/profile' || path === '/api/contacts/suggestions' || path === '/api/contacts/avatars'
      || path === '/api/tags'
      || /^\/api\/contacts\/[0-9a-f-]{36}\/avatar$/i.test(path)
      || path === '/api/activity'
      || /^\/api\/messages\/[^/]+\/draft$/.test(path)
      || /^\/api\/threads\/[^/]+\/attachments\.zip$/.test(path)
      || /^\/api\/(?:attachments\/[^/]+|outgoing-drafts\/[^/]+(?:\/attachments\/[^/]+\/content)?)$/.test(path)) {
      return 'mail.read'
    }
    return null
  }

  if (normalizedMethod === 'POST' && /^\/api\/(?:messages\/[^/]+\/send|outgoing-drafts\/[^/]+\/send)$/.test(path)) return 'mail.send'
  if (normalizedMethod === 'POST' && /^\/api\/messages\/[^/]+\/(?:trash|restore-trash)$/.test(path)) return 'mail.trash'
  if (normalizedMethod === 'PATCH' && path === '/api/threads/bulk-action') return 'mail.write'
  if (normalizedMethod === 'POST' && path === '/api/tags') return 'mail.tags.manage'
  if ((normalizedMethod === 'PATCH' && /^\/api\/tags\/[0-9a-f-]{36}$/i.test(path))
    || (normalizedMethod === 'DELETE' && /^\/api\/tags\/[0-9a-f-]{36}$/i.test(path))) return 'mail.tags.manage'
  if ((normalizedMethod === 'POST' && /^\/api\/messages\/[^/]+\/(?:block-sender|unblock-sender|restore-screener)$/.test(path))
    || (normalizedMethod === 'PATCH' && /^\/api\/messages\/[^/]+\/(?:folder|group-folder|read|reply-later|set-aside)$/.test(path))
    || (normalizedMethod === 'PATCH' && path === '/api/tags/assign')
    || (normalizedMethod === 'PUT' && /^\/api\/messages\/[^/]+\/sender-rule$/.test(path))
    || (normalizedMethod === 'POST' && (
      path === '/api/screener/clear'
      || /^\/api\/sender-rule-changes\/[^/]+\/undo$/.test(path)
      || /^\/api\/activity\/[^/]+\/undo$/.test(path)
      || /^\/api\/activity\/batches\/[^/]+\/undo$/.test(path)
      || /^\/api\/threads\/[^/]+\/mark-unseen$/.test(path)
    ))) {
    return 'mail.classify'
  }
  if ((normalizedMethod === 'PUT' && /^\/api\/messages\/[^/]+\/draft$/.test(path))
    || (normalizedMethod === 'PUT' && (path === '/api/contacts/profile' || /^\/api\/contacts\/[0-9a-f-]{36}\/note$/i.test(path)))
    || (normalizedMethod === 'POST' && (path === '/api/contacts' || path === '/api/contacts/import' || /^\/api\/(?:outgoing-drafts|thread-merges(?:\/split)?)$/.test(path)))
    || (['POST', 'DELETE'].includes(normalizedMethod) && /^\/api\/contacts\/[0-9a-f-]{36}\/avatar$/i.test(path))
    || (['PATCH', 'DELETE'].includes(normalizedMethod) && /^\/api\/outgoing-drafts\/[^/]+$/.test(path))
    || (normalizedMethod === 'POST' && /^\/api\/outgoing-drafts\/[^/]+\/attachments$/.test(path))
    || (normalizedMethod === 'DELETE' && /^\/api\/outgoing-drafts\/[^/]+\/attachments\/[^/]+$/.test(path))
    || (normalizedMethod === 'PATCH' && /^\/api\/threads\/[^/]+\/subject$/.test(path))) {
    return 'mail.write'
  }
  return null
}
