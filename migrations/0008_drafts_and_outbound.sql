ALTER TABLE messages ADD COLUMN is_outgoing INTEGER NOT NULL DEFAULT 0
  CHECK (is_outgoing IN (0, 1));

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  reply_to_message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  mailbox_domain TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX drafts_updated_at_idx ON drafts(updated_at DESC);
