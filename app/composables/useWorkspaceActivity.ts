export type WorkspaceActivity = {
  id: string
  actorType: 'user' | 'agent' | 'system'
  actorLabel: string
  actionType: string
  targetId: string
  targetLabel: string | null
  createdAt: string
  undoExpiresAt: string | null
  undoneAt: string | null
  canUndo: boolean
}

export type WorkspaceActivityPage = {
  items: WorkspaceActivity[]
  nextCursor: string | null
}

export function useActivityRefreshRevision() {
  return useState('courrier-activity-refresh-revision', () => 0)
}

export function useMailStateRefreshRevision() {
  return useState('courrier-mail-state-refresh-revision', () => 0)
}

export function useLatestActivityPreview() {
  return useState<{ actionType: string, targetLabel: string | null, canUndo: boolean } | null>(
    'courrier-latest-activity-preview',
    () => null,
  )
}
