import { assertSameOrigin, requirePlatformAdmin } from '../../utils/account-auth'
import { createWorkspaceInvitation, normalizeInvitationEmail } from '../../utils/workspace-invitations'

type InvitationPayload = { workspaceId?: unknown, email?: unknown, role?: unknown }

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const body = await readBody<InvitationPayload>(event)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : ''
  const email = normalizeInvitationEmail(body?.email)
  const role = body?.role

  if (!workspaceId || workspaceId.length > 256 || /[\u0000-\u001f\u007f]/u.test(workspaceId) || !email
    || (role !== 'member' && role !== 'viewer')) {
    throw createError({ statusCode: 400, statusMessage: 'Espace, adresse ou rôle invalide.' })
  }

  const invitation = await createWorkspaceInvitation(event, actor, workspaceId, email, role)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return invitation
})
