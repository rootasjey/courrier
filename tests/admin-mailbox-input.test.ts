import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminMailboxInputError, parseAdminMailboxPayload } from '../server/utils/admin-mailbox-input.ts'

const domainId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'

test('normalizes the mailbox local part and user IDs while preserving the domain ID', () => {
  assert.deepEqual(parseAdminMailboxPayload({ domainId: domainId.toUpperCase(), localPart: ' Support.Team ', userIds: [userId.toUpperCase()] }), {
    domainId: domainId.toUpperCase(),
    localPart: 'support.team',
    userIds: [userId],
  })
  assert.equal(parseAdminMailboxPayload({ domainId: 'domain-alpha', localPart: 'support', userIds: [userId] }).domainId, 'domain-alpha')
})

test('rejects invalid domains, mailbox local parts, and member selections', () => {
  const invalidPayloads = [
    { domainId: '', localPart: 'support', userIds: [userId] },
    { domainId: `invalid${String.fromCharCode(1)}domain`, localPart: 'support', userIds: [userId] },
    { domainId, localPart: '.support', userIds: [userId] },
    { domainId, localPart: 'support..team', userIds: [userId] },
    { domainId, localPart: 'support/team', userIds: [userId] },
    { domainId, localPart: 'support', userIds: [] },
    { domainId, localPart: 'support', userIds: [userId, userId] },
    { domainId, localPart: 'support', userIds: ['invalid'] },
    { domainId, localPart: 'support', userIds: Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`) },
  ]

  for (const payload of invalidPayloads) {
    assert.throws(() => parseAdminMailboxPayload(payload), AdminMailboxInputError)
  }
})
