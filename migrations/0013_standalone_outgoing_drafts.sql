CREATE TABLE outgoing_drafts (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX outgoing_drafts_updated_at_idx ON outgoing_drafts(status, updated_at DESC);

CREATE TABLE outgoing_draft_attachments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES outgoing_drafts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('attachment', 'inline')),
  created_at TEXT NOT NULL
);

CREATE INDEX outgoing_draft_attachments_draft_id_idx ON outgoing_draft_attachments(draft_id, created_at);

ALTER TABLE messages ADD COLUMN html_body TEXT NOT NULL DEFAULT '';
