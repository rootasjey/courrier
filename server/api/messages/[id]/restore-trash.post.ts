import type { MailStorageBindings } from '../../../utils/mail-store'
import { getWorkspaceUserFromContext, workspaceDomainScope, workspaceMessageScope } from '../../../utils/account-auth'

export default defineEventHandler(async (event) => {
  const user = getWorkspaceUserFromContext(event)
  const bindings = event.context.cloudflare?.env as Pick<MailStorageBindings, 'DB'> | undefined
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des emails n’est pas prêt.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant de message manquant.' })

  const result = await bindings.DB.prepare(`
    UPDATE messages SET trashed_at = NULL
    WHERE id = ? AND trashed_at IS NOT NULL
      AND ${workspaceMessageScope('messages', user.id)}
  `).bind(id, user.activeWorkspaceId).run()

  if (!result.meta.changes) {
    throw createError({ statusCode: 404, statusMessage: 'Message introuvable dans la corbeille.' })
  }

  return { restored: true }
})
