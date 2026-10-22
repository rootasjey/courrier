import type { MailStorageBindings } from '../../utils/mail-store'
import { extractAttachmentText } from '../../utils/attachment-text'

type PendingAttachment = {
  id: string
  filename: string
  mime_type: string
  object_key: string
}

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found.' })
  }

  const bindings = event.context.cloudflare?.env as MailStorageBindings | undefined
  if (!bindings?.DB || !bindings.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage local des pièces jointes n’est pas prêt.' })
  }

  const retryFailed = getQuery(event).retryFailed === '1'
  const retryClause = retryFailed ? "OR search_status = 'failed'" : ''
  const updateClause = retryFailed ? "AND search_status IN ('pending', 'failed')" : "AND search_status = 'pending'"
  const { results } = await bindings.DB.prepare(`
    SELECT id, filename, mime_type, object_key
    FROM attachments
    WHERE search_status = 'pending' ${retryClause}
    ORDER BY rowid
    LIMIT 25
  `).all<PendingAttachment>()

  let indexed = 0
  let empty = 0
  let unsupported = 0
  let skipped = 0
  let failed = 0

  for (const attachment of results) {
    let extracted: Awaited<ReturnType<typeof extractAttachmentText>>
    try {
      const object = await bindings.MAIL_STORE.get(attachment.object_key)
      extracted = object
        ? await extractAttachmentText({
            filename: attachment.filename,
            mimeType: attachment.mime_type,
            bytes: new Uint8Array(await object.arrayBuffer()),
          })
        : { text: '', status: 'failed' }
    } catch {
      extracted = { text: '', status: 'failed' }
    }

    const result = await bindings.DB.prepare(`
      UPDATE attachments
      SET search_text = ?, search_status = ?
      WHERE id = ? ${updateClause}
    `).bind(extracted.text, extracted.status, attachment.id).run()

    if (!result.meta.changes) continue
    if (extracted.status === 'indexed') indexed += 1
    else if (extracted.status === 'empty') empty += 1
    else if (extracted.status === 'unsupported') unsupported += 1
    else if (extracted.status === 'skipped') skipped += 1
    else failed += 1
  }

  const remaining = await bindings.DB.prepare(`
    SELECT COUNT(*) AS total FROM attachments WHERE search_status = 'pending'
  `).first<{ total: number }>()

  return { processed: results.length, indexed, empty, unsupported, skipped, failed, remaining: remaining?.total ?? 0 }
})
