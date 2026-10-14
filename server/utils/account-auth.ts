import type { H3Event } from 'h3'

export type AccountDb = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>
      all: <T>() => Promise<{ results: T[] }>
      run: () => Promise<unknown>
    }
    first: <T>() => Promise<T | null>
  }
}

export type AccountUser = {
  id: string
  email: string
  displayName: string
  sessionVersion: number
  activeWorkspaceId: string
}

export type AccountIdentity = Omit<AccountUser, 'activeWorkspaceId'>

export type WorkspaceMailPermission =
  | 'mail.read'
  | 'mail.write'
  | 'mail.send'
  | 'mail.classify'
  | 'mail.trash'
  | 'mail.export'

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

export function workspaceDomainScope(column: string) {
  if (!/^[a-z][a-z0-9_]*\.mailbox_domain$/.test(column)) {
    throw new TypeError('Invalid mailbox-domain SQL column.')
  }
  return `EXISTS (
    SELECT 1 FROM workspace_domains AS account_workspace_domain
    WHERE lower(account_workspace_domain.domain) = lower(${column})
      AND account_workspace_domain.workspace_id = ?
      AND account_workspace_domain.verification_status != 'suspended'
  )`
}
