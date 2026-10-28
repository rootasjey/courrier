export function canUnblockSender(
  actorUserId: string,
  createdByUserId: string | null,
  isAdmin: boolean,
) {
  return createdByUserId === null || createdByUserId === actorUserId || isAdmin
}
