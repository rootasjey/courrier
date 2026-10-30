export function mailboxDeletionNotice(
  routingCleanup: 'removed' | 'missing' | 'manual_required' | undefined,
  deletedNotice: string,
  manualCleanupWarning: string,
) {
  return routingCleanup === 'manual_required'
    ? `${deletedNotice} ${manualCleanupWarning}`
    : deletedNotice
}
