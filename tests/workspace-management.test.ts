import assert from 'node:assert/strict'
import test from 'node:test'
import { requireFreshWorkspaceMfa } from '../server/utils/workspace-management.ts'

type ErrorOptions = { statusCode: number, statusMessage: string, data?: { code: string } }

function installErrorStub() {
  const target = globalThis as unknown as Record<string, unknown>
  const previous = target.createError
  target.createError = (options: ErrorOptions) => Object.assign(new Error(options.statusMessage), options)
  return () => {
    if (previous === undefined) delete target.createError
    else target.createError = previous
  }
}

function makeEvent(factorCount: number, mfaVerifiedAt = 0) {
  const target = globalThis as unknown as Record<string, unknown>
  const previous = target.requireUserSession
  target.requireUserSession = async () => ({ secure: { mfaVerifiedAt } })
  const statement = {
    bind() { return this },
    async first() { return { count: factorCount } },
  }
  const event = {
    context: {
      cloudflare: {
        env: { DB: { prepare() { return statement } } },
      },
    },
  }
  return {
    event,
    restore() {
      if (previous === undefined) delete target.requireUserSession
      else target.requireUserSession = previous
    },
  }
}

async function assertMfaRequiredCode(factorCount: number) {
  const restoreError = installErrorStub()
  const { event, restore } = makeEvent(factorCount)
  try {
    await assert.rejects(
      requireFreshWorkspaceMfa(event as never, 'user-1'),
      error => {
        const value = error as { statusCode?: number, data?: { code?: string } }
        return value.statusCode === 403 && value.data?.code === 'mfa_required'
      },
    )
  } finally {
    restore()
    restoreError()
  }
}

test('workspace MFA failures carry a stable machine-readable code when no factor is configured', async () => {
  await assertMfaRequiredCode(0)
})

test('workspace MFA failures carry a stable machine-readable code when the step-up has expired', async () => {
  await assertMfaRequiredCode(1)
})
