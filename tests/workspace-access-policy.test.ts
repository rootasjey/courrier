import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import {
  isAccountEndpoint,
  isPlatformAdminEndpoint,
  isPublicInvitationEndpoint,
  permissionFor,
} from '../server/utils/workspace-access-policy.ts'

type Route = { method: string, path: string, file: string }

function apiRoutes() {
  const root = join(process.cwd(), 'server/api')
  const files: string[] = []
  function walk(directory: string) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith('.ts')) files.push(path)
    }
  }
  walk(root)

  return files.flatMap((file): Route[] => {
    let route = relative(root, file).split(sep).join('/').replace(/\.ts$/, '')
    const suffix = route.match(/\.(get|post|put|patch|delete|head|options)$/)
    if (!suffix) return []
    const method = suffix[1]!.toUpperCase()
    route = route.slice(0, -suffix[0].length)
    route = route.replace(/(^|\/)index$/u, '$1').replace(/\/$/u, '')
    const path = `/api/${route.replace(/\[\.\.\.([^\]]+)\]/g, ':$1').replace(/\[([^\]]+)\]/g, ':$1')}`
    return [{ method, path, file }]
  })
}

function examplePath(path: string) {
  return path
    .replaceAll(':token', 'A'.repeat(43))
    .replaceAll(':attachmentId', 'attachment-test')
    .replaceAll(':credentialId', 'passkey-test')
    .replaceAll(':userId', '00000000-0000-4000-8000-000000000001')
    .replaceAll(':id', '00000000-0000-4000-8000-000000000001')
}

test('every API route has an explicit account, invitation, admin, or mailbox policy', () => {
  const uncovered = apiRoutes().filter(({ method, path }) => {
    const candidate = examplePath(path)
    return !(
      isAccountEndpoint(candidate, method)
      || isPublicInvitationEndpoint(candidate, method)
      || isPlatformAdminEndpoint(candidate, method)
      || permissionFor(candidate, method)
    )
  })

  assert.deepEqual(uncovered.map(route => `${route.method} ${route.path} (${route.file})`), [])
})

test('account and invitation exceptions are limited to exact methods', () => {
  assert.equal(isAccountEndpoint('/api/auth/login', 'POST'), true)
  assert.equal(isAccountEndpoint('/api/auth/login', 'GET'), false)
  assert.equal(isAccountEndpoint('/api/profile/avatar', 'DELETE'), true)
  assert.equal(isAccountEndpoint('/api/profile/avatar', 'PUT'), false)
  assert.equal(isAccountEndpoint('/api/account/passkeys', 'GET'), true)
  assert.equal(isAccountEndpoint('/api/account/passkeys/disable', 'DELETE'), true)
  assert.equal(isAccountEndpoint('/api/account/passkeys/passkey-test', 'DELETE'), true)
  assert.equal(isAccountEndpoint('/api/account/passkeys/passkey-test', 'POST'), false)

  const token = 'A'.repeat(43)
  assert.equal(isPublicInvitationEndpoint(`/api/invitations/${token}`, 'GET'), true)
  assert.equal(isPublicInvitationEndpoint(`/api/invitations/${token}/accept`, 'POST'), true)
  assert.equal(isPublicInvitationEndpoint(`/api/invitations/${token}`, 'POST'), false)
  assert.equal(isPublicInvitationEndpoint(`/api/invitations/${token}/accept`, 'GET'), false)
})

test('platform administration routes fail closed for unlisted paths and methods', () => {
  assert.equal(isPlatformAdminEndpoint('/api/admin/overview', 'GET'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/overview', 'POST'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/blocked-senders', 'DELETE'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/blocked-senders', 'GET'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins', 'GET'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins', 'POST'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins/00000000-0000-4000-8000-000000000001', 'DELETE'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins/00000000-0000-4000-8000-000000000001/mfa-recovery', 'POST'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins/00000000-0000-4000-8000-000000000001/mfa-recovery', 'DELETE'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins/invalid/mfa-recovery', 'POST'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins/invalid', 'DELETE'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/platform-admins', 'DELETE'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/users', 'GET'), false)
  assert.equal(isPlatformAdminEndpoint('/api/admin/domains/domain-1/verify', 'POST'), true)
  assert.equal(isPlatformAdminEndpoint('/api/admin/domains/domain-1/verify', 'GET'), false)
})

test('mail permissions are method-specific and unknown endpoints are denied', () => {
  assert.equal(permissionFor('/api/messages', 'GET'), 'mail.read')
  assert.equal(permissionFor('/api/contacts/profile', 'GET'), 'mail.read')
  assert.equal(permissionFor('/api/contacts/profile', 'PUT'), 'mail.write')
  assert.equal(permissionFor('/api/contacts/00000000-0000-4000-8000-000000000001/note', 'PUT'), 'mail.write')
  assert.equal(permissionFor('/api/contacts/profile', 'DELETE'), null)
  assert.equal(permissionFor('/api/export', 'GET'), 'mail.export')
  assert.equal(permissionFor('/api/outgoing-drafts/draft-1/send', 'POST'), 'mail.send')
  assert.equal(permissionFor('/api/messages/message-1/trash', 'POST'), 'mail.trash')
  assert.equal(permissionFor('/api/messages/message-1/folder', 'PATCH'), 'mail.classify')
  assert.equal(permissionFor('/api/messages/message-1/folder', 'POST'), null)
  assert.equal(permissionFor('/api/messages/message-1/send', 'DELETE'), null)
  assert.equal(permissionFor('/api/unlisted', 'GET'), null)
})
