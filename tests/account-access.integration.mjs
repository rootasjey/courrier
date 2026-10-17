import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { protectedApiRoutes } from '../scripts/lib/protected-api-routes.mjs'

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
    ['00000000-0000-4000-8000-000000000104', 'workspace-admin@example.test', 'Workspace Admin', 'local-test-workspace-admin-password-001'],
    ['00000000-0000-4000-8000-000000000107', 'platform-only-admin@example.test', 'Platform Only Admin', 'local-test-platform-only-admin-password-001'],
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
    `INSERT INTO workspace_memberships (id,workspace_id,user_id,role,status,created_at) VALUES ('membership-admin','workspace-one','00000000-0000-4000-8000-000000000101','owner','active',${sql(now)}),('membership-member-one','workspace-one','00000000-0000-4000-8000-000000000102','member','active',${sql(now)}),('membership-member-two','workspace-two','00000000-0000-4000-8000-000000000102','member','active',${sql(later)}),('membership-viewer','workspace-one','00000000-0000-4000-8000-000000000103','viewer','active',${sql(now)}),('membership-workspace-admin','workspace-two','00000000-0000-4000-8000-000000000104','admin','active',${sql(now)});`,
    `INSERT INTO users (id,email,display_name,status,session_version,created_at,updated_at) VALUES ('00000000-0000-4000-8000-000000000105','pending@example.test','Pending Account','pending',1,${sql(now)},${sql(now)}),('00000000-0000-4000-8000-000000000106','suspended-admin@example.test','Suspended Admin','suspended',1,${sql(now)},${sql(now)});`,
    `INSERT INTO platform_admins (user_id,created_at,created_by_user_id) VALUES ('00000000-0000-4000-8000-000000000101',${sql(now)},NULL),('00000000-0000-4000-8000-000000000106',${sql(now)},'00000000-0000-4000-8000-000000000101'),('00000000-0000-4000-8000-000000000107',${sql(now)},'00000000-0000-4000-8000-000000000101');`,
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
      const response = await fetch(`${base}/api/account/session`, {
        signal: AbortSignal.timeout(2_000),
      })
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
    signal: AbortSignal.timeout(30_000),
  })
  const text = readBody ? await response.text() : ''
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  const setCookies = response.headers.getSetCookie?.() || []
  const cookieHeader = setCookies.map(value => value.split(';', 1)[0]).filter(Boolean).join('; ')
  return { response, data, cookie: cookieHeader || cookie, setCookies }
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
    const routes = await protectedApiRoutes(path.join(root, 'server/api'))
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
  await check('hidden ids cannot mutate drafts, replies, attachments, or bulk actions; sending requires its mailbox grant', async () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'attempted change' }] }] }
    const hiddenDraftPatch = await request('/api/outgoing-drafts/draft-a2', {
      method: 'PATCH', cookie: memberCookie,
      body: { to: 'recipient@example.test', subject: 'Changed', content },
    })
    assert.equal(hiddenDraftPatch.response.status, 404)
    assert.deepEqual((await request('/api/outgoing-drafts/draft-a2', { method: 'DELETE', cookie: memberCookie })).data, { deleted: false })
    assert.equal((await request('/api/outgoing-drafts/draft-a2/attachments', { method: 'POST', cookie: memberCookie })).response.status, 404)
    assert.deepEqual((await request('/api/outgoing-drafts/draft-a2/attachments/draft-attachment-a2', {
      method: 'DELETE', cookie: memberCookie,
    })).data, { deleted: false })
    const deniedSend = await request('/api/outgoing-drafts/draft-a1/send', { method: 'POST', cookie: memberCookie })
    assert.equal(deniedSend.response.status, 403)

    const hiddenReply = await request('/api/messages/message-a2/draft', { cookie: memberCookie })
    assert.equal(hiddenReply.response.status, 204)
    assert.equal((await request('/api/messages/message-a2/draft', {
      method: 'PUT', cookie: memberCookie, body: { textBody: 'attempted reply' },
    })).response.status, 404)

    const hiddenBulkAction = await request('/api/threads/bulk-action', {
      method: 'PATCH', cookie: memberCookie,
      body: { threadIds: ['message-a2'], source: 'Imbox', action: 'mark-seen' },
    })
    assert.equal(hiddenBulkAction.response.status, 404)
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
    const routes = await protectedApiRoutes(path.join(root, 'server/api'))
    const readableRoutes = routes.filter(({ method, path: route }) => method === 'GET'
      && route !== '/api/export'
      && route !== '/api/account/passkeys'
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
  await check('workspace administrators do not receive platform administration rights', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'workspace-admin@example.test', password: 'local-test-workspace-admin-password-001' },
    })
    assert.equal(login.response.status, 200)
    assert.equal((await request('/api/admin/platform-admins', { cookie: login.cookie })).response.status, 403)
    assert.equal((await request('/api/admin/platform-admins', {
      method: 'POST', cookie: login.cookie, body: { userId: '00000000-0000-4000-8000-000000000103' },
    })).response.status, 403)
    assert.equal((await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000101', {
      method: 'DELETE', cookie: login.cookie,
    })).response.status, 403)
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
  let adminCookie = adminLogin.cookie
  await check('platform administrators can exist without mailbox or workspace access', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'platform-only-admin@example.test', password: 'local-test-platform-only-admin-password-001' },
    })
    assert.equal(login.response.status, 200, JSON.stringify(login.data))

    const session = await request('/api/account/session', { cookie: login.cookie })
    assert.equal(session.response.status, 200)
    assert.equal(session.data.isPlatformAdmin, true)
    assert.equal(session.data.activeWorkspaceId, null)
    assert.equal(session.data.requiresAdminMfa, true)
    assert.equal(session.data.adminMfaConfigured, false)

    const workspaces = await request('/api/account/workspaces', { cookie: login.cookie })
    assert.equal(workspaces.response.status, 200)
    assert.deepEqual(workspaces.data.workspaces, [])
    assert.notEqual((await request('/api/messages', { cookie: login.cookie })).response.status, 200)
    assert.equal((await request('/api/admin/overview', { cookie: login.cookie })).response.status, 403)

    const setup = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: login.cookie,
      body: { label: 'Platform-only first key', password: 'local-test-platform-only-admin-password-001' },
    })
    assert.equal(setup.response.status, 200, JSON.stringify(setup.data))
    assert.ok(setup.data.options.challenge)
  })
  await check('platform administrators without a configured factor are denied administration', async () => {
    const session = await request('/api/account/session', { cookie: adminCookie })
    assert.equal(session.response.status, 200)
    assert.equal(session.data.requiresAdminMfa, true)
    assert.equal(session.data.adminMfaConfigured, false)
    assert.equal(session.data.adminMfaVerified, false)
    assert.equal((await request('/api/admin/overview', { cookie: adminCookie })).response.status, 403)
    assert.equal((await request('/api/admin/platform-admins', { cookie: adminCookie })).response.status, 403)
  })
  let firstFactorAttemptId = ''
  await check('first passkey enrollment requires password confirmation', async () => {
    const missingPassword = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: adminCookie, body: { label: 'First local key', password: '' },
    })
    assert.equal(missingPassword.response.status, 400)
    const authorized = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: adminCookie,
      body: { label: 'First local key', password: 'local-test-admin-password-001' },
    })
    assert.equal(authorized.response.status, 200, JSON.stringify(authorized.data))
    assert.ok(authorized.data.options.challenge)
    assert.ok(authorized.data.attemptId)
    firstFactorAttemptId = authorized.data.attemptId
  })

  const adminBootstrapCode = '0A1B-2C3D-4E5F-6071-8293-A4B5-C6D7-E8F9'
  const adminBootstrapHash = createHash('sha256').update(adminBootstrapCode.replaceAll('-', '')).digest('hex')
  const adminRecoveryCode = '8F65-E1B0-1324-6C77-D99A-00A2-B3F1-4D5C'
  const adminRecoveryHash = createHash('sha256').update(adminRecoveryCode.replaceAll('-', '')).digest('hex')
  const secondAdminRecoveryCode = '1A2B-3C4D-5E6F-7081-92A3-B4C5-D6E7-F809'
  const secondAdminRecoveryHash = createHash('sha256').update(secondAdminRecoveryCode.replaceAll('-', '')).digest('hex')
  const bootstrapSeedPath = path.join(temporaryDirectory, 'admin-bootstrap-mfa-seed.sql')
  await writeFile(bootstrapSeedPath, `
    INSERT INTO auth_mfa_recovery_codes (id,user_id,code_hash,created_at)
    VALUES ('local-admin-bootstrap','00000000-0000-4000-8000-000000000101','${adminBootstrapHash}',datetime('now')),
      ('local-admin-recovery','00000000-0000-4000-8000-000000000101','${adminRecoveryHash}',datetime('now')),
      ('local-admin-recovery-second','00000000-0000-4000-8000-000000000101','${secondAdminRecoveryHash}',datetime('now'));
  `)
  run(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
    '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', bootstrapSeedPath,
  ])
  await check('configured platform administrators still need a fresh security check', async () => {
    const session = await request('/api/account/session', { cookie: adminCookie })
    assert.equal(session.data.adminMfaConfigured, true)
    assert.equal(session.data.adminMfaVerified, false)
    assert.equal((await request('/api/admin/overview', { cookie: adminCookie })).response.status, 403)
  })
  await check('passkey enrollment requires step-up when only recovery codes are configured', async () => {
    const result = await request('/api/account/passkeys/register/verify', {
      method: 'POST', cookie: adminCookie, body: { attemptId: firstFactorAttemptId, response: {} },
    })
    assert.equal(result.response.status, 403)
    assert.match(result.data.statusMessage, /facteur de sécurité existant/u)
  })
  const bootstrapVerification = await request('/api/account/passkeys/authentication/verify', {
    method: 'POST', cookie: adminCookie, body: { recoveryCode: adminBootstrapCode },
  })
  assert.equal(bootstrapVerification.response.status, 200, JSON.stringify(bootstrapVerification.data))
  adminCookie = bootstrapVerification.cookie

  await check('full-domain mailbox grants expose the shared sender rule and thread title', async () => {
    const messages = await request('/api/messages', { cookie: adminCookie })
    assert.equal(messages.response.status, 200)
    const message = messages.data.find(value => value.id === 'message-a1')
    assert.ok(message)
    assert.equal(message.threadSubject, 'Domain-wide private title')
    assert.equal(message.hasSenderRule, true)
    assert.equal(message.senderRuleFolder, 'The Feed')

    const hiddenDraft = await request('/api/outgoing-drafts/draft-a2', { cookie: adminCookie })
    assert.equal(hiddenDraft.response.status, 200)
    assert.equal(hiddenDraft.data.subject, 'Hidden draft')
    assert.deepEqual(hiddenDraft.data.attachments.map(attachment => attachment.id), ['draft-attachment-a2'])
    const hiddenMessage = messages.data.find(value => value.id === 'message-a2')
    assert.ok(hiddenMessage)
    assert.equal(hiddenMessage.isRead, false)
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

  await check('members can view their own MFA settings and begin first passkey enrollment', async () => {
    const memberPasskeys = await request('/api/account/passkeys', { cookie: memberCookie })
    assert.equal(memberPasskeys.response.status, 200, JSON.stringify(memberPasskeys.data))
    assert.deepEqual(memberPasskeys.data.passkeys, [])
    assert.equal(memberPasskeys.data.recoveryCodesRemaining, 0)
    const missingPassword = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: memberCookie, body: { label: 'Member first key', password: '' },
    })
    assert.equal(missingPassword.response.status, 400)
    const registration = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: memberCookie,
      body: { label: 'Member first key', password: 'replacement-password-at-least-16' },
    })
    assert.equal(registration.response.status, 200, JSON.stringify(registration.data))
    assert.ok(registration.data.options.challenge)
    const result = await request('/api/account/passkeys', { cookie: adminCookie })
    assert.equal(result.response.status, 200, JSON.stringify(result.data))
    assert.deepEqual(result.data.passkeys, [])
    assert.match(result.response.headers.get('cache-control') || '', /private.*no-store/)
  })
  const mfaSeedPath = path.join(temporaryDirectory, 'admin-mfa-seed.sql')
  await writeFile(mfaSeedPath, `
    INSERT INTO auth_passkeys (credential_id,user_id,public_key,counter,transports_json,device_type,backed_up,label,created_at)
    VALUES ('dGVzdC1jcmVkZW50aWFs','00000000-0000-4000-8000-000000000101','AA',0,'[]','singleDevice',0,'Local test key',datetime('now'));
  `)
  run(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
    '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', mfaSeedPath,
  ])
  await check('a fresh password login cannot reuse an earlier admin step-up', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST', body: { email: 'admin@example.test', password: 'local-test-admin-password-001' },
    })
    assert.equal(login.response.status, 200)
    const session = await request('/api/account/session', { cookie: login.cookie })
    assert.equal(session.response.status, 200)
    assert.equal(session.data.requiresAdminMfa, true)
    assert.equal(session.data.adminMfaConfigured, true)
    assert.equal(session.data.hasPasskeys, true)
    assert.equal(session.data.adminMfaVerified, false)
    assert.equal((await request('/api/admin/overview', { cookie: login.cookie })).response.status, 403)
  })
  await check('recovery codes are one-time and establish an admin step-up', async () => {
    const verification = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: adminCookie, body: { recoveryCode: adminRecoveryCode.toLowerCase() },
    })
    assert.equal(verification.response.status, 200, JSON.stringify(verification.data))
    adminCookie = verification.cookie
    const session = await request('/api/account/session', { cookie: adminCookie })
    assert.equal(session.data.adminMfaVerified, true)
    const overview = await request('/api/admin/overview', { cookie: adminCookie })
    assert.equal(overview.response.status, 200)
    assert.ok(overview.data.audit.some(value => value.action === 'account.mfa_recovery_code_used'))
    const replay = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: adminCookie, body: { recoveryCode: adminRecoveryCode },
    })
    assert.equal(replay.response.status, 401)
  })
  await check('platform admin changes require an active account, protect self-revocation, and preserve mailbox grants', async () => {
    const list = await request('/api/admin/platform-admins', { cookie: adminCookie })
    assert.equal(list.response.status, 200, JSON.stringify(list.data))
    assert.match(list.response.headers.get('cache-control') || '', /private.*no-store/)
    assert.deepEqual(list.data.admins.map(value => value.user_id), [
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000107',
      '00000000-0000-4000-8000-000000000106',
    ])
    assert.ok(list.data.candidates.some(value => value.user_id === '00000000-0000-4000-8000-000000000104'))
    assert.ok(!list.data.candidates.some(value => value.user_id === '00000000-0000-4000-8000-000000000101'))
    assert.ok(!list.data.candidates.some(value => ['00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000106'].includes(value.user_id)))

    const pendingGrant = await request('/api/admin/platform-admins', {
      method: 'POST', cookie: adminCookie, body: { userId: '00000000-0000-4000-8000-000000000105' },
    })
    assert.equal(pendingGrant.response.status, 409)
    const suspendedRevoke = await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000106', {
      method: 'DELETE', cookie: adminCookie,
    })
    assert.equal(suspendedRevoke.response.status, 200, JSON.stringify(suspendedRevoke.data))

    const missingOrigin = await request('/api/admin/platform-admins', {
      method: 'POST', cookie: adminCookie, body: { userId: '00000000-0000-4000-8000-000000000102' }, withOrigin: false,
    })
    assert.equal(missingOrigin.response.status, 403)
    const selfGrant = await request('/api/admin/platform-admins', {
      method: 'POST', cookie: adminCookie, body: { userId: '00000000-0000-4000-8000-000000000101' },
    })
    assert.equal(selfGrant.response.status, 409)
    const selfRevoke = await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000101', {
      method: 'DELETE', cookie: adminCookie,
    })
    assert.equal(selfRevoke.response.status, 409)

    const before = await request('/api/messages', { cookie: memberCookie })
    assert.deepEqual(before.data.map(value => value.id), ['message-a1'])
    const grant = await request('/api/admin/platform-admins', {
      method: 'POST', cookie: adminCookie, body: { userId: '00000000-0000-4000-8000-000000000102' },
    })
    assert.equal(grant.response.status, 200, JSON.stringify(grant.data))
    assert.ok((await request('/api/account/session', { cookie: memberCookie })).data.requiresAdminMfa)
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id), ['message-a1'])
    assert.equal((await request('/api/admin/overview', { cookie: memberCookie })).response.status, 403)

    const duplicate = await request('/api/admin/platform-admins', {
      method: 'POST', cookie: adminCookie, body: { userId: '00000000-0000-4000-8000-000000000102' },
    })
    assert.equal(duplicate.response.status, 409)
    const revoke = await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000102', {
      method: 'DELETE', cookie: adminCookie,
    })
    assert.equal(revoke.response.status, 200, JSON.stringify(revoke.data))
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id), ['message-a1'])
    const audit = await request('/api/admin/overview', { cookie: adminCookie })
    assert.ok(audit.data.audit.some(value => value.action === 'platform_admin.granted' && value.target_id === '00000000-0000-4000-8000-000000000102'))
    assert.ok(audit.data.audit.some(value => value.action === 'platform_admin.revoked' && value.target_id === '00000000-0000-4000-8000-000000000102'))
  })
  await check('a freshly verified platform admin can recover another admin and revoke their old factors and sessions', async () => {
    const targetId = '00000000-0000-4000-8000-000000000107'
    const targetEmail = 'platform-only-admin@example.test'
    const fakeRecoveryHash = createHash('sha256').update('FAKE-RECOVERY-CODE-FOR-TESTS').digest('hex')
    const recoverySeedPath = path.join(temporaryDirectory, 'second-admin-recovery-seed.sql')
    await writeFile(recoverySeedPath, [
      'INSERT INTO auth_passkeys (credential_id,user_id,public_key,counter,transports_json,device_type,backed_up,label,created_at) VALUES (\'c2Vjb25kLWFkbWluLXRlc3Q=\',' + sql(targetId) + ',\'AA\',0,\'[]\',\'singleDevice\',0,\'Synthetic second-admin key\',datetime(\'now\'));',
      'INSERT INTO auth_mfa_recovery_codes (id,user_id,code_hash,created_at) VALUES (\'second-admin-test-code\',' + sql(targetId) + ',' + sql(fakeRecoveryHash) + ',datetime(\'now\'));',
      'INSERT INTO auth_webauthn_challenges (attempt_id,user_id,session_version,purpose,challenge,created_at,expires_at) VALUES (\'second-admin-pending-challenge\',' + sql(targetId) + ',1,\'admin_step_up\',\'synthetic-challenge\',datetime(\'now\'),datetime(\'now\',\'+10 minutes\'));',
      'INSERT INTO auth_webauthn_challenges (attempt_id,user_id,session_version,purpose,challenge,created_at,expires_at) VALUES (\'second-admin-login-challenge\',' + sql(targetId) + ',1,\'account_login\',\'synthetic-login-challenge\',datetime(\'now\'),datetime(\'now\',\'+10 minutes\'));',
    ].join('\n'))
    run(process.execPath, [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
      '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', recoverySeedPath,
    ])

    const staleActorSession = await request('/api/admin/platform-admins/' + targetId + '/mfa-recovery', {
      method: 'POST', cookie: adminLogin.cookie, body: { confirmationEmail: targetEmail },
    })
    assert.equal(staleActorSession.response.status, 403)
    const memberAttempt = await request('/api/admin/platform-admins/' + targetId + '/mfa-recovery', {
      method: 'POST', cookie: memberCookie, body: { confirmationEmail: targetEmail },
    })
    assert.equal(memberAttempt.response.status, 403)
    const selfAttempt = await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000101/mfa-recovery', {
      method: 'POST', cookie: adminCookie, body: { confirmationEmail: 'admin@example.test' },
    })
    assert.equal(selfAttempt.response.status, 409)
    const unknownTarget = await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000199/mfa-recovery', {
      method: 'POST', cookie: adminCookie, body: { confirmationEmail: 'nobody@example.test' },
    })
    assert.equal(unknownTarget.response.status, 404)
    const suspendedTarget = await request('/api/admin/platform-admins/00000000-0000-4000-8000-000000000106/mfa-recovery', {
      method: 'POST', cookie: adminCookie, body: { confirmationEmail: 'suspended-admin@example.test' },
    })
    assert.equal(suspendedTarget.response.status, 409)
    const wrongConfirmation = await request('/api/admin/platform-admins/' + targetId + '/mfa-recovery', {
      method: 'POST', cookie: adminCookie, body: { confirmationEmail: 'someone-else@example.test' },
    })
    assert.equal(wrongConfirmation.response.status, 400)

    const targetLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: targetEmail, password: 'local-test-platform-only-admin-password-001' },
    })
    assert.equal(targetLogin.response.status, 200)
    assert.equal((await request('/api/account/session', { cookie: targetLogin.cookie })).response.status, 200)

    const missingConfirmation = await request('/api/admin/platform-admins/' + targetId + '/mfa-recovery', {
      method: 'POST', cookie: adminCookie, body: {},
    })
    assert.equal(missingConfirmation.response.status, 400)
    const invalidated = await request('/api/account/session', { cookie: targetLogin.cookie })
    assert.equal(invalidated.response.status, 200)

    const recovery = await request('/api/admin/platform-admins/' + targetId + '/mfa-recovery', {
      method: 'POST', cookie: adminCookie, body: { confirmationEmail: targetEmail.toUpperCase() },
    })
    assert.equal(recovery.response.status, 200, JSON.stringify(recovery.data))
    assert.equal(recovery.data.recovered, true)
    assert.equal(recovery.data.reauthenticationRequired, true)
    assert.equal((await request('/api/account/session', { cookie: targetLogin.cookie })).response.status, 401)
    assert.equal((await request('/api/admin/overview', { cookie: targetLogin.cookie })).response.status, 403)

    const admins = await request('/api/admin/platform-admins', { cookie: adminCookie })
    assert.equal(admins.response.status, 200)
    assert.ok(admins.data.admins.some(value => value.user_id === targetId && value.user_status === 'active'))
    const newTargetLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: targetEmail, password: 'local-test-platform-only-admin-password-001' },
    })
    assert.equal(newTargetLogin.response.status, 200)
    const newTargetSession = await request('/api/account/session', { cookie: newTargetLogin.cookie })
    assert.equal(newTargetSession.response.status, 200)
    assert.equal(newTargetSession.data.isPlatformAdmin, true)
    assert.equal(newTargetSession.data.adminMfaConfigured, false)
    assert.equal((await request('/api/admin/overview', { cookie: newTargetLogin.cookie })).response.status, 403)
    const factors = await request('/api/account/passkeys', { cookie: newTargetLogin.cookie })
    assert.equal(factors.response.status, 200)
    assert.deepEqual(factors.data.passkeys, [])
    assert.equal(factors.data.recoveryCodesRemaining, 0)
    const reEnrollment = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: newTargetLogin.cookie,
      body: { label: 'Recovered synthetic admin key', password: 'local-test-platform-only-admin-password-001' },
    })
    assert.equal(reEnrollment.response.status, 200, JSON.stringify(reEnrollment.data))
    for (const attemptId of ['second-admin-pending-challenge', 'second-admin-login-challenge']) {
      const staleChallenge = await request('/api/account/passkeys/authentication/verify', {
        method: 'POST', cookie: newTargetLogin.cookie, body: { attemptId, response: {} },
      })
      assert.equal(staleChallenge.response.status, 400)
      assert.match(staleChallenge.data.statusMessage, /expiré ou a déjà été utilisée/u)
    }

    const overview = await request('/api/admin/overview', { cookie: adminCookie })
    const recoveryAudit = overview.data.audit.find(value => value.action === 'platform_admin.mfa_recovered_by_admin' && value.target_id === targetId)
    assert.ok(recoveryAudit)
    const auditDetails = await request('/api/admin/overview', { cookie: adminCookie })
    const serializedAudit = JSON.stringify(auditDetails.data.audit.find(value => value.action === 'platform_admin.mfa_recovered_by_admin' && value.target_id === targetId))
    assert.doesNotMatch(serializedAudit, /FAKE-RECOVERY-CODE|synthetic-challenge|c2Vjb25kLWFkbWluLXRlc3Q=/u)
  })
  await check('removing a passkey revokes every session and admin step-up', async () => {
    const secondPasskeyPath = path.join(temporaryDirectory, 'second-admin-passkey.sql')
    await writeFile(secondPasskeyPath, `
      INSERT INTO auth_passkeys (credential_id,user_id,public_key,counter,transports_json,device_type,backed_up,label,created_at)
      VALUES ('dGVzdC1jcmVkZW50aWFsLTI','00000000-0000-4000-8000-000000000101','AA',0,'[]','singleDevice',0,'Second test key',datetime('now'));
    `)
    run(process.execPath, [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
      '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', secondPasskeyPath,
    ])
    const otherLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: 'admin@example.test', password: 'local-test-admin-password-001' },
    })
    assert.equal(otherLogin.response.status, 200)
    let otherAdminCookie = otherLogin.cookie
    const otherStepUp = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: otherAdminCookie, body: { recoveryCode: secondAdminRecoveryCode },
    })
    assert.equal(otherStepUp.response.status, 200, JSON.stringify(otherStepUp.data))
    otherAdminCookie = otherStepUp.cookie
    assert.equal((await request('/api/account/session', { cookie: otherAdminCookie })).response.status, 200)
    assert.equal((await request('/api/account/session', { cookie: otherAdminCookie })).data.adminMfaVerified, true)
    assert.equal((await request('/api/admin/overview', { cookie: otherAdminCookie })).response.status, 200)
    const removed = await request('/api/account/passkeys/dGVzdC1jcmVkZW50aWFsLTI', { method: 'DELETE', cookie: adminCookie })
    assert.equal(removed.response.status, 200, JSON.stringify(removed.data))
    assert.equal(removed.data.requiresReauthentication, true)
    assert.equal((await request('/api/account/session', { cookie: adminCookie })).response.status, 401)
    assert.equal((await request('/api/account/session', { cookie: otherAdminCookie })).response.status, 401)
  })
  await check('admin MFA verification is not carried into a fresh password login', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST', body: { email: 'admin@example.test', password: 'local-test-admin-password-001' },
    })
    assert.equal(login.response.status, 200)
    adminCookie = login.cookie
    const session = await request('/api/account/session', { cookie: adminCookie })
    assert.equal(session.data.requiresAdminMfa, true)
    assert.equal(session.data.adminMfaVerified, false)
    assert.equal((await request('/api/admin/overview', { cookie: adminCookie })).response.status, 403)
  })
  await check('an admin with a pending login step-up cannot register a passkey', async () => {
    const attemptId = 'Q'.repeat(43)
    const challengePath = path.join(temporaryDirectory, 'expired-admin-step-up.sql')
    await writeFile(challengePath, `
      INSERT INTO auth_webauthn_challenges
        (attempt_id,user_id,session_version,purpose,challenge,label,created_at,expires_at)
      VALUES (
        '${attemptId}',
        '00000000-0000-4000-8000-000000000101',
        (SELECT session_version FROM users WHERE id = '00000000-0000-4000-8000-000000000101'),
        'register','test-challenge','Second passkey',datetime('now'),datetime('now','+5 minutes')
      );
    `)
    run(process.execPath, [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
      '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', challengePath,
    ])
    const result = await request('/api/account/passkeys/register/verify', {
      method: 'POST', cookie: adminCookie, body: { attemptId, response: {} },
    })
    assert.equal(result.response.status, 403)
    assert.match(result.data.statusMessage, /terminer la connexion/u)
    const replay = await request('/api/account/passkeys/register/verify', {
      method: 'POST', cookie: adminCookie, body: { attemptId, response: {} },
    })
    assert.equal(replay.response.status, 403)
  })
  await check('WebAuthn challenges are one-use and malformed assertions fail closed', async () => {
    const options = await request('/api/account/passkeys/authentication/options', { method: 'POST', cookie: adminCookie })
    assert.equal(options.response.status, 200, JSON.stringify(options.data))
    assert.equal(options.data.options.userVerification, 'required')
    assert.equal(options.data.options.rpId, '127.0.0.1')
    const body = {
      attemptId: options.data.attemptId,
      response: { id: 'dGVzdC1jcmVkZW50aWFs', rawId: 'dGVzdC1jcmVkZW50aWFs', type: 'public-key', response: {} },
    }
    const firstUse = await request('/api/account/passkeys/authentication/verify', { method: 'POST', cookie: adminCookie, body })
    const replay = await request('/api/account/passkeys/authentication/verify', { method: 'POST', cookie: adminCookie, body })
    assert.equal(firstUse.response.status, 401)
    assert.equal(replay.response.status, 400)
  })

  const memberMfaCode = 'ABC1-2345-6789-ABCD-EF01-2345-6789-ABCD'
  const memberMfaSecondCode = 'DCBA-9876-5432-10FE-DCBA-9876-5432-10FE'
  const memberMfaSeedPath = path.join(temporaryDirectory, 'member-mfa-seed.sql')
  await writeFile(memberMfaSeedPath, `
    UPDATE users SET session_version = session_version + 1
    WHERE id = '00000000-0000-4000-8000-000000000102';
    INSERT INTO auth_mfa_recovery_codes (id,user_id,code_hash,created_at)
    VALUES
      ('local-member-mfa-first','00000000-0000-4000-8000-000000000102','${createHash('sha256').update(memberMfaCode.replaceAll('-', '')).digest('hex')}',datetime('now')),
      ('local-member-mfa-second','00000000-0000-4000-8000-000000000102','${createHash('sha256').update(memberMfaSecondCode.replaceAll('-', '')).digest('hex')}',datetime('now'));
  `)
  run(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
    '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', memberMfaSeedPath,
  ])
  await check('member MFA is enforced after password login and gates account APIs until verified', async () => {
    assert.equal((await request('/api/messages', { cookie: memberCookie })).response.status, 401)
    const login = await request('/api/auth/login', {
      method: 'POST', body: { email: 'member@example.test', password: 'replacement-password-at-least-16' },
    })
    assert.equal(login.response.status, 200, JSON.stringify(login.data))
    memberCookie = login.cookie
    const session = await request('/api/account/session', { cookie: memberCookie })
    assert.equal(session.response.status, 200)
    assert.equal(session.data.isPlatformAdmin, false)
    assert.equal(session.data.mfaConfigured, true)
    assert.equal(session.data.mfaPending, true)
    assert.equal(session.data.mfaVerified, false)
    assert.equal((await request('/api/messages', { cookie: memberCookie })).response.status, 403)
    assert.equal((await request('/api/account/passkeys', { cookie: memberCookie })).response.status, 403)
    assert.equal((await request('/api/admin/overview', { cookie: memberCookie })).response.status, 403)
  })
  await check('a recovery code completes member login and remains limited to that account', async () => {
    const verification = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: memberCookie, body: { recoveryCode: memberMfaCode.toLowerCase() },
    })
    assert.equal(verification.response.status, 200, JSON.stringify(verification.data))
    memberCookie = verification.cookie
    const session = await request('/api/account/session', { cookie: memberCookie })
    assert.equal(session.data.mfaPending, false)
    assert.equal(session.data.mfaVerified, true)
    assert.equal(session.data.recoveryCodesRemaining, 1)
    assert.deepEqual((await request('/api/messages', { cookie: memberCookie })).data.map(value => value.id), ['message-a1'])
    assert.equal((await request('/api/admin/overview', { cookie: memberCookie })).response.status, 403)
    const replay = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: memberCookie, body: { recoveryCode: memberMfaCode },
    })
    assert.equal(replay.response.status, 401)
  })
  await check('members can rotate and explicitly disable optional MFA with fresh verification', async () => {
    const rotated = await request('/api/account/passkeys/recovery-codes', { method: 'POST', cookie: memberCookie })
    assert.equal(rotated.response.status, 200, JSON.stringify({ status: rotated.response.status }))
    assert.equal(rotated.data.recoveryCodes.length, 10)
    const rotationCookie = memberCookie
    memberCookie = rotated.cookie
    const disabled = await request('/api/account/passkeys/disable', { method: 'DELETE', cookie: memberCookie })
    assert.equal(disabled.response.status, 200, JSON.stringify(disabled.data))
    assert.equal(disabled.data.requiresReauthentication, true)
    assert.equal((await request('/api/account/session', { cookie: memberCookie })).response.status, 401)
    assert.equal((await request('/api/account/session', { cookie: rotationCookie })).response.status, 401)
    const passwordLogin = await request('/api/auth/login', {
      method: 'POST', body: { email: 'member@example.test', password: 'replacement-password-at-least-16' },
    })
    assert.equal(passwordLogin.response.status, 200)
    memberCookie = passwordLogin.cookie
    const session = await request('/api/account/session', { cookie: memberCookie })
    assert.equal(session.data.mfaConfigured, false)
    assert.equal(session.data.mfaPending, false)
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
  await check('consuming the final recovery code requires factor re-enrollment before administration', async () => {
    const finalCode = '9A8B-7C6D-5E4F-3021-9182-7364-5A6B-4C3D'
    const finalCodeHash = createHash('sha256').update(finalCode.replaceAll('-', '')).digest('hex')
    const finalFactorPath = path.join(temporaryDirectory, 'final-admin-recovery-factor.sql')
    await writeFile(finalFactorPath, `
      DELETE FROM auth_passkeys WHERE user_id = '00000000-0000-4000-8000-000000000101';
      UPDATE auth_mfa_recovery_codes SET used_at = datetime('now')
      WHERE user_id = '00000000-0000-4000-8000-000000000101' AND used_at IS NULL;
      INSERT INTO auth_mfa_recovery_codes (id,user_id,code_hash,created_at)
      VALUES ('local-admin-final-recovery','00000000-0000-4000-8000-000000000101','${finalCodeHash}',datetime('now'));
    `)
    run(process.execPath, [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1', 'execute', 'DB', '--local', '--persist-to', path.join(temporaryDirectory, 'state'),
      '--config', path.join(temporaryDirectory, 'wrangler.jsonc'), '--file', finalFactorPath,
    ])
    const verification = await request('/api/account/passkeys/authentication/verify', {
      method: 'POST', cookie: adminCookie, body: { recoveryCode: finalCode },
    })
    assert.equal(verification.response.status, 200, JSON.stringify(verification.data))
    const session = await request('/api/account/session', { cookie: verification.cookie })
    assert.equal(session.data.adminMfaConfigured, false)
    assert.equal(session.data.adminMfaVerified, false)
    const overview = await request('/api/admin/overview', { cookie: verification.cookie })
    assert.equal(overview.response.status, 403)
    const replacementPasskey = await request('/api/account/passkeys/register/options', {
      method: 'POST', cookie: verification.cookie,
      body: { label: 'Replacement passkey', password: 'local-test-admin-password-001' },
    })
    assert.equal(replacementPasskey.response.status, 200, JSON.stringify(replacementPasskey.data))
    assert.ok(replacementPasskey.data.options.challenge)
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
