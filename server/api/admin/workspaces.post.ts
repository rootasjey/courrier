import { assertSameOrigin, getAccountDb, requirePlatformAdmin } from '../../utils/account-auth'

type WorkspacePayload = { name?: unknown, ownerEmail?: unknown }
type D1MutationResult = { meta?: { changes?: number } }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const actor = await requirePlatformAdmin(event)
  const db = getAccountDb(event)
  const body = await readBody<WorkspacePayload>(event)
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/gu, ' ') : ''
  const ownerEmail = typeof body?.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''

  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)
    || !ownerEmail || ownerEmail.length > 254 || !EMAIL_PATTERN.test(ownerEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'Nom d’espace ou adresse du propriétaire invalide.' })
  }

  const owner = await db.prepare(`
    SELECT id, email FROM users WHERE email = ? COLLATE NOCASE AND status = 'active' LIMIT 1
  `).bind(ownerEmail).first<{ id: string, email: string }>()
  if (!owner) {
    throw createError({ statusCode: 404, statusMessage: 'Aucun compte Courrier actif ne correspond à cette adresse.' })
  }

  const workspaceId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const now = new Date().toISOString()
  const result = await db.batch([
    db.prepare(`
      INSERT INTO workspaces (id, name, status, created_at, updated_at)
      SELECT ?, ?, 'active', ?, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active')
    `).bind(workspaceId, name, now, now, owner.id),
    db.prepare(`
      INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at)
      SELECT ?, w.id, u.id, 'owner', 'active', ?
      FROM workspaces w JOIN users u ON u.id = ? AND u.status = 'active'
      WHERE w.id = ? AND w.status = 'active'
    `).bind(membershipId, now, owner.id, workspaceId),
    db.prepare(`
      DELETE FROM workspaces
      WHERE id = ? AND NOT EXISTS (
        SELECT 1 FROM workspace_memberships
        WHERE workspace_id = ? AND role = 'owner' AND status = 'active'
      )
    `).bind(workspaceId, workspaceId),
    db.prepare(`
      INSERT INTO platform_audit_log
        (id, actor_user_id, action, target_type, target_id, workspace_id, details_json, created_at)
      SELECT ?, ?, 'workspace.created', 'workspace', ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM workspace_memberships
        WHERE id = ? AND workspace_id = ? AND user_id = ? AND role = 'owner' AND status = 'active'
      )
    `).bind(
      crypto.randomUUID(), actor.id, workspaceId, workspaceId,
      JSON.stringify({ name, initialOwnerUserId: owner.id }), now,
      membershipId, workspaceId, owner.id,
    ),
  ])

  const membershipCreated = Number((result[1] as D1MutationResult | undefined)?.meta?.changes ?? 0) > 0
  if (!membershipCreated) {
    throw createError({ statusCode: 409, statusMessage: 'Le compte propriétaire a changé d’état. Actualise la page et réessaie.' })
  }

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return { workspaceId, name, ownerEmail: owner.email }
})
