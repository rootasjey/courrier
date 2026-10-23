CREATE TABLE workspace_tags (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  color TEXT NOT NULL DEFAULT 'teal' CHECK (color IN ('teal', 'blue', 'green', 'amber', 'rose', 'violet')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX workspace_tags_name_unique_idx
  ON workspace_tags(workspace_id, lower(trim(name)));

CREATE TABLE message_tags (
  tag_id TEXT NOT NULL REFERENCES workspace_tags(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (tag_id, message_id)
);

CREATE INDEX message_tags_message_idx ON message_tags(message_id, tag_id);
