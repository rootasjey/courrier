import { getAccountDb } from '../../utils/account-auth'
import { hashInvitationToken, INVITATION_TOKEN_PATTERN } from '../../utils/workspace-invitations'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    throw createError({ statusCode: 404, statusMessage: 'Cette invitation est introuvable ou n’est plus valide.' })
  }

  const invitation = await getAccountDb(event).prepare(`
    SELECT i.email, i.role, i.expires_at, w.name AS workspace_name
    FROM workspace_invitations i
    JOIN workspaces w ON w.id = i.workspace_id AND w.status = 'active'
    WHERE i.token_hash = ? AND i.role IN ('member', 'viewer')
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND datetime(i.expires_at) > datetime('now')
    LIMIT 1
  `).bind(await hashInvitationToken(token)).first<{
    email: string
    role: 'member' | 'viewer'
    expires_at: string
    workspace_name: string
  }>()

  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Cette invitation est introuvable ou n’est plus valide.' })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  return {
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expires_at,
    workspaceName: invitation.workspace_name,
  }
})
