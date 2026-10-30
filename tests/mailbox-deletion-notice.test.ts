import assert from 'node:assert/strict'
import test from 'node:test'
import { mailboxDeletionNotice } from '../app/utils/mailbox-deletion-notice.ts'

test('adds the manual Cloudflare cleanup warning after a successful mailbox deletion', () => {
  assert.equal(
    mailboxDeletionNotice('manual_required', 'Mailbox box@example.test and its data were deleted.', 'Remove its Cloudflare rule manually.'),
    'Mailbox box@example.test and its data were deleted. Remove its Cloudflare rule manually.',
  )
})

test('does not show a Cloudflare warning when cleanup succeeded or no rule existed', () => {
  const deletedNotice = 'Mailbox box@example.test and its data were deleted.'
  const warning = 'Remove its Cloudflare rule manually.'

  assert.equal(mailboxDeletionNotice('removed', deletedNotice, warning), deletedNotice)
  assert.equal(mailboxDeletionNotice('missing', deletedNotice, warning), deletedNotice)
})
