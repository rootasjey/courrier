-- Shared contact details and notes belong to one active workspace.
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  updated_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, workspace_id)
);

CREATE INDEX contacts_workspace_name_idx ON contacts(workspace_id, display_name COLLATE NOCASE);

CREATE TABLE contact_addresses (
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  address TEXT NOT NULL COLLATE NOCASE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, address),
  FOREIGN KEY (contact_id, workspace_id) REFERENCES contacts(id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX contact_addresses_contact_idx ON contact_addresses(workspace_id, contact_id, is_primary DESC, address COLLATE NOCASE);
CREATE UNIQUE INDEX contact_addresses_one_primary_idx ON contact_addresses(workspace_id, contact_id) WHERE is_primary = 1;

CREATE TABLE contact_notes (
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  updated_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, contact_id),
  FOREIGN KEY (contact_id, workspace_id) REFERENCES contacts(id, workspace_id) ON DELETE CASCADE
);
