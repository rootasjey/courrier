import type { H3Event } from 'h3'
import { getAccountDb, type AccountIdentity } from './account-auth'

export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export type WorkspaceInvitationRole = 'admin' | 'member' | 'viewer'

type D1MutationResult = { meta?: { changes?: number } }

export function normalizeInvitationEmail(value: unknown) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLocaleLowerCase('en-US')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function createInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function hashInvitationToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function escapeInvitationHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

const invitationCopy = {
  fr: {
    roleNames: { admin: 'administrateur·rice d’espace', member: 'membre', viewer: 'membre en lecture seule' },
    subject: (workspace: string) => `Invitation à rejoindre ${workspace} sur Courrier`,
    heading: 'Tu es invité·e !',
    introduction: (workspace: string, role: string) => `Tu as été invité·e à rejoindre l’espace « ${workspace} » sur Courrier en tant que ${role}.`,
    invitedAddress: (email: string) => `Adresse invitée : ${email}`,
    accept: (expires: string) => `Accepte l’invitation avant le ${expires} :`,
    singleUse: 'Ce lien est personnel et ne peut être utilisé qu’une seule fois.',
    mailboxAccess: 'L’adhésion à l’espace ne donne pas automatiquement accès aux boîtes mail. Un administrateur doit attribuer ces accès séparément.',
    button: 'Accepter l’invitation',
  },
  en: {
    roleNames: { admin: 'workspace administrator', member: 'member', viewer: 'read-only member' },
    subject: (workspace: string) => `Invitation to join ${workspace} on Courrier`,
    heading: 'You’re invited!',
    introduction: (workspace: string, role: string) => `You’ve been invited to join the “${workspace}” workspace in Courrier as a ${role}.`,
    invitedAddress: (email: string) => `Invited address: ${email}`,
    accept: (expires: string) => `Accept this invitation by ${expires}:`,
    singleUse: 'This personal link can only be used once.',
    mailboxAccess: 'Joining the workspace does not automatically grant access to its mailboxes. An administrator must assign that access separately.',
    button: 'Accept invitation',
  },
} as const

export async function createWorkspaceInvitation(
  event: H3Event,
  actor: AccountIdentity,
  workspaceId: string,
  email: string,
  role: WorkspaceInvitationRole,
  options: { requireWorkspaceManager?: boolean } = {},
) {
  const db = getAccountDb(event)
  const bindings = (event.context.cloudflare as { env?: { EMAIL?: SendEmail } } | undefined)?.env
  if (!bindings?.EMAIL) throw createError({ statusCode: 503, statusMessage: 'L’envoi des invitations est indisponible.' })

  const workspace = await db.prepare(`
    SELECT id, name FROM workspaces WHERE id = ? AND status = 'active' LIMIT 1
  `).bind(workspaceId).first<{ id: string, name: string }>()
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Espace actif introuvable.' })

  const existingMember = await db.prepare(`
    SELECT wm.status, u.status AS user_status
    FROM workspace_memberships wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ? AND lower(u.email) = ?
    LIMIT 1
  `).bind(workspaceId, email).first<{ status: string, user_status: string }>()
  if (existingMember) {
    throw createError({ statusCode: 409, statusMessage: existingMember.status === 'suspended'
      ? 'Ce compte a déjà un accès suspendu dans cet espace. Réactive-le avant de le réinviter.'
      : 'Cette adresse a déjà un accès à cet espace.' })
  }

  const pending = await db.prepare(`
    SELECT id FROM workspace_invitations
    WHERE workspace_id = ? AND email = ? COLLATE NOCASE
      AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).bind(workspaceId, email).first<{ id: string }>()
  if (pending) throw createError({ statusCode: 409, statusMessage: 'Une invitation est déjà en attente pour cette adresse.' })

  const token = createInvitationToken()
  const tokenHash = await hashInvitationToken(token)
  const invitationId = crypto.randomUUID()
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  let invitationCreated = false
  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE workspace_invitations
        SET revoked_at = ?
        WHERE workspace_id = ? AND email = ? COLLATE NOCASE
          AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) <= datetime('now')
      `).bind(now, workspaceId, email),
      db.prepare(`
        INSERT INTO workspace_invitations
          (id, workspace_id, email, role, token_hash, expires_at, created_by_user_id, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (
          SELECT COUNT(*) FROM workspace_invitations
          WHERE created_by_user_id = ? AND datetime(created_at) > datetime('now', '-1 hour')
        ) < 10
          AND (? = 0 OR EXISTS (
            SELECT 1
            FROM workspace_memberships actor_membership
            JOIN role_permissions rp ON rp.role = actor_membership.role AND rp.permission = 'members.manage'
            WHERE actor_membership.workspace_id = ? AND actor_membership.user_id = ?
              AND actor_membership.status = 'active'
              AND (? <> 'admin' OR actor_membership.role = 'owner')
          ))
      `).bind(
        invitationId, workspaceId, email, role, tokenHash, expiresAt, actor.id, now, actor.id,
        options.requireWorkspaceManager ? 1 : 0, workspaceId, actor.id, role,
      ),
      db.prepare(`
        INSERT INTO platform_audit_log
          (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
        SELECT ?, ?, 'workspace_invitation.created', 'workspace_invitation', ?, ?, ?, ?
        WHERE changes() > 0
      `).bind(crypto.randomUUID(), actor.id, invitationId, workspaceId, JSON.stringify({ email, role }), now),
    ])
    invitationCreated = Boolean((results[1] as D1MutationResult | undefined)?.meta?.changes)
  } catch (error) {
    const racedInvitation = await db.prepare(`
      SELECT id FROM workspace_invitations
      WHERE workspace_id = ? AND email = ? COLLATE NOCASE
        AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
      LIMIT 1
    `).bind(workspaceId, email).first<{ id: string }>()
    if (racedInvitation) throw createError({ statusCode: 409, statusMessage: 'Une invitation est déjà en attente pour cette adresse.' })
    throw error
  }
  if (!invitationCreated) {
    if (options.requireWorkspaceManager) {
      const stillAuthorized = await db.prepare(`
        SELECT 1 AS allowed
        FROM workspace_memberships actor_membership
        JOIN role_permissions rp ON rp.role = actor_membership.role AND rp.permission = 'members.manage'
        WHERE actor_membership.workspace_id = ? AND actor_membership.user_id = ?
          AND actor_membership.status = 'active'
          AND (? <> 'admin' OR actor_membership.role = 'owner')
        LIMIT 1
      `).bind(workspaceId, actor.id, role).first<{ allowed: number }>()
      if (!stillAuthorized) throw createError({ statusCode: 403, statusMessage: 'Cette action n’est plus autorisée dans cet espace.' })
    }
    throw createError({ statusCode: 429, statusMessage: 'Trop d’invitations ont été envoyées récemment. Réessaie dans une heure.' })
  }

  const invitationUrl = new URL(`/invitation/${token}`, getRequestURL(event)).toString()
  const plainWorkspace = workspace.name.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 160) || 'Courrier'
  const safeWorkspace = escapeInvitationHtml(plainWorkspace)
  const safeEmail = escapeInvitationHtml(email)
  const safeUrl = escapeInvitationHtml(invitationUrl)
  const locale = getCookie(event, 'courrier-locale') === 'en' ? 'en' : 'fr'
  const copy = invitationCopy[locale]
  const roleName = copy.roleNames[role]
  const expires = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(expiresAt))
  const subjectWorkspace = plainWorkspace.slice(0, 120)

  try {
    await bindings.EMAIL.send({
      from: { email: 'courrier-test@verbatims.cc', name: 'Courrier' },
      to: email,
      subject: copy.subject(subjectWorkspace),
      text: `${copy.introduction(plainWorkspace, roleName)}\n\n${copy.invitedAddress(email)}\n\n${copy.accept(expires)}\n${invitationUrl}\n\n${copy.singleUse} ${copy.mailboxAccess}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#282533;max-width:600px;margin:auto;padding:32px"><p style="color:#6655d8;font-weight:700">Courrier</p><h1>${copy.heading}</h1><p>${copy.introduction(safeWorkspace, roleName)}</p><p>${copy.invitedAddress(safeEmail)}</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#6655d8;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">${copy.button}</a></p><p>${copy.accept(expires)} ${copy.singleUse}</p><p style="font-size:13px;color:#716c7e">${copy.mailboxAccess}</p></div>`,
    })
  } catch (error) {
    const revokedAt = new Date().toISOString()
    try {
      await db.batch([
        db.prepare(`
          UPDATE workspace_invitations SET revoked_at = ?
          WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL
        `).bind(revokedAt, invitationId),
        db.prepare(`
          INSERT INTO platform_audit_log
            (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
          VALUES (?, ?, 'workspace_invitation.email_failed', 'workspace_invitation', ?, ?, '{}', ?)
        `).bind(crypto.randomUUID(), actor.id, invitationId, workspaceId, revokedAt),
      ])
    } catch (auditError) {
      console.error('[courrier] Failed invitation could not be revoked or audited.', { invitationId, auditError })
    }
    console.error('[courrier] Invitation email could not be delivered.', { invitationId, error })
    throw createError({ statusCode: 502, statusMessage: 'L’invitation n’a pas pu être envoyée. Elle a été annulée ; réessaie.' })
  }

  try {
    await db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      VALUES (?, ?, 'workspace_invitation.email_sent', 'workspace_invitation', ?, ?, '{}', ?)
    `).bind(crypto.randomUUID(), actor.id, invitationId, workspaceId, new Date().toISOString()).run()
  } catch (error) {
    console.error('[courrier] Invitation sent but delivery audit could not be saved.', { invitationId, error })
  }

  return { invitationId, workspaceId, email, role, expiresAt }
}
