ALTER TABLE contacts ADD COLUMN company TEXT NOT NULL DEFAULT '';

CREATE TABLE contact_phones (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id, workspace_id) REFERENCES contacts(id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX contact_phones_contact_idx ON contact_phones(workspace_id, contact_id, is_primary DESC, label COLLATE NOCASE);
CREATE UNIQUE INDEX contact_phones_one_primary_idx ON contact_phones(workspace_id, contact_id) WHERE is_primary = 1;

CREATE TABLE contact_postal_addresses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id, workspace_id) REFERENCES contacts(id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX contact_postal_addresses_contact_idx ON contact_postal_addresses(workspace_id, contact_id, is_primary DESC, label COLLATE NOCASE);
CREATE UNIQUE INDEX contact_postal_addresses_one_primary_idx ON contact_postal_addresses(workspace_id, contact_id) WHERE is_primary = 1;
