import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const DELIBERATELY_PUBLIC = new Set([
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/password-reset',
  'POST /api/auth/password-reset/confirm',
  'POST /api/dev/ingest',
  'POST /api/dev/reindex-attachments',
])

export async function protectedApiRoutes(apiRoot) {
  const files = []
  async function walk(directory) {
    for (const entry of await readdir(directory)) {
      const file = path.join(directory, entry)
      if ((await stat(file)).isDirectory()) await walk(file)
      else if (file.endsWith('.ts')) files.push(file)
    }
  }
  await walk(apiRoot)

  return files.flatMap((file) => {
    let route = path.relative(apiRoot, file).split(path.sep).join('/').replace(/\.ts$/, '')
    const suffix = route.match(/\.(get|post|put|patch|delete|head|options)$/)
    if (!suffix) return []
    const method = suffix[1].toUpperCase()
    route = route.slice(0, -suffix[0].length)
    route = route.replace(/(^|\/)index$/u, '$1').replace(/\/$/u, '')
    const apiPath = `/api/${route.replace(/\[\.\.\.([^\]]+)\]/g, ':$1').replace(/\[([^\]]+)\]/g, ':$1')}`
    if (DELIBERATELY_PUBLIC.has(`${method} ${apiPath}`)) return []
    if ((method === 'GET' && /^\/api\/invitations\/:token$/.test(apiPath))
      || (method === 'POST' && /^\/api\/invitations\/:token\/accept$/.test(apiPath))) return []
    const sampleId = apiPath.startsWith('/api/admin/legacy-forward-deliveries/')
      ? 'a'.repeat(64)
      : '00000000-0000-4000-8000-000000000001'
    const samplePath = apiPath
      .replaceAll(':token', 'A'.repeat(43))
      .replaceAll(':attachmentId', 'attachment-test')
      .replaceAll(':credentialId', 'passkey-test')
      .replaceAll(':userId', '00000000-0000-4000-8000-000000000102')
      .replaceAll(':id', sampleId)
    return [{ method, path: samplePath }]
  }).sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`))
}
