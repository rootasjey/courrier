import assert from 'node:assert/strict'
import { test } from 'node:test'
import { workspaceDomainScope } from '../server/utils/account-auth.ts'

const testUserId = '00000000-0000-4000-8000-000000000001'

test('workspace domain scopes accept only the supported domain columns', () => {
  assert.match(workspaceDomainScope('messages.mailbox_domain', testUserId), /lower\(messages\.mailbox_domain\)/)
  assert.match(workspaceDomainScope('workspace_domains.domain', testUserId), /lower\(workspace_domains\.domain\)/)
  assert.throws(() => workspaceDomainScope('messages.subject', testUserId), /Invalid mailbox-domain SQL column/)
  assert.throws(() => workspaceDomainScope('messages.mailbox_domain) OR 1=1 --', testUserId), /Invalid mailbox-domain SQL column/)
})
