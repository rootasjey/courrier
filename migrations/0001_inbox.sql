CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  envelope_from TEXT NOT NULL,
  envelope_to TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '(sans objet)',
  sent_at TEXT,
  received_at TEXT NOT NULL,
  in_reply_to TEXT,
  references_header TEXT,
  text_body TEXT NOT NULL DEFAULT '',
  raw_object_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_received_at_idx ON messages(received_at DESC);
CREATE INDEX IF NOT EXISTS messages_envelope_to_idx ON messages(envelope_to);
CREATE INDEX IF NOT EXISTS messages_in_reply_to_idx ON messages(in_reply_to);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_id TEXT,
  disposition TEXT
);

CREATE INDEX IF NOT EXISTS attachments_message_id_idx ON attachments(message_id);
