-- Scope standalone compose drafts to the workspace that created them.
ALTER TABLE outgoing_drafts
  ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;

UPDATE outgoing_drafts
SET workspace_id = 'legacy-courrier-workspace'
WHERE workspace_id IS NULL;

CREATE INDEX outgoing_drafts_workspace_idx
  ON outgoing_drafts(workspace_id, status, updated_at DESC);

CREATE TRIGGER outgoing_drafts_workspace_required_insert
BEFORE INSERT ON outgoing_drafts
WHEN NEW.workspace_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'outgoing draft workspace is required');
END;

CREATE TRIGGER outgoing_drafts_workspace_required_update
BEFORE UPDATE OF workspace_id ON outgoing_drafts
WHEN NEW.workspace_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'outgoing draft workspace is required');
END;

INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('owner', 'mail.export'),
  ('admin', 'mail.export'),
  ('member', 'mail.export');
