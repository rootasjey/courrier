const ACTIVITY_RETENTION_MONTHS = 12

export function workspaceActivityCutoff(now = new Date()) {
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ACTIVITY_RETENTION_MONTHS)
  const lastDayOfTargetMonth = new Date(Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth() + 1,
    0,
  )).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return cutoff.toISOString()
}

export async function pruneWorkspaceActivity(db: D1Database, now = new Date()) {
  const nowIso = now.toISOString()
  const cutoff = workspaceActivityCutoff(now)

  await db.batch([
    db.prepare(`
      UPDATE workspace_activity
      SET undo_data_json = NULL
      WHERE undo_data_json IS NOT NULL
        AND undo_expires_at IS NOT NULL
        AND undo_expires_at <= ?
    `).bind(nowIso),
    db.prepare(`
      DELETE FROM workspace_activity
      WHERE created_at < ?
    `).bind(cutoff),
  ])
}
