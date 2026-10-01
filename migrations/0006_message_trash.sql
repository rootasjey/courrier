ALTER TABLE messages ADD COLUMN trashed_at TEXT;

CREATE INDEX messages_trash_idx
  ON messages(mailbox_domain, trashed_at DESC)
  WHERE trashed_at IS NOT NULL;
