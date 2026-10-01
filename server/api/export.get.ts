import type { MailStorageBindings } from '../utils/mail-store'
import { createZipStream } from '../utils/zip-stream'

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
}

export default defineEventHandler(async (event) => {
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })
  }

  const [messageResult, attachmentResult, ruleResult, blockedResult, ruleChangeResult, ruleChangeMessageResult] = await Promise.all([
    bindings.DB.prepare(`
      SELECT id, message_id, envelope_from, envelope_to, sender_name, sender_address,
        subject, sent_at, received_at, in_reply_to, references_header, raw_object_key,
        mailbox_domain, folder, screener_state, is_read, trashed_at
      FROM messages
      ORDER BY received_at ASC, id ASC
    `).all<MessageRow>(),
    bindings.DB.prepare(`
      SELECT id, message_id, filename, mime_type, size_bytes, content_id, disposition
      FROM attachments
      ORDER BY message_id ASC, id ASC
    `).all<AttachmentRow>(),
    bindings.DB.prepare(`
      SELECT mailbox_domain, sender_address, folder, created_at, updated_at, last_change_id
      FROM sender_rules
      ORDER BY mailbox_domain ASC, sender_address ASC
    `).all(),
    bindings.DB.prepare(`
      SELECT mailbox_domain, sender_address, created_at
      FROM blocked_senders
      ORDER BY mailbox_domain ASC, sender_address ASC
    `).all(),
    bindings.DB.prepare(`
      SELECT id, mailbox_domain, sender_address, previous_rule_folder, previous_change_id,
        next_folder, created_at, expires_at, undone_at
      FROM sender_rule_changes
      ORDER BY created_at ASC, id ASC
    `).all(),
    bindings.DB.prepare(`
      SELECT change_id, message_id, previous_folder
      FROM sender_rule_change_messages
      ORDER BY change_id ASC, message_id ASC
    `).all(),
  ])

  const attachmentsByMessage = new Map<string, AttachmentRow[]>()
  for (const attachment of attachmentResult.results as AttachmentRow[]) {
    const rows = attachmentsByMessage.get(attachment.message_id) || []
    rows.push(attachment)
    attachmentsByMessage.set(attachment.message_id, rows)
  }

  const createdAt = new Date()
  const manifest = {
    format: 'courrier-mailbox-export',
    version: 1,
    createdAt: createdAt.toISOString(),
    messages: (messageResult.results as MessageRow[]).map(message => ({
      ...message,
      is_read: Boolean(message.is_read),
      original: `messages/${message.id}.eml`,
      attachments: attachmentsByMessage.get(message.id) || [],
    })),
    senderRules: ruleResult.results,
    blockedSenders: blockedResult.results,
    senderRuleChanges: ruleChangeResult.results,
    senderRuleChangeMessages: ruleChangeMessageResult.results,
  }

  async function* archiveEntries() {
    yield {
      name: 'README.txt',
      body: new TextEncoder().encode(
        'Courrier mailbox export\n\n' +
        'manifest.json preserves Courrier message metadata, folders, screener state, trash state, sender rules and blocked senders.\n' +
        'The messages/ directory contains the original RFC 822 emails. MIME attachments remain embedded in those originals.\n',
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
