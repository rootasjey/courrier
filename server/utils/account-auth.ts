import type { H3Event } from 'h3'
import type { WorkspaceMailPermission } from './workspace-access-policy'

export type AccountDb = {
  prepare: (query: string) => AccountDbStatement
  batch: (statements: AccountDbStatement[]) => Promise<unknown[]>
}

export type AccountDbStatement = {
  bind: (...values: unknown[]) => AccountDbStatement
  first: <T>() => Promise<T | null>
  all: <T>() => Promise<{ results: T[] }>
  run: () => Promise<unknown>
}

export type AccountUser = {
  id: string
  email: string
  displayName: string
  sessionVersion: number
  activeWorkspaceId: string
}

export type AccountIdentity = Omit<AccountUser, 'activeWorkspaceId'>

export function getAccountDb(event: H3Event) {
  const cloudflare = event.context.cloudflare as { env?: { DB?: AccountDb } } | undefined
  const db = cloudflare?.env?.DB
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'Le stockage des comptes est indisponible.' })
  }
  return db
}

export function assertSameOrigin(event: H3Event) {
  const origin = getRequestHeader(event, 'origin')
  if (!origin) throw createError({ statusCode: 403, statusMessage: 'Origine de requête manquante.' })

  let originUrl: URL
  try { originUrl = new URL(origin) } catch {
    throw createError({ statusCode: 403, statusMessage: 'Origine de requête invalide.' })
  }

  if (originUrl.origin !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, statusMessage: 'Origine de requête invalide.' })
  }
}

export async function requireSessionIdentity(event: H3Event): Promise<AccountIdentity> {
  const session = await requireUserSession(event)
  const id = session.user?.id
  const sessionVersion = session.secure?.sessionVersion
  if (!id || typeof sessionVersion !== 'number') {
    throw createError({ statusCode: 401, statusMessage: 'Session Courrier requise.' })
  }

  const row = await getAccountDb(event).prepare(`
    SELECT u.id, u.email, u.display_name, u.session_version
    FROM users u
    WHERE u.id = ? AND u.status = 'active'
      AND u.session_version = ?
    LIMIT 1
  `).bind(id, sessionVersion).first<{
    id: string
    email: string
    display_name: string
    session_version: number
  }>()

  if (!row) throw createError({ statusCode: 401, statusMessage: 'Session Courrier expirée ou révoquée.' })
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    sessionVersion: row.session_version,
  }
}

export async function isPlatformAdmin(event: H3Event, userId: string) {
  const admin = await getAccountDb(event).prepare(`
    SELECT 1 AS allowed FROM platform_admins WHERE user_id = ? LIMIT 1
  `).bind(userId).first<{ allowed: number }>()
  return Boolean(admin)
}

export async function requirePlatformAdmin(event: H3Event): Promise<AccountIdentity> {
  const identity = await requireSessionIdentity(event)
  if (!await isPlatformAdmin(event, identity.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Accès administrateur requis.' })
  }
  return identity
}

export async function requireAccountUser(event: H3Event): Promise<AccountUser> {
  const identity = await requireSessionIdentity(event)
  const activeWorkspaceId = (await requireUserSession(event)).activeWorkspaceId
  if (typeof activeWorkspaceId !== 'string' || !activeWorkspaceId) {
    throw createError({ statusCode: 403, statusMessage: 'Aucun espace Courrier actif.' })
  }

  const membership = await getAccountDb(event).prepare(`
    SELECT w.id AS workspace_id
    FROM workspace_memberships wm
    JOIN workspaces w ON w.id = wm.workspace_id AND w.status = 'active'
    WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
    LIMIT 1
  `).bind(identity.id, activeWorkspaceId).first<{ workspace_id: string }>()
  if (!membership) throw createError({ statusCode: 401, statusMessage: 'Session Courrier expirée ou révoquée.' })

  return { ...identity, activeWorkspaceId: membership.workspace_id }
}

export async function requireWorkspacePermission(
  event: H3Event,
  permission: WorkspaceMailPermission,
): Promise<AccountUser> {
  const user = await requireAccountUser(event)
  const allowed = await getAccountDb(event).prepare(`
    SELECT 1 AS allowed
    FROM workspace_memberships wm
    JOIN role_permissions rp ON rp.role = wm.role
    WHERE wm.user_id = ? AND wm.workspace_id = ? AND wm.status = 'active'
      AND rp.permission = ?
    LIMIT 1
  `).bind(user.id, user.activeWorkspaceId, permission).first<{ allowed: number }>()

  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Cette action n’est pas autorisée dans cet espace.' })
  ;(event.context as typeof event.context & { accountUser?: AccountUser }).accountUser = user
  return user
}

export function getWorkspaceUserFromContext(event: H3Event): AccountUser {
  const user = (event.context as typeof event.context & { accountUser?: AccountUser }).accountUser
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Session Courrier requise.' })
  return user
}

function accountUserIdSqlLiteral(userId: string) {
  // The session user id has already been loaded from D1. Keep this literal
  // constrained to UUIDs because scope fragments are interpolated into SQL.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new TypeError('A validated Courrier account user is required for mailbox access checks.')
  }
  return `'${userId.toLowerCase()}'`
}

export function workspaceDomainScope(column: string, userId: string) {
  if (!/^[a-z][a-z0-9_]*\.(?:mailbox_domain|domain)$/.test(column)) {
    throw new TypeError('Invalid mailbox-domain SQL column.')
  }
  return `EXISTS (
    SELECT 1 FROM workspace_domains AS account_workspace_domain
    JOIN workspaces AS account_workspace
      ON account_workspace.id = account_workspace_domain.workspace_id
    WHERE lower(account_workspace_domain.domain) = lower(${column})
      AND account_workspace_domain.workspace_id = ?
      AND account_workspace.status = 'active'
      AND account_workspace_domain.verification_status IN ('verified', 'legacy_unverified')
      AND EXISTS (
        SELECT 1 FROM mailboxes AS account_domain_mailbox
        WHERE account_domain_mailbox.domain_id = account_workspace_domain.id
          AND account_domain_mailbox.status = 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM mailboxes AS account_ungranted_domain_mailbox
        WHERE account_ungranted_domain_mailbox.domain_id = account_workspace_domain.id
          AND account_ungranted_domain_mailbox.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM mailbox_access_grants AS account_domain_grant
            WHERE account_domain_grant.workspace_id = account_ungranted_domain_mailbox.workspace_id
              AND account_domain_grant.mailbox_id = account_ungranted_domain_mailbox.id
              AND account_domain_grant.user_id = ${accountUserIdSqlLiteral(userId)}
              AND account_domain_grant.status = 'active'
          )
      )
  )`
}

export function workspaceMessageScope(tableAlias: string, userId: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(tableAlias)) {
    throw new TypeError('Invalid message SQL table alias.')
  }
  return `EXISTS (
    SELECT 1
    FROM mailboxes AS account_message_mailbox
    JOIN mailbox_access_grants AS account_message_grant
      ON account_message_grant.mailbox_id = account_message_mailbox.id
      AND account_message_grant.workspace_id = account_message_mailbox.workspace_id
      AND account_message_grant.user_id = ${accountUserIdSqlLiteral(userId)}
      AND account_message_grant.status = 'active'
    JOIN workspace_domains AS account_message_domain
      ON account_message_domain.id = account_message_mailbox.domain_id
      AND account_message_domain.workspace_id = account_message_mailbox.workspace_id
      AND account_message_domain.verification_status IN ('verified', 'legacy_unverified')
    JOIN workspaces AS account_message_workspace
      ON account_message_workspace.id = account_message_mailbox.workspace_id
      AND account_message_workspace.status = 'active'
    WHERE account_message_mailbox.workspace_id = ?
      AND account_message_mailbox.status = 'active'
      AND lower(account_message_mailbox.address) = lower(trim(
        CASE WHEN ${tableAlias}.is_outgoing = 1
          THEN ${tableAlias}.envelope_from
          ELSE ${tableAlias}.envelope_to
        END
      ))
  )`
}

export function workspaceReplyDraftScope(tableAlias: string, userId: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(tableAlias)) {
    throw new TypeError('Invalid reply draft SQL table alias.')
  }
  return `EXISTS (
    SELECT 1 FROM messages AS account_reply_message
    WHERE account_reply_message.id = ${tableAlias}.reply_to_message_id
      AND ${workspaceMessageScope('account_reply_message', userId)}
  )`
}

export function workspaceOutgoingDraftScope(tableAlias: string, userId: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(tableAlias)) {
    throw new TypeError('Invalid outgoing draft SQL table alias.')
  }
  return `EXISTS (
    SELECT 1
    FROM mailboxes AS account_draft_mailbox
    JOIN mailbox_access_grants AS account_draft_grant
      ON account_draft_grant.mailbox_id = account_draft_mailbox.id
      AND account_draft_grant.workspace_id = account_draft_mailbox.workspace_id
      AND account_draft_grant.user_id = ${accountUserIdSqlLiteral(userId)}
      AND account_draft_grant.status = 'active'
    JOIN workspace_domains AS account_draft_domain
      ON account_draft_domain.id = account_draft_mailbox.domain_id
      AND account_draft_domain.workspace_id = account_draft_mailbox.workspace_id
      AND account_draft_domain.verification_status IN ('verified', 'legacy_unverified')
    JOIN workspaces AS account_draft_workspace
      ON account_draft_workspace.id = account_draft_mailbox.workspace_id
      AND account_draft_workspace.status = 'active'
    WHERE account_draft_mailbox.id = ${tableAlias}.mailbox_id
      AND account_draft_mailbox.workspace_id = ${tableAlias}.workspace_id
      AND account_draft_mailbox.workspace_id = ?
      AND account_draft_mailbox.status = 'active'
  )`
}

export async function requireMailboxAddressAccess(
  db: AccountDb,
  userId: string,
  workspaceId: string,
  address: string,
) {
  const mailbox = await db.prepare(`
    SELECT mb.id
    FROM mailboxes mb
    JOIN workspace_domains wd ON wd.id = mb.domain_id AND wd.workspace_id = mb.workspace_id
    JOIN workspaces w ON w.id = mb.workspace_id
    JOIN mailbox_access_grants mag
      ON mag.mailbox_id = mb.id AND mag.workspace_id = mb.workspace_id
    WHERE mb.workspace_id = ? AND lower(mb.address) = lower(?)
      AND mb.status = 'active' AND wd.verification_status IN ('verified', 'legacy_unverified')
      AND w.status = 'active'
      AND mag.user_id = ? AND mag.status = 'active'
    LIMIT 1
  `).bind(workspaceId, address, userId).first<{ id: string }>()
  if (!mailbox) throw createError({ statusCode: 403, statusMessage: 'Aucun accès à cette boîte mail.' })
  return mailbox.id
}
