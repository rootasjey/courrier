import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'courrier-auth-test-'))
const emailTemporaryDirectory = await mkdtemp(path.join('/tmp', 'courrier-email-test-'))
const sessionPassword = 'local-auth-check-only-secret-32-chars-min'
const sessionName = 'courrier-auth-check-session'
const base = `http://127.0.0.1:${await getAvailablePort()}`
const resetToken = 'B'.repeat(43)
const expiredResetToken = 'C'.repeat(43)
const serverLogs = []
let server

function rememberLog(chunk) {
  serverLogs.push(String(chunk))
  while (serverLogs.join('').length > 6000) serverLogs.shift()
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  }
}

async function getAvailablePort() {
  const listener = net.createServer()
  await new Promise((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local test port.')
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
  return address.port
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

async function seedDatabase(configPath, persistPath) {
  const hasher = new Hash(new Scrypt({}))
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 86_400_000).toISOString()
  const invitationToken = 'A'.repeat(43)
  const invitationHash = createHash('sha256').update(invitationToken).digest('hex')
  const resetTokenHash = createHash('sha256').update(resetToken).digest('hex')
  const expiredResetTokenHash = createHash('sha256').update(expiredResetToken).digest('hex')
  const users = [
    ['00000000-0000-4000-8000-000000000101', 'admin@example.test', 'Local Admin', 'local-test-admin-password-001'],
    ['00000000-0000-4000-8000-000000000102', 'member@example.test', 'Local Member', 'local-test-member-password-001'],
    ['00000000-0000-4000-8000-000000000103', 'viewer@example.test', 'Local Viewer', 'local-test-viewer-password-001'],
  ]
  const statements = []

  for (const [id, email, name, password] of users) {
    const passwordHash = await hasher.make(password)
    statements.push(
      `INSERT INTO users (id,email,display_name,status,session_version,created_at,updated_at) VALUES (${sql(id)},${sql(email)},${sql(name)},'active',1,${sql(now)},${sql(now)});`,
      `INSERT INTO password_credentials (user_id,password_hash,created_at,updated_at) VALUES (${sql(id)},${sql(passwordHash)},${sql(now)},${sql(now)});`,
    )
  }

  statements.push(
    `INSERT INTO workspaces (id,name,status,created_at,updated_at) VALUES ('workspace-one','Workspace One','active',${sql(now)},${sql(now)}),('workspace-two','Workspace Two','active',${sql(now)},${sql(now)});`,
    `INSERT INTO workspace_domains (id,workspace_id,domain,verification_status,created_at) VALUES ('domain-alpha','workspace-one','alpha.test','verified',${sql(now)}),('domain-beta','workspace-two','beta.test','verified',${sql(now)});`,
    `INSERT INTO mailboxes (id,workspace_id,domain_id,address,status,created_at) VALUES ('mailbox-a1','workspace-one','domain-alpha','inbox@alpha.test','active',${sql(now)}),('mailbox-a2','workspace-one','domain-alpha','hidden@alpha.test','active',${sql(now)}),('mailbox-b1','workspace-two','domain-beta','other@beta.test','active',${sql(now)});`,
    `INSERT INTO workspace_memberships (id,workspace_id,user_id,role,status,created_at) VALUES ('membership-admin','workspace-one','00000000-0000-4000-8000-000000000101','owner','active',${sql(now)}),('membership-member-one','workspace-one','00000000-0000-4000-8000-000000000102','member','active',${sql(now)}),('membership-member-two','workspace-two','00000000-0000-4000-8000-000000000102','member','active',${sql(later)}),('membership-viewer','workspace-one','00000000-0000-4000-8000-000000000103','viewer','active',${sql(now)});`,
    `INSERT INTO platform_admins (user_id,created_at) VALUES ('00000000-0000-4000-8000-000000000101',${sql(now)});`,
    `INSERT INTO mailbox_access_grants (workspace_id,mailbox_id,user_id,status,created_at) VALUES ('workspace-one','mailbox-a1','00000000-0000-4000-8000-000000000101','active',${sql(now)}),('workspace-one','mailbox-a2','00000000-0000-4000-8000-000000000101','active',${sql(now)}),('workspace-one','mailbox-a1','00000000-0000-4000-8000-000000000102','active',${sql(now)}),('workspace-one','mailbox-a1','00000000-0000-4000-8000-000000000103','active',${sql(now)});`,
    `INSERT INTO messages (id,message_id,envelope_from,envelope_to,sender_name,sender_address,subject,received_at,text_body,raw_object_key,mailbox_domain,folder) VALUES ('message-a1','<message-a1@alpha.test>','sender@external.test','inbox@alpha.test','Allowed Sender','sender@external.test','Allowed mailbox',${sql(now)},'visible','messages/a1.eml','alpha.test','Imbox'),('message-a2','<message-a2@alpha.test>','sender@external.test','hidden@alpha.test','Hidden Sender','sender@external.test','Hidden mailbox',${sql(now)},'hiddenneedle','messages/a2.eml','alpha.test','Imbox'),('message-b1','<message-b1@beta.test>','sender@external.test','other@beta.test','Other Sender','sender@external.test','Other workspace',${sql(now)},'workspace B','messages/b1.eml','beta.test','Imbox');`,
    `INSERT INTO sender_rules (mailbox_domain,sender_address,folder,created_at,updated_at) VALUES ('alpha.test','sender@external.test','The Feed',${sql(now)},${sql(now)});`,
    `INSERT INTO thread_subject_overrides (mailbox_domain,thread_id,subject,updated_at) VALUES ('alpha.test','message-a1','Domain-wide private title',${sql(now)});`,
    `INSERT INTO attachments (id,message_id,filename,mime_type,size_bytes,object_key) VALUES ('attachment-a2','message-a2','hidden.txt','text/plain',6,'attachments/a2.txt'),('attachment-b1','message-b1','other.txt','text/plain',5,'attachments/b1.txt');`,
    `INSERT INTO outgoing_drafts (id,workspace_id,mailbox_id,to_address,subject,text_body,html_body,status,created_at,updated_at) VALUES ('draft-a1','workspace-one','mailbox-a1','recipient@example.test','Allowed draft','Visible draft','<p>Visible draft</p>','draft',${sql(now)},${sql(now)}),('draft-a2','workspace-one','mailbox-a2','recipient@example.test','Hidden draft','Hidden draft','<p>Hidden draft</p>','draft',${sql(now)},${sql(now)}),('draft-b1','workspace-two','mailbox-b1','recipient@example.test','Other workspace draft','Other workspace draft','<p>Other workspace draft</p>','draft',${sql(now)},${sql(now)});`,
    `INSERT INTO outgoing_draft_attachments (id,draft_id,filename,mime_type,size_bytes,object_key,content_id,disposition,created_at) VALUES ('draft-attachment-a2','draft-a2','hidden.png','image/png',12,'draft-attachments/a2.png','hidden-image','inline',${sql(now)});`,
    `INSERT INTO workspace_invitations (id,workspace_id,email,role,token_hash,expires_at,created_by_user_id,created_at) VALUES ('invitation-local','workspace-one','new.member@example.test','member',${sql(invitationHash)},${sql(later)},'00000000-0000-4000-8000-000000000101',${sql(now)});`,
    `INSERT INTO auth_password_reset_tokens (id,user_id,token_hash,created_at,expires_at) VALUES ('reset-local','00000000-0000-4000-8000-000000000102',${sql(resetTokenHash)},${sql(now)},${sql(later)}),('reset-expired','00000000-0000-4000-8000-000000000103',${sql(expiredResetTokenHash)},${sql(now)},datetime('now','-1 hour'));`,
  )

  const seedPath = path.join(temporaryDirectory, 'seed.sql')
  await writeFile(seedPath, `${statements.join('\n')}\n`)
  run(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'DB', '--local', '--persist-to', persistPath,
    '--config', configPath, '--file', seedPath,
  ])
}

async function seedRawMessages(configPath, persistPath) {
  const messages = [
    ['messages/a1.eml', 'Subject: Visible message\r\n\r\nVISIBLE_EXPORT_FIXTURE'],
    ['messages/a2.eml', 'Subject: Hidden mailbox message\r\n\r\nHIDDEN_MAILBOX_EXPORT_FIXTURE'],
    ['messages/b1.eml', 'Subject: Other workspace message\r\n\r\nOTHER_WORKSPACE_EXPORT_FIXTURE'],
  ]
  const wranglerPath = path.join(root, 'node_modules/wrangler/bin/wrangler.js')

  for (const [key, contents] of messages) {
    const filePath = path.join(temporaryDirectory, path.basename(key))
    await writeFile(filePath, contents)
    run(process.execPath, [
      wranglerPath,
      'r2', 'object', 'put', `courrier-auth-test/${key}`,
      '--local', '--persist-to', persistPath,
      '--config', configPath, '--file', filePath,
    ])
  }
}

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Nuxt exited early.\n${serverLogs.join('')}`)
    try {
      const response = await fetch(`${base}/api/account/session`)
      if (response.status === 401) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error(`Nuxt did not become ready.\n${serverLogs.join('')}`)
}

async function request(route, { method = 'GET', cookie = '', body, withOrigin = true, origin = base, readBody = true, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders }
  if (cookie) headers.cookie = cookie
  if (withOrigin) headers.origin = origin
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(new URL(route, base), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = readBody ? await response.text() : ''
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  const setCookies = response.headers.getSetCookie?.() || []
  const cookieHeader = setCookies.map(value => value.split(';', 1)[0]).filter(Boolean).join('; ')
  return { response, data, cookie: cookieHeader || cookie, setCookies }
}

async function protectedApiRoutes() {
  const apiRoot = path.join(root, 'server/api')
  const files = []
  async function walk(directory) {
    for (const entry of await readdir(directory)) {
      const file = path.join(directory, entry)
      if ((await stat(file)).isDirectory()) await walk(file)
      else if (file.endsWith('.ts')) files.push(file)
    }
  }
  await walk(apiRoot)

  const deliberatelyPublic = new Set([
    'POST /api/auth/login',
    'POST /api/auth/logout',
    'POST /api/auth/password-reset',
    'POST /api/auth/password-reset/confirm',
    'POST /api/dev/ingest',
  ])
  return files.flatMap((file) => {
    let route = path.relative(apiRoot, file).split(path.sep).join('/').replace(/\.ts$/, '')
    const suffix = route.match(/\.(get|post|put|patch|delete|head|options)$/)
    if (!suffix) return []
    const method = suffix[1].toUpperCase()
    route = route.slice(0, -suffix[0].length)
    const apiPath = `/api/${route.replace(/\[\.\.\.([^\]]+)\]/g, ':$1').replace(/\[([^\]]+)\]/g, ':$1')}`
    if (deliberatelyPublic.has(`${method} ${apiPath}`)) return []
    if ((method === 'GET' && /^\/api\/invitations\/:token$/.test(apiPath))
      || (method === 'POST' && /^\/api\/invitations\/:token\/accept$/.test(apiPath))) return []
    const samplePath = apiPath
      .replaceAll(':token', 'A'.repeat(43))
      .replaceAll(':attachmentId', 'attachment-test')
      .replaceAll(':id', '00000000-0000-4000-8000-000000000001')
    return [{ method, path: samplePath }]
  }).sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`))
}

let checkCount = 0
async function check(label, action) {
  await action()
  checkCount++
  console.log(`PASS ${checkCount}: ${label}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGINT')
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) {
    // Nuxt's Cloudflare dev runtime may leave a workerd child behind. Run the
    // test server in its own process group so the fallback also closes its
    // inherited stdout/stderr pipes and the test process can exit cleanly.
    try {
      if (process.platform !== 'win32' && server.pid) process.kill(-server.pid, 'SIGKILL')
      else server.kill('SIGKILL')
    } catch {}
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ])
  }
}

try {
  const persistPath = path.join(temporaryDirectory, 'state')
  const configPath = path.join(temporaryDirectory, 'wrangler.jsonc')
  const nuxtLayerPath = path.join(temporaryDirectory, 'nuxt.config.ts')
  const envPath = path.join(temporaryDirectory, '.env')
  await writeFile(configPath, JSON.stringify({
    name: 'courrier-auth-test',
    compatibility_date: '2026-09-28',
    main: path.join(root, '.output/server/index.mjs'),
    d1_databases: [{
      binding: 'DB',
      database_name: 'courrier-auth-test',
      database_id: '00000000-0000-4000-8000-000000000001',
      migrations_dir: path.join(root, 'migrations'),
    }],
    r2_buckets: [{ binding: 'MAIL_STORE', bucket_name: 'courrier-auth-test' }],
    send_email: [{ name: 'EMAIL', allowed_sender_addresses: ['courrier-test@verbatims.cc'] }],
  }, null, 2))
  const isolatedBuildDirectory = path.join(root, '.nuxt-auth-test')
  await writeFile(nuxtLayerPath, `export default defineNuxtConfig({\n  buildDir: ${JSON.stringify(isolatedBuildDirectory)},\n  nitro: { cloudflareDev: {\n    configPath: ${JSON.stringify(configPath)},\n    persistDir: ${JSON.stringify(path.join(persistPath, 'v3'))},\n    silent: true,\n  } },\n})\n`)
  await writeFile(envPath, `NUXT_SESSION_PASSWORD=${sessionPassword}\nNUXT_SESSION_NAME=${sessionName}\n`)

  run(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persistPath,
    '--config', configPath,
  ])
  await seedDatabase(configPath, persistPath)
  await seedRawMessages(configPath, persistPath)

  server = spawn(process.execPath, [
    path.join(root, 'node_modules/@nuxt/cli/bin/nuxi.mjs'),
    'dev', '--no-fork', `--extends=${nuxtLayerPath}`, `--dotenv=${envPath}`,
    '--host', '127.0.0.1', '--port', new URL(base).port,
  ], {
    cwd: root,
    env: {
      ...process.env,
      TMPDIR: emailTemporaryDirectory,
      NUXT_SESSION_PASSWORD: sessionPassword,
      NUXT_SESSION_NAME: sessionName,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  server.stdout.on('data', rememberLog)
  server.stderr.on('data', rememberLog)
  await waitForServer()

  await check('anonymous mail route is rejected and non-cacheable', async () => {
    const result = await request('/api/messages')
    assert.equal(result.response.status, 401)
    assert.match(result.response.headers.get('cache-control') || '', /private.*no-store/)
  })
  await check('Cloudflare Access identity headers cannot impersonate an account session', async () => {
    const result = await request('/api/messages', {
      headers: {
        'cf-access-authenticated-user-email': 'admin@example.test',
        'cf-access-user-id': '00000000-0000-4000-8000-000000000101',
        'cf-access-jwt-assertion': 'forged-test-value',
      },
    })
    assert.equal(result.response.status, 401)
  })
  await check('anonymous account and admin routes are rejected', async () => {
    assert.equal((await request('/api/account/session')).response.status, 401)
    assert.equal((await request('/api/admin/overview')).response.status, 401)
  })
  await check('anonymous requests are rejected on every protected API route', async () => {
    const routes = await protectedApiRoutes()
    assert.ok(routes.length >= 40, `Expected broad API coverage, found ${routes.length} routes.`)
    for (const { method, path: route } of routes) {
      const result = await request(route, { method })
      assert.equal(result.response.status, 401, `${method} ${route} was not rejected anonymously.`)
    }
    console.log(`  Covered ${routes.length} API routes.`)
  })
  await check('login rejects missing and foreign origins', async () => {
    const missingOrigin = await request('/api/auth/login', {
      method: 'POST', withOrigin: false,
      body: { email: 'member@example.test', password: 'local-test-member-password-001' },
    })
    const foreignOrigin = await request('/api/auth/login', {
      method: 'POST', origin: 'https://attacker.example',
      body: { email: 'member@example.test', password: 'local-test-member-password-001' },
    })
    assert.equal(missingOrigin.response.status, 403)
    assert.equal(foreignOrigin.response.status, 403)
  })

  const memberLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'member@example.test', password: 'local-test-member-password-001' },
  })
  assert.equal(memberLogin.response.status, 200, JSON.stringify(memberLogin.data))
  assert.match(memberLogin.cookie, new RegExp(`^${sessionName}=`))
  let memberCookie = memberLogin.cookie
  await check('password login works without any Cloudflare Access identity header', async () => {
    assert.ok(memberCookie)
    assert.match(memberLogin.setCookies.join('; '), /Expires=/)
  })
  await check('password reset request does not reveal whether an address has an account', async () => {
    const known = await request('/api/auth/password-reset', {
      method: 'POST', body: { email: 'member@example.test' },
    })
    const unknown = await request('/api/auth/password-reset', {
      method: 'POST', body: { email: 'unknown@example.test' },
    })
    assert.equal(known.response.status, 200, JSON.stringify(known.data))
    assert.equal(unknown.response.status, 200, JSON.stringify(unknown.data))
    assert.deepEqual(known.data, unknown.data)
    assert.match(known.response.headers.get('cache-control') || '', /private.*no-store/)
    assert.doesNotMatch(serverLogs.join(''), /Password reset email (?:could not be delivered|skipped)/)
  })
  await check('password reset rejects missing origin and expired reset links', async () => {
    assert.equal((await request('/api/auth/password-reset', {
      method: 'POST', withOrigin: false, body: { email: 'member@example.test' },
    })).response.status, 403)
    const expired = await request('/api/auth/password-reset/confirm', {
      method: 'POST', body: { token: expiredResetToken, password: 'replacement-password-at-least-16' },
    })
    assert.equal(expired.response.status, 400)
  })
  await check('password reset consumes its link and immediately revokes existing sessions', async () => {
    const reset = await request('/api/auth/password-reset/confirm', {
      method: 'POST', body: { token: resetToken, password: 'replacement-password-at-least-16' },
    })
    assert.equal(reset.response.status, 200, JSON.stringify(reset.data))
    assert.equal((await request('/api/messages', { cookie: memberCookie })).response.status, 401)
    const replay = await request('/api/auth/password-reset/confirm', {
      method: 'POST', body: { token: resetToken, password: 'another-replacement-at-least-16' },
    })
    assert.equal(replay.response.status, 400)
    assert.equal((await request('/api/auth/login', {
      method: 'POST', body: { email: 'member@example.test', password: 'local-test-member-password-001' },
    })).response.status, 401)
    const newLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: 'member@example.test', password: 'replacement-password-at-least-16' },
    })
    assert.equal(newLogin.response.status, 200, JSON.stringify(newLogin.data))
    memberCookie = newLogin.cookie
  })
  await check('member sees only explicitly granted mailbox messages and drafts', async () => {
    const messages = await request('/api/messages', { cookie: memberCookie })
    assert.equal(messages.response.status, 200, JSON.stringify(messages.data))
    assert.deepEqual(messages.data.map(value => value.id), ['message-a1'])
    const drafts = await request('/api/outgoing-drafts', { cookie: memberCookie })
    assert.equal(drafts.response.status, 200, JSON.stringify(drafts.data))
    assert.deepEqual(drafts.data.map(value => value.id), ['draft-a1'])
  })
  await check('mail export contains only messages from explicitly granted mailboxes', async () => {
    const result = await request('/api/export', { cookie: memberCookie, readBody: false })
    assert.equal(result.response.status, 200)
    assert.match(result.response.headers.get('content-type') || '', /application\/zip/)
    const archive = new TextDecoder().decode(await result.response.arrayBuffer())
    assert.match(archive, /messages\/message-a1\.eml/)
    assert.match(archive, /VISIBLE_EXPORT_FIXTURE/)
    assert.doesNotMatch(archive, /message-a2|message-b1|HIDDEN_MAILBOX_EXPORT_FIXTURE|OTHER_WORKSPACE_EXPORT_FIXTURE/)
  })
  await check('mailbox grants protect search, message mutations, and stored attachments by object id', async () => {
    const search = await request('/api/search?q=hiddenneedle', { cookie: memberCookie })
    assert.equal(search.response.status, 200, JSON.stringify(search.data))
    assert.deepEqual(search.data.results, [])
    assert.equal(search.data.total, 0)

    const hiddenMessage = await request('/api/messages/message-a2/folder', {
      method: 'PATCH', cookie: memberCookie, body: { folder: 'Paper Trail' },
    })
    const otherWorkspaceMessage = await request('/api/messages/message-b1/folder', {
      method: 'PATCH', cookie: memberCookie, body: { folder: 'Paper Trail' },
    })
    assert.equal(hiddenMessage.response.status, 404)
    assert.equal(otherWorkspaceMessage.response.status, 404)

    const hiddenAttachment = await request('/api/attachments/attachment-a2', { cookie: memberCookie })
    const otherWorkspaceAttachment = await request('/api/attachments/attachment-b1', { cookie: memberCookie })
    assert.equal(hiddenAttachment.response.status, 404)
    assert.equal(otherWorkspaceAttachment.response.status, 404)

    assert.equal((await request('/api/outgoing-drafts/draft-a2', { cookie: memberCookie })).response.status, 404)
    assert.equal((await request('/api/outgoing-drafts/draft-b1', { cookie: memberCookie })).response.status, 404)
    const hiddenInlineImage = await request('/api/outgoing-drafts/draft-a2/attachments/draft-attachment-a2/content', { cookie: memberCookie })
    assert.equal(hiddenInlineImage.response.status, 404)
  })
  await check('member cannot access platform admin endpoints', async () => {
    assert.equal((await request('/api/admin/overview', { cookie: memberCookie })).response.status, 403)
  })
  await check('same-site mutation rejects a missing Origin header', async () => {
    const result = await request('/api/account/workspaces/active', {
      method: 'PATCH', cookie: memberCookie, withOrigin: false,
      body: { workspaceId: 'workspace-two' },
    })
    assert.equal(result.response.status, 403)
  })
  await check('membership switch scopes mail to the selected workspace', async () => {
    const switched = await request('/api/account/workspaces/active', {
      method: 'PATCH', cookie: memberCookie, body: { workspaceId: 'workspace-two' },
    })
    assert.equal(switched.response.status, 200, JSON.stringify(switched.data))
    memberCookie = switched.cookie
    assert.equal(switched.data.activeWorkspaceId, 'workspace-two')
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data, [])
    assert.deepEqual((await request('/api/outgoing-drafts', { cookie: memberCookie })).data, [])
    assert.equal((await request('/api/outgoing-drafts/draft-b1', { cookie: memberCookie })).response.status, 404)
  })
  await check('switching back restores only the granted mailbox scope', async () => {
    const switched = await request('/api/account/workspaces/active', {
      method: 'PATCH', cookie: memberCookie, body: { workspaceId: 'workspace-one' },
    })
    assert.equal(switched.response.status, 200)
    memberCookie = switched.cookie
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id), ['message-a1'])
  })
  let viewerCookie = ''
  await check('viewer role can read but cannot classify messages', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'viewer@example.test', password: 'local-test-viewer-password-001' },
    })
    assert.equal(login.response.status, 200)
    viewerCookie = login.cookie
    const messages = await request('/api/messages', { cookie: viewerCookie })
    assert.equal(messages.response.status, 200)
    assert.deepEqual(messages.data.map(value => value.id), ['message-a1'])
    const mutation = await request('/api/messages/message-a1/folder', {
      method: 'PATCH', cookie: viewerCookie, body: { folder: 'Paper Trail' },
    })
    assert.equal(mutation.response.status, 403)
    assert.equal((await request('/api/export', { cookie: viewerCookie })).response.status, 403)
  })
  await check('viewer read and write permissions are enforced across every API route', async () => {
    const routes = await protectedApiRoutes()
    const readableRoutes = routes.filter(({ method, path: route }) => method === 'GET'
      && route !== '/api/export'
      && !route.startsWith('/api/admin/'))
    for (const { path: route } of readableRoutes) {
      const result = await request(route, { cookie: viewerCookie })
      assert.notEqual(result.response.status, 401, `Viewer could not authenticate for GET ${route}.`)
      assert.notEqual(result.response.status, 403, `Viewer was unexpectedly denied read access to GET ${route}.`)
    }

    const writeRoutes = routes.filter(({ method, path: route }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      && !/^\/api\/(?:account|profile|auth|dev|invitations)(?:\/|$)/.test(route))
    for (const { method, path: route } of writeRoutes) {
      const result = await request(route, {
        method,
        cookie: viewerCookie,
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? {} : undefined,
      })
      assert.equal(result.response.status, 403, `Viewer was not denied ${method} ${route}.`)
    }
    assert.equal((await request('/api/admin/overview', { cookie: viewerCookie })).response.status, 403)
    console.log(`  Covered ${readableRoutes.length} viewer reads and ${writeRoutes.length} denied writes.`)
  })
  await check('domain-wide mail metadata is hidden from partial mailbox grants', async () => {
    const visible = await request('/api/messages', { cookie: memberCookie })
    assert.equal(visible.response.status, 200)
    const message = visible.data.find(value => value.id === 'message-a1')
    assert.ok(message)
    assert.equal(message.threadSubject, null)
    assert.equal(message.hasSenderRule, false)
    assert.equal(message.senderRuleFolder, null)

    const titleMutation = await request('/api/threads/message-a1/subject', {
      method: 'PATCH', cookie: memberCookie, body: { subject: 'Unauthorized title' },
    })
    const ruleMutation = await request('/api/messages/message-a1/sender-rule', {
      method: 'PUT', cookie: memberCookie, body: { folder: 'Paper Trail' },
    })
    assert.equal(titleMutation.response.status, 404)
    assert.equal(ruleMutation.response.status, 404)
  })

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@example.test', password: 'local-test-admin-password-001' },
  })
  assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.data))
  const adminCookie = adminLogin.cookie
  await check('full-domain mailbox grants expose the shared sender rule and thread title', async () => {
    const messages = await request('/api/messages', { cookie: adminCookie })
    assert.equal(messages.response.status, 200)
    const message = messages.data.find(value => value.id === 'message-a1')
    assert.ok(message)
    assert.equal(message.threadSubject, 'Domain-wide private title')
    assert.equal(message.hasSenderRule, true)
    assert.equal(message.senderRuleFolder, 'The Feed')
  })
  await check('platform admin can inspect the console without Access headers', async () => {
    const overview = await request('/api/admin/overview', { cookie: adminCookie })
    assert.equal(overview.response.status, 200, JSON.stringify(overview.data))
    assert.match(overview.response.headers.get('cache-control') || '', /private.*no-store/)
    assert.ok(overview.data.audit.some(value => value.action === 'account.password_reset'))
  })
  await check('the last active workspace owner cannot be suspended', async () => {
    const result = await request('/api/admin/memberships/membership-admin', {
      method: 'PATCH', cookie: adminCookie, body: { status: 'suspended' },
    })
    assert.equal(result.response.status, 409, JSON.stringify(result.data))
  })
  await check('reactivating a suspended member requires explicit mailbox re-grants', async () => {
    const suspended = await request('/api/admin/memberships/membership-member-one', {
      method: 'PATCH', cookie: adminCookie, body: { status: 'suspended' },
    })
    assert.equal(suspended.response.status, 200, JSON.stringify(suspended.data))
    assert.equal((await request('/api/messages', { cookie: memberCookie })).response.status, 401)

    const reactivated = await request('/api/admin/memberships/membership-member-one', {
      method: 'PATCH', cookie: adminCookie, body: { status: 'active' },
    })
    assert.equal(reactivated.response.status, 200, JSON.stringify(reactivated.data))
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data, [])

    const grant = await request('/api/admin/mailbox-access', {
      method: 'POST', cookie: adminCookie,
      body: { mailboxId: 'mailbox-a1', userId: '00000000-0000-4000-8000-000000000102' },
    })
    assert.equal(grant.response.status, 200, JSON.stringify(grant.data))
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id), ['message-a1'])
  })
  await check('admin grant and revoke take effect immediately for a member session', async () => {
    const target = { mailboxId: 'mailbox-a2', userId: '00000000-0000-4000-8000-000000000102' }
    const grant = await request('/api/admin/mailbox-access', { method: 'POST', cookie: adminCookie, body: target })
    assert.equal(grant.response.status, 200, JSON.stringify(grant.data))
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id).sort(), ['message-a1', 'message-a2'])
    const revoke = await request('/api/admin/mailbox-access', { method: 'DELETE', cookie: adminCookie, body: target })
    assert.equal(revoke.response.status, 200, JSON.stringify(revoke.data))
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id), ['message-a1'])
  })

  const invitationToken = 'A'.repeat(43)
  await check('public invite preview works for its exact bearer token', async () => {
    const invite = await request(`/api/invitations/${invitationToken}`)
    assert.equal(invite.response.status, 200, JSON.stringify(invite.data))
    assert.equal(invite.data.email, 'new.member@example.test')
    assert.match(invite.response.headers.get('referrer-policy') || '', /no-referrer/)
  })
  await check('invite acceptance creates a session without granting mailbox access', async () => {
    const accepted = await request(`/api/invitations/${invitationToken}/accept`, {
      method: 'POST',
      body: { displayName: 'New Member', password: 'local-test-invited-password-001' },
    })
    assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data))
    assert.match(accepted.cookie, new RegExp(`^${sessionName}=`))
    const session = await request('/api/account/session', { cookie: accepted.cookie })
    assert.equal(session.response.status, 200, JSON.stringify(session.data))
    assert.equal(session.data.user.email, 'new.member@example.test')
    assert.deepEqual((await request('/api/messages', { cookie: accepted.cookie })).data, [])
  })
  await check('invitation token is single use', async () => {
    const accepted = await request(`/api/invitations/${invitationToken}/accept`, {
      method: 'POST', body: { displayName: 'Again', password: 'local-test-invited-password-002' },
    })
    assert.equal(accepted.response.status, 404)
  })
  await check('repeated invalid passwords trigger a temporary login lockout', async () => {
    for (let attempt = 0; attempt < 7; attempt++) {
      const rejected = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'member@example.test', password: 'incorrect-local-test-password' },
      })
      assert.equal(rejected.response.status, 401)
    }
    const locked = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'member@example.test', password: 'incorrect-local-test-password' },
    })
    assert.equal(locked.response.status, 429, JSON.stringify(locked.data))
    assert.match(locked.response.headers.get('retry-after') || '', /^\d+$/)

    const correctPasswordDuringLockout = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'member@example.test', password: 'local-test-member-password-001' },
    })
    assert.equal(correctPasswordDuringLockout.response.status, 429)
  })
  await check('logout clears the browser session', async () => {
    const result = await request('/api/auth/logout', { method: 'POST', cookie: memberCookie })
    assert.equal(result.response.status, 200)
    assert.equal((await request('/api/messages', { cookie: result.cookie })).response.status, 401)
  })

  console.log(`Completed ${checkCount} local auth/authorization integration checks.`)
} catch (error) {
  console.error(error)
  if (serverLogs.length) console.error(serverLogs.join(''))
  process.exitCode = 1
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGINT')
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ])
    if (server.exitCode === null) {
      try {
        if (process.platform !== 'win32' && server.pid) process.kill(-server.pid, 'SIGKILL')
        else server.kill('SIGKILL')
      } catch {}
      await Promise.race([
        new Promise(resolve => server.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ])
    }
    server.stdout?.destroy()
    server.stderr?.destroy()
  }
  await rm(path.join(root, '.nuxt-auth-test'), { recursive: true, force: true })
  await rm(emailTemporaryDirectory, { recursive: true, force: true })
  await rm(temporaryDirectory, { recursive: true, force: true })
}
