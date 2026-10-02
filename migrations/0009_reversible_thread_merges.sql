CREATE TABLE thread_merges (
  id TEXT PRIMARY KEY,
  mailbox_domain TEXT NOT NULL,
  folder TEXT NOT NULL CHECK (folder IN ('Imbox', 'The Feed', 'Paper Trail')),
  created_at TEXT NOT NULL
);

CREATE TABLE thread_merge_members (
  merge_id TEXT NOT NULL REFERENCES thread_merges(id) ON DELETE CASCADE,
  root_message_id TEXT NOT NULL,
  PRIMARY KEY (merge_id, root_message_id)
);

CREATE INDEX thread_merge_members_root_idx
  ON thread_merge_members(root_message_id);
