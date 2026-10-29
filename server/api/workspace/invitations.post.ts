import { assertSameOrigin, getAccountDb, requireFreshAccountMfa, requireWorkspacePermission } from '../../utils/account-auth'
import { createWorkspaceInvitation, normalizeInvitationEmail, type WorkspaceInvitationRole } from '../../utils/workspace-invitations'

type InvitationPayload = { email?: unknown, role?: unknown }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requireWorkspacePermission(event, 'members.manage')
  await requireFreshAccountMfa(event, actor.id)
  const body = await readBody<InvitationPayload>(event)
  const email = normalizeInvitationEmail(body?.email)
  const role = body?.role

  if (!email || (role !== 'member' && role !== 'viewer' && role !== 'admin')) {
    throw createError({ statusCode: 400, statusMessage: 'Adresse ou rôle invalide.' })
  }

  const membership = await getAccountDb(event).prepare(`
    SELECT role FROM workspace_memberships
    WHERE workspace_id = ? AND user_id = ? AND status = 'active'
    LIMIT 1
  `).bind(actor.activeWorkspaceId, actor.id).first<{ role: string }>()
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Ton adhésion à cet espace n’est plus active.' })
  if (role === 'admin' && membership.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Seul le propriétaire peut inviter un administrateur d’espace.' })
  }

  const invitation = await createWorkspaceInvitation(event, actor, actor.activeWorkspaceId, email, role as WorkspaceInvitationRole, {
    requireWorkspaceManager: true,
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return invitation
})
