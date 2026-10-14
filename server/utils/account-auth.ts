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

export async function requireAccountUser(event: H3Event): Promise<AccountUser> {
  const session = await requireUserSession(event)
  const id = session.user?.id
  const sessionVersion = session.secure?.sessionVersion
  const activeWorkspaceId = session.activeWorkspaceId
  if (!id || typeof sessionVersion !== 'number' || !activeWorkspaceId) {
    throw createError({ statusCode: 401, statusMessage: 'Session Courrier requise.' })
  }

  const row = await getAccountDb(event).prepare(`
    SELECT u.id, u.email, u.display_name, u.session_version, w.id AS workspace_id
    FROM users u
    JOIN workspace_memberships wm
      ON wm.user_id = u.id AND wm.status = 'active'
    JOIN workspaces w
      ON w.id = wm.workspace_id AND w.status = 'active'
    WHERE u.id = ? AND u.status = 'active'
      AND u.session_version = ? AND w.id = ?
    LIMIT 1
  `).bind(id, sessionVersion, activeWorkspaceId).first<{
    id: string
    email: string
    display_name: string
    session_version: number
    workspace_id: string
  }>()

  if (!row) throw createError({ statusCode: 401, statusMessage: 'Session Courrier expirée ou révoquée.' })
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    sessionVersion: row.session_version,
    activeWorkspaceId: row.workspace_id,
  }
}
