const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_PART_PATTERN = /^[a-z0-9]+(?:[._+-][a-z0-9]+)*$/
const MAX_INITIAL_USERS = 100

export type AdminMailboxPayload = {
  domainId?: unknown
  localPart?: unknown
  userIds?: unknown
}

export class AdminMailboxInputError extends Error {}

export function parseAdminMailboxPayload(body: AdminMailboxPayload | undefined) {
  const domainId = typeof body?.domainId === 'string' ? body.domainId.trim() : ''
  const localPart = typeof body?.localPart === 'string' ? body.localPart.trim().toLowerCase() : ''
  const rawUserIds = Array.isArray(body?.userIds) ? body.userIds : []

  if (!domainId
    || domainId.length > 256
    || /[\u0000-\u001f\u007f]/.test(domainId)
    || !localPart
    || localPart.length > 64
    || !LOCAL_PART_PATTERN.test(localPart)
    || localPart.startsWith('.')
    || localPart.endsWith('.')) {
    throw new AdminMailboxInputError('Domaine ou partie locale invalide.')
  }

  if (rawUserIds.length === 0 || rawUserIds.length > MAX_INITIAL_USERS) {
    throw new AdminMailboxInputError('Sélectionne entre 1 et 100 membres actifs.')
  }

  const userIds = rawUserIds.map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
  if (userIds.some(userId => !UUID_PATTERN.test(userId)) || new Set(userIds).size !== userIds.length) {
    throw new AdminMailboxInputError('La liste des membres est invalide.')
  }

  return { domainId, localPart, userIds }
}
