import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkspaceInvitation, normalizeInvitationEmail } from '../server/utils/workspace-invitations.ts'

type PreparedStatement = {
  query: string
  values: unknown[]
  bind: (...values: unknown[]) => PreparedStatement
  first: <T>() => Promise<T | null>
  all: <T>() => Promise<{ results: T[] }>
  run: () => Promise<unknown>
}

function createFakeDatabase(insertChanges = 1) {
  const statements: PreparedStatement[] = []
  const database = {
    prepare(query: string): PreparedStatement {
      const statement: PreparedStatement = {
        query,
        values: [],
        bind(...values) {
          statement.values = values
          return statement
        },
        async first<T>() {
          if (query.includes('FROM workspaces WHERE')) {
            return { id: 'workspace-1', name: 'Workspace One' } as T
          }
          return null
        },
        async all<T>() {
          return { results: [] as T[] }
        },
        async run() {
          return { meta: { changes: 1 } }
        },
      }
      statements.push(statement)
      return statement
    },
    async batch(batchStatements: PreparedStatement[]) {
      assert.equal(batchStatements.length, 3)
      return [{ meta: { changes: 0 } }, { meta: { changes: insertChanges } }, { meta: { changes: insertChanges } }]
    },
  }
  return { database, statements }
}

test('normalizes invitation addresses and rejects malformed values', () => {
  assert.equal(normalizeInvitationEmail('  JEREMIE@Example.test  '), 'jeremie@example.test')
  assert.equal(normalizeInvitationEmail('not an address'), null)
  assert.equal(normalizeInvitationEmail(`a${'x'.repeat(250)}@example.test`), null)
  assert.equal(normalizeInvitationEmail(null), null)
})

test('workspace invitations recheck manager access in the D1 insert and send through the bound email stub', async () => {
  const previous = globalThis as unknown as Record<string, unknown>
  const oldCreateError = previous.createError
  const oldGetCookie = previous.getCookie
  const oldGetRequestURL = previous.getRequestURL
  previous.createError = (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options)
  previous.getCookie = () => 'en'
  previous.getRequestURL = () => new URL('https://courrier.example/')

  const { database, statements } = createFakeDatabase()
  const sent: unknown[] = []
  const event = {
    context: {
      cloudflare: {
        env: {
          DB: database,
          EMAIL: { send: async (message: unknown) => { sent.push(message) } },
        },
      },
    },
  }
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'owner@example.test',
    displayName: 'Owner',
    sessionVersion: 1,
  }

  try {
    const result = await createWorkspaceInvitation(
      event as never,
      actor,
      'workspace-1',
      'invitee@example.test',
      'admin',
      { requireWorkspaceManager: true },
    )

    assert.equal(result.workspaceId, 'workspace-1')
    assert.equal(result.email, 'invitee@example.test')
    assert.equal(result.role, 'admin')
    assert.match(result.invitationId, /^[0-9a-f-]{36}$/i)
    assert.equal(sent.length, 1)
    assert.match((sent[0] as { text: string }).text, /workspace administrator/u)

    const insert = statements.find(statement => statement.query.includes('INSERT INTO workspace_invitations'))
    assert.ok(insert)
    assert.match(insert.query, /JOIN role_permissions rp/u)
    assert.match(insert.query, /actor_membership\.status = 'active'/u)
    assert.deepEqual(insert.values.slice(-4), [1, 'workspace-1', actor.id, 'admin'])
  } finally {
    if (oldCreateError === undefined) delete previous.createError
    else previous.createError = oldCreateError
    if (oldGetCookie === undefined) delete previous.getCookie
    else previous.getCookie = oldGetCookie
    if (oldGetRequestURL === undefined) delete previous.getRequestURL
    else previous.getRequestURL = oldGetRequestURL
  }
})

test('workspace invitations fail closed when the actor loses owner access before insert', async () => {
  const previous = globalThis as unknown as Record<string, unknown>
  const oldCreateError = previous.createError
  previous.createError = (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options)

  const { database } = createFakeDatabase(0)
  let sent = false
  const event = {
    context: {
      cloudflare: {
        env: {
          DB: database,
          EMAIL: { send: async () => { sent = true } },
        },
      },
    },
  }
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@example.test',
    displayName: 'Admin',
    sessionVersion: 1,
  }

  try {
    await assert.rejects(
      createWorkspaceInvitation(event as never, actor, 'workspace-1', 'invitee@example.test', 'admin', { requireWorkspaceManager: true }),
      error => (error as { statusCode?: number }).statusCode === 403,
    )
    assert.equal(sent, false)
  } finally {
    if (oldCreateError === undefined) delete previous.createError
    else previous.createError = oldCreateError
  }
})
