import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../../utils/account-auth'
import type { MailStorageBindings } from '../../../utils/mail-store'
import { collectMailboxPurgeData, permanentlyDeleteMailboxData } from '../../../utils/mailbox-deletion'
import { checkCloudflareMailboxRouting, setCloudflareMailboxRule } from '../../../utils/cloudflare-email-routing'

type MailboxRow = {
  id: string
  workspace_id: string
  domain: string
  address: string
  archived_at: string | null
  deletion_started_at: string | null
}
type MutationResult = { meta?: { changes?: number } }

const DELETE_LEASE_MS = 15 * 60 * 1000

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const bindings = event.context.cloudflare?.env as MailStorageBindings & {
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN?: string
    COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN?: string
  } | undefined
  if (!bindings?.MAIL_STORE) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des messages est indisponible; la boîte reste archivée.' })
  }

  const mailboxId = getRouterParam(event, 'id')?.trim() ?? ''
  const body = await readBody<{ confirmationAddress?: unknown }>(event)
  if (!mailboxId || mailboxId.length > 256 || /[\u0000-\u001f\u007f/\\]/u.test(mailboxId)) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiant de boîte invalide.' })
  }

  const mailbox = await db.prepare(`
    SELECT mb.id, mb.workspace_id, lower(d.domain) AS domain, lower(mb.address) AS address,
      mb.archived_at, mb.deletion_started_at
    FROM mailboxes mb
    JOIN workspaces w ON w.id = mb.workspace_id AND w.status = 'active'
    JOIN workspace_domains d ON d.id = mb.domain_id AND d.workspace_id = mb.workspace_id
      AND d.verification_status IN ('verified', 'legacy_unverified')
    WHERE mb.id = ?
    LIMIT 1
  `).bind(mailboxId).first<MailboxRow>()
  if (!mailbox) throw createError({ statusCode: 404, statusMessage: 'Boîte introuvable.' })
  if (!mailbox.archived_at) {
    throw createError({ statusCode: 409, statusMessage: 'Archive d’abord la boîte avant de la supprimer définitivement.' })
  }
  if (typeof body?.confirmationAddress !== 'string'
    || body.confirmationAddress.trim().toLowerCase() !== mailbox.address) {
    throw createError({ statusCode: 400, statusMessage: 'Saisis l’adresse exacte de la boîte pour confirmer sa suppression.' })
  }

  const now = new Date().toISOString()
  const resumedDeletion = mailbox.deletion_started_at !== null
  const leaseCutoff = new Date(Date.now() - DELETE_LEASE_MS).toISOString()
  const claim = await db.prepare(`
    UPDATE mailboxes
    SET deletion_started_at = COALESCE(deletion_started_at, ?), deletion_claimed_at = ?
    WHERE id = ? AND archived_at IS NOT NULL
      AND (deletion_claimed_at IS NULL OR deletion_claimed_at < ?)
  `).bind(now, now, mailbox.id, leaseCutoff).run() as MutationResult
  if (Number(claim.meta?.changes ?? 0) !== 1) {
    throw createError({ statusCode: 409, statusMessage: 'Une suppression de cette boîte est déjà en cours. Réessaie après quelques minutes.' })
  }

  const resetDeletionClaim = async (resetStartedAt: boolean) => {
    await db.prepare(`
      UPDATE mailboxes
      SET deletion_claimed_at = NULL${resetStartedAt ? ', deletion_started_at = NULL' : ''}
      WHERE id = ? AND archived_at IS NOT NULL
    `).bind(mailbox.id).run().catch(() => undefined)
  }

  let deletionStage = 'routing'
  try {
    console.info('[courrier] Mailbox deletion reached stage.', { stage: deletionStage })
    if (bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN) {
      await setCloudflareMailboxRule({
        domain: mailbox.domain,
        address: mailbox.address,
        enabled: false,
        token: bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_WRITE_TOKEN,
      })
    } else {
      const [routing] = await checkCloudflareMailboxRouting({
        domain: mailbox.domain,
        addresses: [mailbox.address],
        token: bindings.COURRIER_CLOUDFLARE_EMAIL_ROUTING_TOKEN,
      })
      if (routing?.state !== 'disabled') {
        await resetDeletionClaim(!resumedDeletion)
        throw createError({
          statusCode: routing?.state === 'unavailable' ? 503 : 409,
          statusMessage: 'Désactive la règle exacte dans Cloudflare avant de supprimer la boîte.',
        })
      }
    }

    deletionStage = 'collect-purge-data'
    console.info('[courrier] Mailbox deletion reached stage.', { stage: deletionStage })
    const target = {
      id: mailbox.id,
      workspaceId: mailbox.workspace_id,
      domain: mailbox.domain,
      address: mailbox.address,
    }
    const purgeData = await collectMailboxPurgeData(db, target)
    if (purgeData.pendingForward || purgeData.pendingDraft) {
      await resetDeletionClaim(!resumedDeletion)
      throw createError({ statusCode: 409, statusMessage: 'Attends la fin des transferts et envois en cours avant de supprimer la boîte.' })
    }

    deletionStage = 'delete-storage-objects'
    console.info('[courrier] Mailbox deletion reached stage.', { stage: deletionStage, objectCount: purgeData.objectKeys.length })
    const hasArchivedMailbox = `EXISTS (
      SELECT 1 FROM mailboxes
      WHERE id = ? AND workspace_id = ?
        AND archived_at IS NOT NULL AND deletion_started_at IS NOT NULL
    )`
    const deleted = await permanentlyDeleteMailboxData({
      db,
      mailStore: bindings.MAIL_STORE,
      target,
      actorId: actor.id,
      data: purgeData,
      deletedAt: new Date().toISOString(),
      archivedGuardSql: hasArchivedMailbox,
    })

    deletionStage = 'complete'
    if (!deleted) {
      await resetDeletionClaim(false)
      throw createError({ statusCode: 409, statusMessage: 'La boîte a changé pendant sa suppression. Actualise la console et vérifie son état.' })
    }

    setResponseHeader(event, 'Cache-Control', 'no-store')
    return { mailboxId: mailbox.id, deleted: true, messagesDeleted: purgeData.messages.length, storedObjectsDeleted: purgeData.objectKeys.length }
  } catch (error) {
    console.error('[courrier] Mailbox deletion failed.', { stage: deletionStage, errorName: error instanceof Error ? error.name : 'unknown' })
    if (!(error && typeof error === 'object' && 'statusCode' in error)) await resetDeletionClaim(false)
    throw error
  }
})
