export type R2BackupBindings = {
  MAIL_STORE: R2Bucket
  BACKUP_STORE: R2Bucket
}

/**
 * Copy retained mail objects into a private mirror bucket. Mail object keys are
 * immutable and content-addressed, so existing matching copies can be skipped.
 */
export async function mirrorMailObjects(bindings: R2BackupBindings) {
  let cursor: string | undefined
  let copied = 0
  let skipped = 0

  do {
    const page = await bindings.MAIL_STORE.list({
      prefix: 'messages/',
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    })

    for (const object of page.objects) {
      const backupKey = `mirror/${object.key}`
      const existing = await bindings.BACKUP_STORE.head(backupKey)

      // Source keys are content-addressed and immutable; size is enough to
      // identify a completed mirror without relying on R2 ETag behavior.
      if (existing?.size === object.size) {
        skipped++
        continue
      }

      const source = await bindings.MAIL_STORE.get(object.key)
      if (!source) {
        throw new Error(`Mail object disappeared during backup (${object.size} bytes).`)
      }

      await bindings.BACKUP_STORE.put(backupKey, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      })
      copied++
    }

    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  console.info('[courrier] R2 mail mirror completed.', { copied, skipped })
  return { copied, skipped }
}
