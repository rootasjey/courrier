CREATE TABLE thread_subject_overrides (
  mailbox_domain TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_domain, thread_id)
);

CREATE INDEX thread_subject_overrides_thread_idx
  ON thread_subject_overrides(thread_id);
