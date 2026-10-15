import { assertSameOrigin, getAccountDb, requireSessionIdentity } from '../../../utils/account-auth'
import { hashInvitationToken, INVITATION_TOKEN_PATTERN, normalizeInvitationEmail } from '../../../utils/workspace-invitations'

type AcceptPayload = { password?: unknown, displayName?: unknown }

type InviteRecord = {
  id: string
  workspace_id: string
  email: string
  role: 'member' | 'viewer'
  workspace_name: string
  expires_at: string
}

type AccountRecord = {
  id: string
  email: string
  display_name: string
  status: 'active' | 'suspended' | 'pending'
  session_version: number
}

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const token = getRouterParam(event, 'token') ?? ''
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    throw createError({ statusCode: 404, statusMessage: 'Cette invitation est introuvable ou n’est plus valide.' })
  }

  const db = getAccountDb(event)
  const tokenHash = await hashInvitationToken(token)
  const invitation = await db.prepare(`
    SELECT i.id, i.workspace_id, i.email, i.role, i.expires_at, w.name AS workspace_name
    FROM workspace_invitations i
    JOIN workspaces w ON w.id = i.workspace_id AND w.status = 'active'
    WHERE i.token_hash = ? AND i.role IN ('member', 'viewer')
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND datetime(i.expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first<InviteRecord>()
  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Cette invitation est introuvable ou n’est plus valide.' })

  const userSession = await getUserSession(event)
  let identity = null
  if (userSession.user?.id) identity = await requireSessionIdentity(event)
  if (identity && normalizeInvitationEmail(identity.email) !== invitation.email) {
    throw createError({ statusCode: 403, statusMessage: 'Connecte-toi avec le compte invité pour accepter cette invitation.' })
  }

  const existingUser = identity
    ? await db.prepare(`
      SELECT id, email, display_name, status, session_version FROM users WHERE id = ? LIMIT 1
    `).bind(identity.id).first<AccountRecord>()
    : await db.prepare(`
      SELECT id, email, display_name, status, session_version FROM users WHERE email = ? COLLATE NOCASE LIMIT 1
    `).bind(invitation.email).first<AccountRecord>()

  if (existingUser && existingUser.status !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Ce compte n’est pas actif. Contacte un administrateur Courrier.' })
  }
  if (existingUser && !identity) {
    throw createError({ statusCode: 409, statusMessage: 'Un compte existe déjà pour cette adresse. Connecte-toi à ce compte, puis ouvre de nouveau l’invitation.' })
  }

  const existingMembership = existingUser
    ? await db.prepare(`
      SELECT status FROM workspace_memberships WHERE workspace_id = ? AND user_id = ? LIMIT 1
    `).bind(invitation.workspace_id, existingUser.id).first<{ status: string }>()
    : null
  if (existingMembership) {
    throw createError({ statusCode: 409, statusMessage: existingMembership.status === 'suspended'
      ? 'Ton accès à cet espace est suspendu. Contacte un administrateur pour le réactiver.'
      : 'Ton compte a déjà accès à cet espace.' })
  }

  const body = await readBody<AcceptPayload>(event)
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const isNewAccount = !existingUser

  if (isNewAccount && (!displayName || displayName.length > 80 || /[\u0000-\u001f\u007f]/u.test(displayName))) {
    throw createError({ statusCode: 400, statusMessage: 'Saisis un nom affiché de 1 à 80 caractères.' })
  }
  if (isNewAccount && (password.length < 16 || password.length > 1024)) {
    throw createError({ statusCode: 400, statusMessage: 'Choisis un mot de passe de 16 caractères minimum.' })
  }

  const userId = existingUser?.id ?? crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const now = new Date().toISOString()
  const statements = []

  if (isNewAccount) {
    const passwordHash = await hashPassword(password)
    statements.push(db.prepare(`
      INSERT INTO users (id, email, display_name, status, session_version, created_at, updated_at)
      SELECT ?, ?, ?, 'active', 1, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM workspace_invitations i JOIN workspaces w ON w.id = i.workspace_id
        WHERE i.token_hash = ? AND i.role IN ('member', 'viewer')
          AND i.accepted_at IS NULL AND i.revoked_at IS NULL
          AND datetime(i.expires_at) > datetime('now') AND w.status = 'active'
      ) AND NOT EXISTS (SELECT 1 FROM users WHERE email = ? COLLATE NOCASE)
    `).bind(userId, invitation.email, displayName, now, now, tokenHash, invitation.email))
    statements.push(db.prepare(`
      INSERT INTO password_credentials (user_id, password_hash, created_at, updated_at)
      SELECT ?, ?, ?, ? FROM users WHERE id = ? AND status = 'active'
    `).bind(userId, passwordHash, now, now, userId))
  }

  statements.push(db.prepare(`
    INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at)
    SELECT ?, i.workspace_id, ?, i.role, 'active', ?
    FROM workspace_invitations i
    JOIN workspaces w ON w.id = i.workspace_id AND w.status = 'active'
    JOIN users u ON u.id = ? AND u.status = 'active'
    WHERE i.token_hash = ? AND i.email = ? COLLATE NOCASE
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      AND datetime(i.expires_at) > datetime('now')
      AND NOT EXISTS (
        SELECT 1 FROM workspace_memberships current
        WHERE current.workspace_id = i.workspace_id AND current.user_id = u.id
      )
  `).bind(membershipId, userId, now, userId, tokenHash, invitation.email))
  statements.push(db.prepare(`
    UPDATE workspace_invitations SET accepted_at = ?
    WHERE token_hash = ? AND email = ? COLLATE NOCASE AND role IN ('member', 'viewer')
      AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
      AND EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.id = ? AND wm.workspace_id = workspace_invitations.workspace_id AND wm.user_id = ?
      )
  `).bind(now, tokenHash, invitation.email, membershipId, userId))
  statements.push(db.prepare(`
    INSERT INTO platform_audit_log
      (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
    SELECT ?, ?, 'workspace_invitation.accept', 'workspace_invitation', ?, ?, ?, ?
    WHERE changes() > 0
  `).bind(
    crypto.randomUUID(), userId, invitation.id, invitation.workspace_id,
    JSON.stringify({ role: invitation.role, accountCreated: isNewAccount }), now,
  ))

  try {
    await db.batch(statements)
  } catch (error) {
    console.error('[courrier] Invitation acceptance transaction failed.', { invitationId: invitation.id, error })
    throw createError({ statusCode: 409, statusMessage: 'L’invitation a changé d’état ou le compte n’a pas pu être créé. Recharge la page et réessaie.' })
  }

  const account = await db.prepare(`
    SELECT u.id, u.email, u.display_name, u.session_version, wm.workspace_id
    FROM users u
    JOIN workspace_memberships wm ON wm.user_id = u.id AND wm.workspace_id = ? AND wm.status = 'active'
    JOIN workspace_invitations i ON i.workspace_id = wm.workspace_id AND i.token_hash = ? AND i.accepted_at IS NOT NULL
    WHERE u.id = ? AND u.status = 'active'
    LIMIT 1
  `).bind(invitation.workspace_id, tokenHash, userId).first<{
    id: string, email: string, display_name: string, session_version: number, workspace_id: string,
  }>()
  if (!account) {
    const registered = await db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1')
      .bind(invitation.email).first<{ id: string }>()
    if (registered) throw createError({ statusCode: 409, statusMessage: 'Un compte existe déjà pour cette adresse. Connecte-toi à ce compte, puis ouvre de nouveau l’invitation.' })
    throw createError({ statusCode: 409, statusMessage: 'L’invitation a changé d’état. Recharge la page et réessaie.' })
  }

  await replaceUserSession(event, {
    user: { id: account.id, email: account.email, displayName: account.display_name },
    secure: { sessionVersion: account.session_version },
    activeWorkspaceId: account.workspace_id,
  })
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  return { accepted: true, workspaceId: account.workspace_id }
})
