import type { MailStorageBindings } from '../utils/mail-store'
import { createMailboxExportManifest } from '../utils/mailbox-export'
import { createZipStream } from '../utils/zip-stream'
import { getWorkspaceUserFromContext, workspaceDomainScope, workspaceMessageScope, workspaceReplyDraftScope } from '../utils/account-auth'

type MessageRow = {
  id: string
  message_id: string
  envelope_from: string
  envelope_to: string
  sender_name: string
  sender_address: string
  subject: string
  sent_at: string | null
  received_at: string
  in_reply_to: string | null
  references_header: string | null
  raw_object_key: string
  mailbox_domain: string
  folder: string
  screener_state: string
  is_read: number
  is_set_aside: number
  is_reply_later: number
  is_outgoing: number
  trashed_at: string | null
}

type AttachmentRow = {
  id: string
  message_id: string
  filename: string
  mime_type: string
  size_bytes: number
  content_id: string | null
  disposition: string | null
  object_key: string
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })
  }

  const [messageResult, attachmentResult, ruleResult, blockedResult, ruleChangeResult, ruleChangeMessageResult, ruleChangeMergeResult, draftResult, threadMergeResult, threadMergeMemberResult, contactResult, contactAddressResult, contactNoteResult] = await Promise.all([
      bindings.DB.prepare(`
        SELECT id, message_id, envelope_from, envelope_to, sender_name, sender_address,
          subject, sent_at, received_at, in_reply_to, references_header, raw_object_key,
        mailbox_domain, folder, screener_state, is_read, is_set_aside, is_reply_later,
        is_outgoing, trashed_at
      FROM messages
      WHERE ${workspaceMessageScope('messages', user.id)}
      ORDER BY received_at ASC, id ASC
    `).bind(user.activeWorkspaceId).all<MessageRow>(),
    bindings.DB.prepare(`
      SELECT attachments.id, attachments.message_id, attachments.filename, attachments.mime_type,
        attachments.size_bytes, attachments.object_key, attachments.content_id, attachments.disposition
      FROM attachments
      JOIN messages ON messages.id = attachments.message_id
      WHERE ${workspaceMessageScope('messages', user.id)}
      ORDER BY attachments.message_id ASC, attachments.id ASC
    `).bind(user.activeWorkspaceId).all<AttachmentRow>(),
    bindings.DB.prepare(`
      SELECT mailbox_domain, sender_address, folder, created_at, updated_at, last_change_id
      FROM sender_rules
      WHERE ${workspaceDomainScope('sender_rules.mailbox_domain', user.id)}
      ORDER BY mailbox_domain ASC, sender_address ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT mailbox_domain, sender_address, created_at
      FROM blocked_senders
      WHERE ${workspaceDomainScope('blocked_senders.mailbox_domain', user.id)}
      ORDER BY mailbox_domain ASC, sender_address ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT id, mailbox_domain, sender_address, previous_rule_folder, previous_change_id,
        next_folder, created_at, expires_at, undone_at
      FROM sender_rule_changes
      WHERE ${workspaceDomainScope('sender_rule_changes.mailbox_domain', user.id)}
      ORDER BY created_at ASC, id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT sender_rule_change_messages.change_id, sender_rule_change_messages.message_id,
        sender_rule_change_messages.previous_folder
      FROM sender_rule_change_messages
      JOIN sender_rule_changes ON sender_rule_changes.id = sender_rule_change_messages.change_id
      WHERE ${workspaceDomainScope('sender_rule_changes.mailbox_domain', user.id)}
      ORDER BY sender_rule_change_messages.change_id ASC, sender_rule_change_messages.message_id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT sender_rule_change_merges.change_id, sender_rule_change_merges.merge_id,
        sender_rule_change_merges.previous_folder
      FROM sender_rule_change_merges
      JOIN sender_rule_changes ON sender_rule_changes.id = sender_rule_change_merges.change_id
      WHERE ${workspaceDomainScope('sender_rule_changes.mailbox_domain', user.id)}
      ORDER BY sender_rule_change_merges.change_id ASC, sender_rule_change_merges.merge_id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT id, reply_to_message_id, mailbox_domain, to_address, subject, text_body,
        status, created_at, updated_at
      FROM drafts
      WHERE ${workspaceReplyDraftScope('drafts', user.id)}
      ORDER BY created_at ASC, id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT id, mailbox_domain, folder, created_at
      FROM thread_merges
      WHERE ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
      ORDER BY created_at ASC, id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT thread_merge_members.merge_id, thread_merge_members.root_message_id
      FROM thread_merge_members
      JOIN thread_merges ON thread_merges.id = thread_merge_members.merge_id
      WHERE ${workspaceDomainScope('thread_merges.mailbox_domain', user.id)}
      ORDER BY thread_merge_members.merge_id ASC, thread_merge_members.root_message_id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT id, display_name, created_by_name, updated_by_name, created_at, updated_at
      FROM contacts WHERE workspace_id = ? ORDER BY display_name COLLATE NOCASE ASC, id ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT contact_id, address, is_primary, created_at
      FROM contact_addresses WHERE workspace_id = ? ORDER BY contact_id ASC, is_primary DESC, address COLLATE NOCASE ASC
    `).bind(user.activeWorkspaceId).all(),
    bindings.DB.prepare(`
      SELECT contact_id, body, created_by_name, updated_by_name, created_at, updated_at
      FROM contact_notes WHERE workspace_id = ? ORDER BY contact_id ASC
    `).bind(user.activeWorkspaceId).all(),
  ])

  const createdAt = new Date()
  const manifest = createMailboxExportManifest({
    messages: messageResult.results as MessageRow[],
    attachments: attachmentResult.results as AttachmentRow[],
    senderRules: ruleResult.results,
    blockedSenders: blockedResult.results,
    senderRuleChanges: ruleChangeResult.results,
    senderRuleChangeMessages: ruleChangeMessageResult.results,
    senderRuleChangeMerges: ruleChangeMergeResult.results,
    drafts: draftResult.results,
    threadMerges: threadMergeResult.results,
    threadMergeMembers: threadMergeMemberResult.results,
    contacts: contactResult.results,
    contactAddresses: contactAddressResult.results,
    contactNotes: contactNoteResult.results,
  }, createdAt)

  async function* archiveEntries() {
    yield {
      name: 'README.txt',
      body: new TextEncoder().encode(
        'Courrier mailbox export\n\n' +
        'manifest.json preserves Courrier message metadata and application state, including drafts, manual thread merges, sender rules and their undo history, and shared contacts and notes.\n' +
        'The messages/ directory contains the original RFC 822 emails. MIME attachments remain embedded in those originals.\n' +
        'The archive does not contain Cloudflare account, Worker, Access, Email Routing, or binding configuration.\n',
      ),
    }
    yield { name: 'manifest.json', body: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) }

    for (const message of messageResult.results as MessageRow[]) {
      const object = await bindings.MAIL_STORE.get(message.raw_object_key)
      if (!object?.body) {
        throw new Error(`L’original RFC 822 du message ${message.id} est introuvable dans R2.`)
      }
      yield { name: `messages/${message.id}.eml`, body: object.body }
    }
  }

  const filename = `courrier-export-${createdAt.toISOString().slice(0, 10)}.zip`
  return new Response(createZipStream(archiveEntries(), createdAt), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/zip',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
