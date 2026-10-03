export type SetAsideMailboxFolder = 'Imbox' | 'The Feed' | 'Paper Trail'

/**
 * Restore a parked conversation only when its incoming senders agree on one
 * destination. Unclassified senders retain the mailbox the conversation came
 * from; conflicting destinations also fall back to that mailbox so a thread
 * is never split by restoring it.
 */
export function resolveSetAsideRestoreFolder(
  originalFolder: SetAsideMailboxFolder,
  senderAddresses: string[],
  senderRules: Map<string, SetAsideMailboxFolder>,
): SetAsideMailboxFolder {
  if (!senderAddresses.length) return originalFolder

  const destinations = new Set(senderAddresses.map(address => senderRules.get(address) ?? originalFolder))
  if (destinations.size !== 1) return originalFolder

  return destinations.values().next().value ?? originalFolder
}
