import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { protectedApiRoutes } from '../scripts/lib/protected-api-routes.mjs'

test('protectedApiRoutes excludes deliberate public routes and samples dynamic routes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'courrier-api-routes-'))
  try {
    const files = [
      'auth/login.post.ts',
      'auth/password-reset.post.ts',
      'admin/blocked-senders/unblock.post.ts',
      'admin/legacy-forward-deliveries/[id]/replay.post.ts',
      'dev/ingest.post.ts',
      'dev/reindex-attachments.post.ts',
      'invitations/[token].get.ts',
      'invitations/[token]/accept.post.ts',
      'messages/[id].get.ts',
      'messages/index.get.ts',
      'account/profile/avatar/[...path].put.ts',
      'not-a-route.ts',
    ]
    for (const relativePath of files) {
      const file = path.join(root, relativePath)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, 'export default () => null\n')
    }

    assert.deepEqual(await protectedApiRoutes(root), [
      { method: 'GET', path: '/api/messages' },
      { method: 'GET', path: '/api/messages/00000000-0000-4000-8000-000000000001' },
      { method: 'POST', path: '/api/admin/blocked-senders/unblock' },
      { method: 'POST', path: `/api/admin/legacy-forward-deliveries/${'a'.repeat(64)}/replay` },
      { method: 'PUT', path: '/api/account/profile/avatar/:path' },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
