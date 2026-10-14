import type { MailStorageBindings } from '../../../utils/mail-store'
import { normalizeDraftRecipients, type OutgoingDraftAttachment } from '../../../utils/outgoing-draft-content'
import { estimateOutgoingEmailBytes, OUTBOUND_MESSAGE_BUDGET_BYTES } from '../../../../shared/utils/outgoing-email-size'
import { getWorkspaceUserFromContext, requireMailboxAddressAccess, workspaceOutgoingDraftScope } from '../../../utils/account-auth'

const fromAddress = 'courrier-test@verbatims.cc'

type DraftRow = {
  id: string
  to_address: string
  cc_address: string
  bcc_address: string
  subject: string
  html_body: string
  text_body: string
  status: 'draft' | 'sending'
}

type UploadedAttachment = OutgoingDraftAttachment & { bytes: Uint8Array }

function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

function encodeHeader(value: string) {
  const clean = value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim()
  if (/^[\x20-\x7e]*$/.test(clean)) return clean
  const encoded = encodeBase64(new TextEncoder().encode(clean))
  return encoded.match(/.{1,48}/g)?.map(chunk => `=?UTF-8?B?${chunk}?=`).join('\r\n ') || '(sans objet)'
}

function mimePart(type: string, bytes: Uint8Array) {
  return `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodeBase64(bytes).match(/.{1,76}/g)?.join('\r\n') || ''}`
}

function attachmentPart(attachment: UploadedAttachment) {
  const filename = encodeURIComponent(attachment.filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  const disposition = attachment.disposition === 'inline' ? 'inline' : 'attachment'
  const contentId = attachment.disposition === 'inline' ? `Content-ID: <${attachment.content_id}>\r\n` : ''
  return `Content-Type: ${attachment.mime_type}; name*=UTF-8''${filename}\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: ${disposition}; filename*=UTF-8''${filename}\r\n${contentId}\r\n${encodeBase64(attachment.bytes).match(/.{1,76}/g)?.join('\r\n') || ''}`
}

function buildStoredMime(draft: DraftRow, recipients: string[], cc: string[], messageId: string, sentAt: string, files: UploadedAttachment[]) {
  const alternativeBoundary = `courrier-alt-${crypto.randomUUID()}`
  const relatedBoundary = `courrier-rel-${crypto.randomUUID()}`
  const mixedBoundary = `courrier-mix-${crypto.randomUUID()}`
  const alternative = [
    `--${alternativeBoundary}\r\n${mimePart('text/plain', new TextEncoder().encode(draft.text_body))}`,
    `--${alternativeBoundary}\r\n${mimePart('text/html', new TextEncoder().encode(draft.html_body))}`,
    `--${alternativeBoundary}--`,
  ].join('\r\n')

  const inlineFiles = files.filter(file => file.disposition === 'inline')
  const regularFiles = files.filter(file => file.disposition === 'attachment')
  const related = inlineFiles.length
    ? [
        `--${relatedBoundary}\r\nContent-Type: multipart/alternative; boundary="${alternativeBoundary}"\r\n\r\n${alternative}`,
        ...inlineFiles.map(file => `--${relatedBoundary}\r\n${attachmentPart(file)}`),
        `--${relatedBoundary}--`,
      ].join('\r\n')
    : alternative

  let contentType = `multipart/alternative; boundary="${alternativeBoundary}"`
  let body = alternative
  if (inlineFiles.length) {
    contentType = `multipart/related; boundary="${relatedBoundary}"`
    body = related
  }
  if (regularFiles.length) {
    contentType = `multipart/mixed; boundary="${mixedBoundary}"`
    body = [
      `--${mixedBoundary}\r\nContent-Type: ${inlineFiles.length ? `multipart/related; boundary="${relatedBoundary}"` : `multipart/alternative; boundary="${alternativeBoundary}"`}\r\n\r\n${related}`,
      ...regularFiles.map(file => `--${mixedBoundary}\r\n${attachmentPart(file)}`),
      `--${mixedBoundary}--`,
    ].join('\r\n')
  }

  const headers = [
    `From: Courrier <${fromAddress}>`,
    `To: ${recipients.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(draft.subject.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim() || '(sans objet)')}`,
    `Date: ${new Date(sentAt).toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}`,
  ]
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`
}

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE || !bindings.EMAIL) {
    throw createError({ statusCode: 503, statusMessage: 'L’envoi de nouveaux messages n’est pas configuré.' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Brouillon manquant.' })

  const senderMailboxId = await requireMailboxAddressAccess(bindings.DB, user.id, user.activeWorkspaceId, fromAddress)

  const sendingDomain = await bindings.DB.prepare(`
    SELECT 1 AS allowed FROM workspace_domains
    WHERE workspace_id = ? AND domain = 'verbatims.cc'
      AND verification_status IN ('verified', 'legacy_unverified')
    LIMIT 1
  `).bind(user.activeWorkspaceId).first<{ allowed: number }>()
  if (!sendingDomain) throw createError({ statusCode: 403, statusMessage: 'Cet espace ne possède pas encore de domaine autorisé pour l’envoi.' })

  const resetDraft = (updatedAt = new Date().toISOString()) => bindings.DB!.prepare(`
    UPDATE outgoing_drafts SET status = 'draft', updated_at = ?
    WHERE id = ? AND mailbox_id = ? AND status = 'sending'
      AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}
  `).bind(updatedAt, id, senderMailboxId, user.activeWorkspaceId)

  let draft = await bindings.DB.prepare(`
    SELECT id, to_address, cc_address, bcc_address, subject, html_body, text_body, status
    FROM outgoing_drafts WHERE id = ? AND mailbox_id = ?
      AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}
  `).bind(id, senderMailboxId, user.activeWorkspaceId).first<DraftRow>()
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'Brouillon introuvable.' })
  if (draft.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'L’état de cet envoi est incertain. Vérifie la boîte destinataire avant de réessayer.' })
  const recipients = normalizeDraftRecipients(draft.to_address)
  const ccRecipients = draft.cc_address ? normalizeDraftRecipients(draft.cc_address) : []
  const bccRecipients = draft.bcc_address ? normalizeDraftRecipients(draft.bcc_address) : []
  const subject = draft.subject.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim() || '(sans objet)'
  if (!recipients) throw createError({ statusCode: 400, statusMessage: 'Ajoute au moins une adresse valide dans le champ À.' })
  if (!ccRecipients || !bccRecipients) throw createError({ statusCode: 400, statusMessage: 'Vérifie les adresses des champs Cc et Cci.' })
  if (recipients.length + ccRecipients.length + bccRecipients.length > 50) throw createError({ statusCode: 400, statusMessage: 'Un message ne peut pas dépasser 50 destinataires au total.' })
  if (!draft.text_body.trim() && !/<(?:img)\b/i.test(draft.html_body)) {
    const hasAttachments = await bindings.DB.prepare(`
      SELECT 1 AS present FROM outgoing_draft_attachments WHERE draft_id = ?
        AND EXISTS (
          SELECT 1 FROM outgoing_drafts AS accessible_draft
          WHERE accessible_draft.id = ? AND accessible_draft.mailbox_id = ?
            AND ${workspaceOutgoingDraftScope('accessible_draft', user.id)}
        )
      LIMIT 1
    `).bind(id, id, senderMailboxId, user.activeWorkspaceId).first<{ present: number }>()
    if (!hasAttachments) throw createError({ statusCode: 400, statusMessage: 'Écris un message ou ajoute une pièce jointe avant de l’envoyer.' })
  }

  const claim = await bindings.DB.prepare(`
    UPDATE outgoing_drafts SET status = 'sending', updated_at = ?
    WHERE id = ? AND mailbox_id = ? AND status = 'draft'
      AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}
  `).bind(new Date().toISOString(), id, senderMailboxId, user.activeWorkspaceId).run()
  if (!claim.meta.changes) throw createError({ statusCode: 409, statusMessage: 'Ce brouillon est déjà en cours d’envoi.' })

  draft = await bindings.DB.prepare(`
    SELECT id, to_address, cc_address, bcc_address, subject, html_body, text_body, status FROM outgoing_drafts
    WHERE id = ? AND mailbox_id = ? AND status = 'sending'
      AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}
  `).bind(id, senderMailboxId, user.activeWorkspaceId).first<DraftRow>()
  if (!draft) throw createError({ statusCode: 409, statusMessage: 'Le brouillon a changé pendant la préparation de l’envoi.' })

  const attachmentRows = await bindings.DB.prepare(`
    SELECT id, filename, mime_type, size_bytes, object_key, content_id, disposition
    FROM outgoing_draft_attachments WHERE draft_id = ?
      AND EXISTS (
        SELECT 1 FROM outgoing_drafts AS accessible_draft
        WHERE accessible_draft.id = ? AND accessible_draft.mailbox_id = ?
          AND ${workspaceOutgoingDraftScope('accessible_draft', user.id)}
      )
    ORDER BY created_at
  `).bind(id, id, senderMailboxId, user.activeWorkspaceId).all<OutgoingDraftAttachment>()
  if (attachmentRows.results.length > 32) {
    await resetDraft().run()
    throw createError({ statusCode: 413, statusMessage: 'Un message ne peut pas contenir plus de 32 fichiers.' })
  }

  const uploaded: UploadedAttachment[] = []
  for (const attachment of attachmentRows.results) {
    const object = await bindings.MAIL_STORE.get(attachment.object_key)
    if (!object) {
      await resetDraft().run()
      throw createError({ statusCode: 409, statusMessage: `La pièce jointe « ${attachment.filename} » est introuvable.` })
    }
    const bytes = new Uint8Array(await object.arrayBuffer())
    if (bytes.byteLength !== attachment.size_bytes) {
      await resetDraft().run()
      throw createError({ statusCode: 409, statusMessage: `La pièce jointe « ${attachment.filename} » est incomplète.` })
    }
    uploaded.push({ ...attachment, bytes })
  }
  const claimRecipients = normalizeDraftRecipients(draft.to_address)
  const claimCcRecipients = draft.cc_address ? normalizeDraftRecipients(draft.cc_address) : []
  const claimBccRecipients = draft.bcc_address ? normalizeDraftRecipients(draft.bcc_address) : []
  if (!claimRecipients || !claimCcRecipients || !claimBccRecipients) {
    await resetDraft().run()
    throw createError({ statusCode: 400, statusMessage: 'Le destinataire ou le contenu du brouillon est invalide.' })
  }
  const envelopeRecipients = [...new Set([...claimRecipients, ...claimCcRecipients, ...claimBccRecipients])]
  if (claimRecipients.length + claimCcRecipients.length + claimBccRecipients.length > 50) {
    await resetDraft().run()
    throw createError({ statusCode: 400, statusMessage: 'Un message ne peut pas dépasser 50 destinataires au total.' })
  }
  const estimatedMessageBytes = estimateOutgoingEmailBytes({
    to: claimRecipients,
    cc: claimCcRecipients,
    bcc: claimBccRecipients,
    subject,
    text: draft.text_body,
    html: draft.html_body,
    attachments: uploaded,
  })
  if (estimatedMessageBytes > OUTBOUND_MESSAGE_BUDGET_BYTES) {
    await resetDraft().run()
    throw createError({ statusCode: 413, statusMessage: 'Le message complet dépasse la limite estimée de 5 Mio. Réduis le corps du message ou retire une pièce jointe.' })
  }

  if (!draft.text_body.trim() && !/<(?:img)\b/i.test(draft.html_body) && attachmentRows.results.length === 0) {
    await resetDraft().run()
    throw createError({ statusCode: 400, statusMessage: 'Le destinataire ou le contenu du brouillon est invalide.' })
  }
  let result: Awaited<ReturnType<SendEmail['send']>>
  try {
    result = await bindings.EMAIL.send({
      from: { email: fromAddress, name: 'Courrier' },
      to: claimRecipients,
      ...(claimCcRecipients.length ? { cc: claimCcRecipients } : {}),
      ...(claimBccRecipients.length ? { bcc: claimBccRecipients } : {}),
      subject,
      text: draft.text_body,
      html: draft.html_body,
      attachments: uploaded.map(file => ({
        filename: file.filename,
        type: file.mime_type,
        disposition: file.disposition,
        ...(file.disposition === 'inline' ? { contentId: file.content_id } : {}),
        content: encodeBase64(file.bytes),
      })),
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code && !['E_INTERNAL_SERVER_ERROR', 'E_RATE_LIMIT_EXCEEDED', 'E_DELIVERY_FAILED'].includes(code)) {
      await resetDraft().run()
    }
    throw createError({
      statusCode: code ? 502 : 503,
      statusMessage: code ? `Cloudflare n’a pas accepté l’envoi (${code}). Le brouillon est conservé.` : 'L’état de l’envoi est incertain. Vérifie d’abord la boîte destinataire avant tout nouvel essai.',
    })
  }

  const sentAt = new Date().toISOString()
  const messageRowId = crypto.randomUUID()
  const messageId = result.messageId
  const rawObjectKey = `messages/${messageRowId}/sent-copy.eml`
  const raw = buildStoredMime(draft, claimRecipients, claimCcRecipients, messageId, sentAt, uploaded)
  const displayHtml = uploaded.reduce((html, file, index) => file.disposition === 'inline'
    ? html.replaceAll(`cid:${file.content_id}`, `/api/attachments/${messageRowId}-${index}?inline=1`)
    : html, draft.html_body)

  try {
    await bindings.MAIL_STORE.put(rawObjectKey, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
      customMetadata: { messageId, envelopeTo: envelopeRecipients.join(', ') },
    })
    const copiedAttachments = await Promise.all(uploaded.map(async (file, index) => {
      const attachmentId = `${messageRowId}-${index}`
      const objectKey = `messages/${messageRowId}/attachments/${index}`
      await bindings.MAIL_STORE!.put(objectKey, file.bytes, {
        httpMetadata: { contentType: file.mime_type },
        customMetadata: { filename: file.filename, messageId },
      })
      return { id: attachmentId, objectKey, file }
    }))
    await bindings.DB.batch([
      bindings.DB.prepare(`
        INSERT INTO messages (
          id, message_id, envelope_from, envelope_to, sender_name, sender_address,
          subject, sent_at, received_at, text_body, raw_object_key, mailbox_domain,
          folder, screener_state, is_read, trashed_at, is_outgoing, html_body
        ) VALUES (?, ?, ?, ?, 'Courrier', ?, ?, ?, ?, ?, ?, 'verbatims.cc', 'Imbox', 'cleared', 1, NULL, 1, ?)
      `).bind(messageRowId, messageId, fromAddress, envelopeRecipients.join(', '), fromAddress, draft.subject.trim() || '(sans objet)', sentAt, sentAt, draft.text_body, rawObjectKey, displayHtml),
      ...copiedAttachments.map(({ id: attachmentId, objectKey, file }) => bindings.DB.prepare(`
        INSERT INTO attachments (id, message_id, filename, mime_type, size_bytes, object_key, content_id, disposition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(attachmentId, messageRowId, file.filename, file.mime_type, file.size_bytes, objectKey, file.disposition === 'inline' ? file.content_id : null, file.disposition)),
      bindings.DB.prepare(`DELETE FROM outgoing_drafts WHERE id = ? AND mailbox_id = ? AND status = 'sending'
        AND ${workspaceOutgoingDraftScope('outgoing_drafts', user.id)}`)
        .bind(id, senderMailboxId, user.activeWorkspaceId),
    ])
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Le message a été accepté par Cloudflare, mais Courrier n’a pas pu terminer son archivage. Vérifie la boîte destinataire avant de réessayer.' })
  }

  return { id: messageRowId, messageId, sentAt, folder: 'Imbox' }
})
