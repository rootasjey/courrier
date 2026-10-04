ALTER TABLE messages ADD COLUMN is_reply_later INTEGER NOT NULL DEFAULT 0
  CHECK (is_reply_later IN (0, 1));

CREATE INDEX messages_reply_later_idx
  ON messages(mailbox_domain, is_reply_later, received_at DESC);
