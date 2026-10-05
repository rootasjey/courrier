import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createMailboxExportManifest } from '../server/utils/mailbox-export.ts'
import { createZipStream } from '../server/utils/zip-stream.ts'
import { inspectArchive } from '../scripts/restore-mailbox.mjs'

function fixtureData(rawEmail: string) {
  const id = createHash('sha256').update(rawEmail).digest('hex')
  return {
    id,
    rawEmail,
    manifest: createMailboxExportManifest({
      messages: [{
        id,
        message_id: '<restore@example.test>',
        envelope_from: 'sender@example.test',
        envelope_to: 'me@example.test',
        sender_name: 'Sender',
        sender_address: 'sender@example.test',
        subject: 'Restore test',
        sent_at: '2026-10-04T10:00:00.000Z',
        received_at: '2026-10-04T10:01:00.000Z',
        in_reply_to: null,
        references_header: null,
        raw_object_key: `messages/${id}/original.eml`,
        mailbox_domain: 'example.test',
        folder: 'Imbox',
        screener_state: 'cleared',
        is_read: 1,
        is_set_aside: 0,
        is_reply_later: 0,
        is_outgoing: 0,
        trashed_at: null,
      }],
      attachments: [],
      senderRules: [],
      blockedSenders: [],
      senderRuleChanges: [],
      senderRuleChangeMessages: [],
      senderRuleChangeMerges: [],
      drafts: [],
      threadMerges: [],
      threadMergeMembers: [],
    }, new Date('2026-10-04T10:02:00.000Z')),
  }
}

async function writeArchive(directory: string, manifest: unknown, records: Array<{ id: string; rawEmail: string }>) {
  const entries = async function* () {
    yield { name: 'README.txt', body: new TextEncoder().encode('Courrier export fixture') }
    yield { name: 'manifest.json', body: new TextEncoder().encode(JSON.stringify(manifest)) }
    for (const record of records) {
      yield { name: `messages/${record.id}.eml`, body: new TextEncoder().encode(record.rawEmail) }
    }
  }
  const archive = await new Response(createZipStream(entries(), new Date('2026-10-04T10:02:00.000Z'))).arrayBuffer()
  const archivePath = path.join(directory, 'courrier-export.zip')
  await writeFile(archivePath, new Uint8Array(archive))
  return archivePath
}

const message = [
  'From: Sender <sender@example.test>',
  'To: me@example.test',
  'Subject: Restore test',
  'Message-ID: <restore@example.test>',
  'Date: Sun, 04 Oct 2026 10:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'A test message for the restore preflight.',
].join('\r\n')

test('v2 manifest preserves the complete mailbox-state collections', () => {
  const fixture = fixtureData(message)
  assert.equal(fixture.manifest.version, 2)
  assert.equal(fixture.manifest.messages[0]?.is_read, true)
  assert.equal(fixture.manifest.messages[0]?.is_outgoing, false)
  assert.deepEqual(Object.keys(fixture.manifest).slice(4), [
    'senderRules', 'blockedSenders', 'senderRuleChanges', 'senderRuleChangeMessages',
    'senderRuleChangeMerges', 'drafts', 'threadMerges', 'threadMergeMembers',
  ])
})

test('v2 manifest keeps attachment indices in numeric order', () => {
  const fixture = fixtureData(message)
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `${fixture.id}-${index}`,
    message_id: fixture.id,
    object_key: `messages/${fixture.id}/attachments/${index}`,
  })).reverse()
  const manifest = createMailboxExportManifest({
    messages: fixture.manifest.messages,
    attachments: rows,
    senderRules: [],
    blockedSenders: [],
    senderRuleChanges: [],
    senderRuleChangeMessages: [],
    senderRuleChangeMerges: [],
    drafts: [],
    threadMerges: [],
    threadMergeMembers: [],
  })

  assert.deepEqual(manifest.messages[0]?.attachments.map(attachment => attachment.id), rows
    .map(attachment => attachment.id)
    .reverse())
})

test('inspect validates a Courrier v2 archive and its message hash', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'courrier-export-test-'))
  try {
    const fixture = fixtureData(message)
    const archivePath = await writeArchive(directory, fixture.manifest, [{ id: fixture.id, rawEmail: message }])
    const inspected = await inspectArchive(archivePath)
    try {
      assert.deepEqual(inspected.summary, {
        version: 2,
        messages: 1,
        attachments: 0,
        drafts: 0,
        senderRules: 0,
        blockedSenders: 0,
        senderRuleChanges: 0,
        threadMerges: 0,
      })
      assert.equal(inspected.parsedMessages[0]?.parsed.text?.trim(), 'A test message for the restore preflight.')
      assert.equal('attachments' in (inspected.parsedMessages[0]?.parsed ?? {}), false)
    } finally {
      await rm(inspected.temporaryDirectory, { recursive: true, force: true })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('inspect upgrades a v1 archive by supplying state introduced later', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'courrier-export-test-'))
  try {
    const legacyEmail = [
      'From: Sender <sender@example.test>',
      'To: me@example.test',
      'Subject: Restore test',
      'Message-ID: <restore@example.test>',
      'Date: Sun, 04 Oct 2026 10:00:00 +0000',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="legacy-boundary"',
      '',
      '--legacy-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Legacy body.',
      '--legacy-boundary',
      'Content-Type: text/plain; name="note.txt"',
      'Content-Disposition: attachment; filename="note.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      'SGVsbG8h',
      '--legacy-boundary--',
      '',
    ].join('\r\n')
    const fixture = fixtureData(legacyEmail)
    const legacy = structuredClone(fixture.manifest)
    const outgoingId = '4471fc93-ea92-4802-b08d-c4e336e1b012'
    legacy.version = 1
    delete legacy.senderRuleChangeMerges
    delete legacy.drafts
    delete legacy.threadMerges
    delete legacy.threadMergeMembers
    delete legacy.messages[0]?.is_outgoing
    legacy.messages[0]!.id = outgoingId
    legacy.messages[0]!.original = `messages/${outgoingId}.eml`
    legacy.messages[0]!.raw_object_key = `messages/${outgoingId}/sent-copy.eml`
    legacy.messages[0]!.attachments.push({
      id: `${outgoingId}-0`,
      message_id: outgoingId,
      filename: 'note.txt',
      mime_type: 'text/plain',
      size_bytes: 6,
      content_id: null,
      disposition: 'attachment',
    })
    const archivePath = await writeArchive(directory, legacy, [{ id: outgoingId, rawEmail: legacyEmail }])
    const inspected = await inspectArchive(archivePath)
    try {
      assert.equal(inspected.sourceVersion, 1)
      assert.equal(inspected.manifest.version, 2)
      assert.equal(inspected.manifest.messages[0]?.is_outgoing, true)
      assert.equal(inspected.manifest.messages[0]?.attachments[0]?.object_key, `messages/${outgoingId}/attachments/0`)
      assert.deepEqual(inspected.manifest.drafts, [])
      assert.deepEqual(inspected.manifest.threadMerges, [])
    } finally {
      await rm(inspected.temporaryDirectory, { recursive: true, force: true })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('inspect rejects a valid ZIP whose message bytes do not match the manifest ID', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'courrier-export-test-'))
  try {
    const fixture = fixtureData(message)
    const changedMessage = `${message}\r\nChanged`
    const archivePath = await writeArchive(directory, fixture.manifest, [{ id: fixture.id, rawEmail: changedMessage }])
    await assert.rejects(inspectArchive(archivePath), /Empreinte SHA-256 incorrecte/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('inspect validates manual merge members against RFC Message-ID values', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'courrier-export-test-'))
  try {
    const fixture = fixtureData(message)
    const secondEmail = [
      'From: Sender <sender@example.test>',
      'To: me@example.test',
      'Subject: Restore test reply',
      'Message-ID: <restore-reply@example.test>',
      'Date: Sun, 04 Oct 2026 10:03:00 +0000',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'A second message in the restored merge.',
    ].join('\r\n')
    const secondId = createHash('sha256').update(secondEmail).digest('hex')
    fixture.manifest.messages.push({
      ...fixture.manifest.messages[0]!,
      id: secondId,
      message_id: '<restore-reply@example.test>',
      subject: 'Restore test reply',
      in_reply_to: null,
      original: `messages/${secondId}.eml`,
      raw_object_key: `messages/${secondId}/original.eml`,
      attachments: [],
    })
    fixture.manifest.threadMerges.push({
      id: 'merge-1',
      mailbox_domain: 'example.test',
      folder: 'Imbox',
      created_at: '2026-10-04T10:02:00.000Z',
    })
    fixture.manifest.threadMergeMembers.push(
      { merge_id: 'merge-1', root_message_id: '<restore@example.test>' },
      { merge_id: 'merge-1', root_message_id: '<restore-reply@example.test>' },
    )
    const archivePath = await writeArchive(directory, fixture.manifest, [
      { id: fixture.id, rawEmail: message },
      { id: secondId, rawEmail: secondEmail },
    ])
    const inspected = await inspectArchive(archivePath)
    try {
      assert.equal(inspected.summary.threadMerges, 1)
      assert.equal(inspected.manifest.threadMergeMembers.length, 2)
    } finally {
      await rm(inspected.temporaryDirectory, { recursive: true, force: true })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
