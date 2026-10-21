ALTER TABLE messages ADD COLUMN read_state_version INTEGER NOT NULL DEFAULT 0
  CHECK (read_state_version >= 0);

CREATE TABLE workspace_activity (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id TEXT,
  actor_label TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (length(action_type) BETWEEN 1 AND 80),
  target_type TEXT NOT NULL CHECK (length(target_type) BETWEEN 1 AND 40),
  target_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL,
  undo_data_json TEXT CHECK (undo_data_json IS NULL OR json_valid(undo_data_json)),
  created_at TEXT NOT NULL,
  undo_expires_at TEXT,
  undone_at TEXT
);

CREATE INDEX workspace_activity_recent_idx
  ON workspace_activity(workspace_id, created_at DESC, id DESC);

CREATE INDEX workspace_activity_mailbox_idx
  ON workspace_activity(workspace_id, mailbox_id, created_at DESC);
