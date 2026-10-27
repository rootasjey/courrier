import PostalMime, { type Address, type Attachment } from 'postal-mime'
import { isLinkedToSetAsideThread } from './keep-set-aside-thread.ts'
import { linkedReplyLaterFolder } from './reply-later-thread.ts'
import { extractAttachmentText, isTextExtractableAttachment } from './attachment-text.ts'

export type MailStorageBindings = {
  DB: D1Database
  MAIL_STORE: R2Bucket
  EMAIL?: SendEmail
  COURRIER_LEGACY_FORWARD_TO?: string
}

export type IncomingEnvelope = {
  from: string
  to: string
}

export type ParsedEmail = Awaited<ReturnType<typeof PostalMime.parse>>

export type IncomingEmailStoreResult = {
  id: string
  duplicate: boolean
  forwardingAttempt?: 'claimed' | 'skipped'
  forwardingClaimedAt?: string
}

type StoredAttachmentRow = {
  id: string
  messageId: string
  filename: string
  mimeType: string
  sizeBytes: number
  objectKey: string
  contentId: string | null
  disposition: string | null
  searchText: string
  searchStatus: string
}

const MAX_MESSAGE_EXTRACTION_BYTES = 16 * 1024 * 1024

function flattenAddresses(value: Address | Address[] | undefined) {
  const addresses = value ? (Array.isArray(value) ? value : [value]) : []
  return addresses.flatMap((address) => 'group' in address && address.group
    ? address.group
    : 'address' in address && address.address
      ? [address]
      : [])
}

function attachmentBytes(content: Attachment['content']) {
  if (typeof content === 'string') return new TextEncoder().encode(content)
  if (content instanceof ArrayBuffer) return new Uint8Array(content)
  return content
}

async function sha256(value: BufferSource) {
  const digest = await crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function parseIncomingEmail(rawEmail: ArrayBuffer) {
  return PostalMime.parse(rawEmail)
}

export function incomingSenderAddress(parsed: ParsedEmail, envelope: IncomingEnvelope) {
  const sender = flattenAddresses(parsed.from)[0]
  return (sender?.address || envelope.from).trim().toLocaleLowerCase('en-US')
}

async function claimLegacyForwardDelivery(
  db: D1Database,
  messageId: string,
  destination: string,
  claimedAt: string,
) {
  const leaseExpiresBefore = new Date(Date.parse(claimedAt) - 10 * 60 * 1000).toISOString()
  const result = await db.prepare(`
    UPDATE legacy_forward_deliveries
    SET destination = ?, status = 'processing', attempt_count = attempt_count + 1,
      claimed_at = ?, last_error = NULL
    WHERE message_id = ?
      AND (
        status = 'failed'
        OR (status = 'processing' AND claimed_at < ?)
      )
  `).bind(destination, claimedAt, messageId, leaseExpiresBefore).run()

  return result.meta.changes === 1
}

export async function markLegacyForwardDelivery(
  db: D1Database,
  messageId: string,
  claimedAt: string,
  status: 'forwarded' | 'failed',
  error?: string,
) {
  const result = await db.prepare(`
    UPDATE legacy_forward_deliveries
    SET status = ?, forwarded_at = ?, claimed_at = NULL, last_error = ?
    WHERE message_id = ? AND status = 'processing' AND claimed_at = ?
  `).bind(
    status,
    status === 'forwarded' ? new Date().toISOString() : null,
    error?.slice(0, 1000) ?? null,
    messageId,
    claimedAt,
  ).run()

  return result.meta.changes === 1
}

async function ownsLegacyForwardClaim(
  db: D1Database,
  messageId: string,
  claimedAt: string,
) {
  const claim = await db.prepare(`
    SELECT 1 AS claimed
    FROM legacy_forward_deliveries
    WHERE message_id = ? AND status = 'processing' AND claimed_at = ?
  `).bind(messageId, claimedAt).first<{ claimed: number }>()

  return Boolean(claim)
}

export async function isBlockedSender(
  parsed: ParsedEmail,
  envelope: IncomingEnvelope,
  bindings: Pick<MailStorageBindings, 'DB'>,
) {
  const mailboxDomain = envelope.to.trim().split('@').at(-1)?.toLocaleLowerCase('en-US') || ''
  const senderAddress = incomingSenderAddress(parsed, envelope)
  if (!mailboxDomain || !senderAddress) return false

  const blocked = await bindings.DB.prepare(`
    SELECT 1 AS blocked FROM blocked_senders
    WHERE mailbox_domain = ? AND sender_address = ?
  `).bind(mailboxDomain, senderAddress).first<{ blocked: number }>()

  return Boolean(blocked)
}

export async function storeIncomingEmail(
  rawEmail: ArrayBuffer,
  envelope: IncomingEnvelope,
  bindings: MailStorageBindings,
  parsedEmail?: ParsedEmail,
  legacyForwardDestination?: string,
) {
  const parsed = parsedEmail ?? await parseIncomingEmail(rawEmail)
  const recipientAddress = envelope.to.trim().toLocaleLowerCase('en-US')
  const mailbox = await bindings.DB.prepare(`
    SELECT mb.id, mb.workspace_id, lower(wd.domain) AS domain
    FROM mailboxes mb
    JOIN workspace_domains wd ON wd.id = mb.domain_id AND wd.workspace_id = mb.workspace_id
    JOIN workspaces w ON w.id = mb.workspace_id
    WHERE lower(mb.address) = ? AND mb.status = 'active'
      AND wd.verification_status IN ('verified', 'legacy_unverified')
      AND w.status = 'active'
    LIMIT 1
  `).bind(recipientAddress).first<{ id: string, workspace_id: string, domain: string }>()
  if (!mailbox) {
    throw new Error('The incoming envelope recipient is not an active configured Courrier mailbox.')
  }

  const contentHash = await sha256(rawEmail)
  const messageId = parsed.messageId?.trim() || `<${contentHash}@courrier.local>`
  const existing = await bindings.DB
    .prepare('SELECT id FROM messages WHERE message_id = ?')
    .bind(messageId)
    .first<{ id: string }>()

  if (existing) {
    if (!legacyForwardDestination) return { id: existing.id, duplicate: true }

    const claimedAt = new Date().toISOString()
    const claimed = await claimLegacyForwardDelivery(
      bindings.DB,
      existing.id,
      legacyForwardDestination,
      claimedAt,
    )

    return {
      id: existing.id,
      duplicate: true,
      forwardingAttempt: claimed ? 'claimed' as const : 'skipped' as const,
      ...(claimed ? { forwardingClaimedAt: claimedAt } : {}),
    }
  }

  const id = contentHash
  const rawObjectKey = `messages/${id}/original.eml`
  const sender = flattenAddresses(parsed.from)[0]
  const senderAddress = incomingSenderAddress(parsed, envelope)
  const mailboxDomain = envelope.to.trim().split('@').at(-1)?.toLocaleLowerCase('en-US') || ''
  const hasReplyHeaders = Boolean(parsed.inReplyTo || parsed.references)
  let replyBelongsToSetAsideThread = false
  let replyLinkLookupFailed = false
  let replyLaterFolder: 'Imbox' | 'The Feed' | 'Paper Trail' | null = null
  let replyLaterLinkLookupFailed = false
  try {
    replyBelongsToSetAsideThread = await isLinkedToSetAsideThread(
      bindings.DB,
      mailboxDomain,
      recipientAddress,
      parsed.inReplyTo || null,
      parsed.references || null,
    )
  } catch (error) {
    replyLinkLookupFailed = hasReplyHeaders
    console.error('[courrier] Could not detect whether the incoming reply belongs to a Set Aside conversation.', { id, error })
  }
  try {
    replyLaterFolder = await linkedReplyLaterFolder(
      bindings.DB,
      mailboxDomain,
      recipientAddress,
      parsed.inReplyTo || null,
      parsed.references || null,
    )
  } catch (error) {
    replyLaterLinkLookupFailed = hasReplyHeaders
    console.error('[courrier] Could not detect whether the incoming reply belongs to a Reply Later conversation.', { id, error })
  }
  const sentAt = parsed.date && !Number.isNaN(Date.parse(parsed.date))
    ? new Date(parsed.date).toISOString()
    : null
  await bindings.MAIL_STORE.put(rawObjectKey, rawEmail, {
    httpMetadata: { contentType: 'message/rfc822' },
    customMetadata: { messageId, envelopeTo: envelope.to },
  })

  const attachmentRows: StoredAttachmentRow[] = []
  let extractedBytes = 0
  for (const [index, attachment] of parsed.attachments.entries()) {
    const attachmentId = `${id}-${index}`
    const objectKey = `messages/${id}/attachments/${index}`
    const content = attachmentBytes(attachment.content)
    const filename = attachment.filename || `piece-jointe-${index + 1}`
    let extracted: Awaited<ReturnType<typeof extractAttachmentText>>
    if (attachment.disposition === 'inline' || attachment.contentId) {
      extracted = { text: '', status: 'skipped' }
    } else if (!isTextExtractableAttachment(filename, attachment.mimeType)) {
      extracted = { text: '', status: 'unsupported' }
    } else {
      extractedBytes += content.byteLength
      extracted = extractedBytes <= MAX_MESSAGE_EXTRACTION_BYTES
        ? await extractAttachmentText({
          filename,
          mimeType: attachment.mimeType,
          bytes: content,
        })
        : { text: '', status: 'skipped' }
    }

    await bindings.MAIL_STORE.put(objectKey, content, {
      httpMetadata: { contentType: attachment.mimeType },
      customMetadata: {
        filename,
        messageId,
      },
    })

    attachmentRows.push({
      id: attachmentId,
      messageId: id,
      filename,
      mimeType: attachment.mimeType,
      sizeBytes: content.byteLength,
      objectKey,
      contentId: attachment.contentId || null,
      disposition: attachment.disposition || null,
      searchText: extracted.text,
      searchStatus: extracted.status,
    })
  }

  // Start the forwarding lease immediately before the D1 batch so attachment
  // extraction and R2 writes cannot make a fresh claim look stale.
  const forwardingClaimedAt = legacyForwardDestination ? new Date().toISOString() : null
  const statements = [
    bindings.DB.prepare(`
      INSERT OR IGNORE INTO messages (
        id, message_id, envelope_from, envelope_to, sender_name, sender_address,
        subject, sent_at, received_at, in_reply_to, references_header, text_body, raw_object_key,
      mailbox_domain, folder, is_set_aside, is_reply_later
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(
        ?,
        (SELECT folder FROM sender_rules WHERE mailbox_domain = ? AND sender_address = ?),
        'Screener'
      ), ?, ?)
    `).bind(
      id,
      messageId,
      envelope.from,
      envelope.to,
      sender?.name || '',
      senderAddress,
      parsed.subject?.trim() || '(sans objet)',
      sentAt,
      new Date().toISOString(),
      parsed.inReplyTo || null,
      parsed.references || null,
      parsed.text || '',
      rawObjectKey,
      mailboxDomain,
      replyLaterFolder ?? (replyBelongsToSetAsideThread || replyLinkLookupFailed || replyLaterLinkLookupFailed ? 'Imbox' : null),
      mailboxDomain,
      senderAddress,
      replyBelongsToSetAsideThread ? 1 : 0,
      replyLaterFolder ? 1 : 0,
    ),
    ...attachmentRows.map(attachment => bindings.DB.prepare(`
      INSERT OR IGNORE INTO attachments (
        id, message_id, filename, mime_type, size_bytes, object_key, content_id, disposition,
        search_text, search_status
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM messages WHERE id = ? AND message_id = ?
      )
    `).bind(
      attachment.id,
      attachment.messageId,
      attachment.filename,
      attachment.mimeType,
      attachment.sizeBytes,
      attachment.objectKey,
      attachment.contentId,
      attachment.disposition,
      attachment.searchText,
      attachment.searchStatus,
      id,
      messageId,
    )),
    ...(legacyForwardDestination && forwardingClaimedAt ? [bindings.DB.prepare(`
      INSERT OR IGNORE INTO legacy_forward_deliveries (
        message_id, destination, status, attempt_count, claimed_at, created_at
      )
      SELECT ?, ?, 'processing', 1, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM messages WHERE id = ? AND message_id = ?
      )
    `).bind(id, legacyForwardDestination, forwardingClaimedAt, forwardingClaimedAt, id, messageId)] : []),
  ]

  const results = await bindings.DB.batch(statements)
  if (results[0]?.meta.changes !== 1) {
    const existingMessage = await bindings.DB
      .prepare('SELECT id FROM messages WHERE message_id = ?')
      .bind(messageId)
      .first<{ id: string }>()

    if (existingMessage) {
      // Different raw deliveries can share a Message-ID. Once D1 confirms
      // another row won the race, remove only this delivery's unique R2 keys.
      if (existingMessage.id !== id) {
        const orphanedKeys = [rawObjectKey, ...attachmentRows.map(attachment => attachment.objectKey)]
        await Promise.all(orphanedKeys.map(async key => {
          try {
            await bindings.MAIL_STORE.delete(key)
          } catch (error) {
            console.error('[courrier] Could not remove an R2 object from a duplicate delivery.', { key, error })
          }
        }))
        if (!legacyForwardDestination) return { id: existingMessage.id, duplicate: true }

        const claimedAt = new Date().toISOString()
        const claimed = await claimLegacyForwardDelivery(
          bindings.DB,
          existingMessage.id,
          legacyForwardDestination,
          claimedAt,
        )

        return {
          id: existingMessage.id,
          duplicate: true,
          forwardingAttempt: claimed ? 'claimed' as const : 'skipped' as const,
          ...(claimed ? { forwardingClaimedAt: claimedAt } : {}),
        }
      }

      // D1's batch result metadata can omit `changes` even when this batch
      // inserted the message and its forwarding claim. Match our claim token
      // before treating the row as a concurrent duplicate.
      if (
        legacyForwardDestination
        && forwardingClaimedAt
        && await ownsLegacyForwardClaim(bindings.DB, existingMessage.id, forwardingClaimedAt)
      ) {
        return {
          id: existingMessage.id,
          duplicate: false,
          forwardingAttempt: 'claimed' as const,
          forwardingClaimedAt,
        }
      }

      // Another identical delivery inserted the same content after the first
      // lookup. Its classification was written by the winning insert.
      if (!legacyForwardDestination) return { id: existingMessage.id, duplicate: true }

      const claimedAt = new Date().toISOString()
      const claimed = await claimLegacyForwardDelivery(
        bindings.DB,
        existingMessage.id,
        legacyForwardDestination,
        claimedAt,
      )

      return {
        id: existingMessage.id,
        duplicate: true,
        forwardingAttempt: claimed ? 'claimed' as const : 'skipped' as const,
        ...(claimed ? { forwardingClaimedAt: claimedAt } : {}),
      }
    } else {
      throw new Error('D1 did not store the incoming email and no existing Message-ID was found.')
    }
  }

  // This invocation inserted the message and its delivery row in the same
  // successful D1 batch. Do not gate forwarding on D1's optional changes
  // metadata, which can differ across result shapes.
  const forwardingAttempt = legacyForwardDestination && forwardingClaimedAt
    ? 'claimed' as const
    : undefined

  return {
    id,
    duplicate: false,
    ...(forwardingAttempt ? { forwardingAttempt } : {}),
    ...(forwardingAttempt === 'claimed' && forwardingClaimedAt ? { forwardingClaimedAt } : {}),
  }
}
