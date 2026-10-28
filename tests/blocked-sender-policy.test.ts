import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canUnblockSender } from '../server/utils/blocked-sender-policy.ts'

test('only the block creator or an administrator can remove an attributed block', () => {
  assert.equal(canUnblockSender('creator', 'creator', false), true)
  assert.equal(canUnblockSender('other-member', 'creator', false), false)
  assert.equal(canUnblockSender('admin', 'creator', true), true)
  assert.equal(canUnblockSender('member', null, false), true)
})
