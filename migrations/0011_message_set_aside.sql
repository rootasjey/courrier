ALTER TABLE messages ADD COLUMN is_set_aside INTEGER NOT NULL DEFAULT 0
  CHECK (is_set_aside IN (0, 1));

CREATE INDEX messages_set_aside_idx
  ON messages(mailbox_domain, folder, is_set_aside, received_at DESC);
