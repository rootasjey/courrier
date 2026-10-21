ALTER TABLE workspace_activity ADD COLUMN batch_id TEXT;

CREATE INDEX workspace_activity_batch_idx
  ON workspace_activity(workspace_id, batch_id, created_at DESC);
