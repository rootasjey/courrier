import type { AccountDb } from './account-auth'
import type { MailStorageBindings } from './mail-store'

export type MailboxPurgeTarget = {
  id: string
  workspaceId: string
  domain: string
  address: string
}

type MailboxMessageRow = { id: string, raw_object_key: string }
type KeyRow = { object_key: string }
type MutationResult = { meta?: { changes?: number } }

export type MailboxPurgeData = {
  messages: MailboxMessageRow[]
  objectKeys: string[]
  threadMergeIds: string[]
  pendingForward: boolean
  pendingDraft: boolean
}

const R2_DELETE_BATCH_SIZE = 100

const messageAddressFilter = `lower(trim(CASE WHEN is_outgoing = 1 THEN envelope_from ELSE envelope_to END)) = ?`

export async function collectMailboxPurgeData(db: AccountDb, target: MailboxPurgeTarget): Promise<MailboxPurgeData> {
  const [messages, attachmentKeys, draftAttachmentKeys, threadMerges, pendingForward, pendingDraft] = await Promise.all([
    db.prepare(`SELECT id, raw_object_key FROM messages WHERE ${messageAddressFilter}`)
      .bind(target.address).all<MailboxMessageRow>(),
    db.prepare(`
      SELECT a.object_key FROM attachments a
      JOIN messages m ON m.id = a.message_id
      WHERE lower(trim(CASE WHEN m.is_outgoing = 1 THEN m.envelope_from ELSE m.envelope_to END)) = ?
    `).bind(target.address).all<KeyRow>(),
    db.prepare(`
      SELECT a.object_key FROM outgoing_draft_attachments a
      JOIN outgoing_drafts d ON d.id = a.draft_id
      WHERE d.mailbox_id = ? AND d.workspace_id = ?
    `).bind(target.id, target.workspaceId).all<KeyRow>(),
    db.prepare(`
      SELECT DISTINCT tm.id FROM thread_merges tm
      JOIN thread_merge_members mm ON mm.merge_id = tm.id
      JOIN messages m ON m.id = mm.root_message_id
      WHERE tm.mailbox_domain = ? AND ${messageAddressFilter}
    `).bind(target.domain, target.address).all<{ id: string }>(),
    db.prepare(`
      SELECT 1 AS pending FROM legacy_forward_deliveries d
      JOIN messages m ON m.id = d.message_id
      WHERE d.status = 'processing' AND lower(trim(
        CASE WHEN m.is_outgoing = 1 THEN m.envelope_from ELSE m.envelope_to END
      )) = ? LIMIT 1
    `).bind(target.address).first<{ pending: number }>(),
    db.prepare(`SELECT 1 AS pending FROM outgoing_drafts
      WHERE mailbox_id = ? AND workspace_id = ? AND status = 'sending' LIMIT 1`)
      .bind(target.id, target.workspaceId).first<{ pending: number }>(),
  ])

  const messageRows = messages.results
  const objectKeys = [...new Set([
    ...messageRows.map(message => message.raw_object_key),
    ...attachmentKeys.results.map(row => row.object_key),
    ...draftAttachmentKeys.results.map(row => row.object_key),
  ].filter(Boolean))]

  return {
    messages: messageRows,
    objectKeys,
    threadMergeIds: threadMerges.results.map(merge => merge.id),
    pendingForward: Boolean(pendingForward),
    pendingDraft: Boolean(pendingDraft),
  }
}

export async function permanentlyDeleteMailboxData(input: {
  db: AccountDb
  mailStore: MailStorageBindings['MAIL_STORE']
  target: MailboxPurgeTarget
  actorId: string
  data: MailboxPurgeData
  deletedAt: string
  archivedGuardSql: string
}): Promise<boolean> {
  const { db, mailStore, target, actorId, data, deletedAt, archivedGuardSql } = input
  for (let offset = 0; offset < data.objectKeys.length; offset += R2_DELETE_BATCH_SIZE) {
    const keys = data.objectKeys.slice(offset, offset + R2_DELETE_BATCH_SIZE)
    await mailStore.delete(keys)
  }

  const details = JSON.stringify({
    address: target.address,
    domain: target.domain,
    messages: data.messages.length,
    storedObjects: data.objectKeys.length,
    routingRule: 'disabled',
  })
  const threadMergeIds = JSON.stringify(data.threadMergeIds)
  const results = await db.batch([
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'workspace_mailbox.deleted', 'mailbox', ?, ?, ?, ?
      WHERE ${archivedGuardSql}
    `).bind(crypto.randomUUID(), actorId, target.id, target.workspaceId, details, deletedAt, target.id, target.workspaceId),
    db.prepare(`DELETE FROM sender_rule_change_messages
      WHERE message_id IN (SELECT id FROM messages WHERE ${messageAddressFilter}) AND ${archivedGuardSql}`)
      .bind(target.address, target.id, target.workspaceId),
    db.prepare(`DELETE FROM thread_merge_members
      WHERE root_message_id IN (SELECT id FROM messages WHERE ${messageAddressFilter}) AND ${archivedGuardSql}`)
      .bind(target.address, target.id, target.workspaceId),
    db.prepare(`DELETE FROM workspace_activity
      WHERE mailbox_id = ? AND workspace_id = ? AND ${archivedGuardSql}`)
      .bind(target.id, target.workspaceId, target.id, target.workspaceId),
    db.prepare(`DELETE FROM inbound_email_events
      WHERE lower(trim(recipient_address)) = ? AND ${archivedGuardSql}`)
      .bind(target.address, target.id, target.workspaceId),
    db.prepare(`DELETE FROM outgoing_drafts
      WHERE mailbox_id = ? AND workspace_id = ? AND ${archivedGuardSql}`)
      .bind(target.id, target.workspaceId, target.id, target.workspaceId),
    db.prepare(`DELETE FROM messages WHERE ${messageAddressFilter} AND ${archivedGuardSql}`)
      .bind(target.address, target.id, target.workspaceId),
    db.prepare(`DELETE FROM thread_merges
      WHERE mailbox_domain = ? AND id IN (SELECT value FROM json_each(?)) AND id IN (
        SELECT tm.id FROM thread_merges tm
        LEFT JOIN thread_merge_members mm ON mm.merge_id = tm.id
        WHERE tm.mailbox_domain = ? GROUP BY tm.id HAVING COUNT(mm.root_message_id) < 2
      ) AND ${archivedGuardSql}`)
      .bind(target.domain, threadMergeIds, target.domain, target.id, target.workspaceId),
    db.prepare(`DELETE FROM sender_rule_change_merges
      WHERE merge_id IN (SELECT value FROM json_each(?))
        AND merge_id NOT IN (SELECT id FROM thread_merges) AND ${archivedGuardSql}`)
      .bind(threadMergeIds, target.id, target.workspaceId),
    db.prepare(`DELETE FROM mailboxes
      WHERE id = ? AND workspace_id = ? AND archived_at IS NOT NULL AND deletion_started_at IS NOT NULL`)
      .bind(target.id, target.workspaceId),
  ]) as MutationResult[]

  return Number(results.at(-1)?.meta?.changes ?? 0) === 1
}
