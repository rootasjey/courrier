ALTER TABLE sender_rules ADD COLUMN last_change_id TEXT;

CREATE TABLE sender_rule_changes (
  id TEXT PRIMARY KEY,
  mailbox_domain TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  previous_rule_folder TEXT CHECK (
    previous_rule_folder IS NULL OR previous_rule_folder IN ('Imbox', 'The Feed', 'Paper Trail')
  ),
  previous_change_id TEXT,
  next_folder TEXT NOT NULL CHECK (next_folder IN ('Imbox', 'The Feed', 'Paper Trail')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  undone_at TEXT
);

CREATE INDEX sender_rule_changes_expiry_idx
  ON sender_rule_changes(expires_at);

CREATE TABLE sender_rule_change_messages (
  change_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  previous_folder TEXT NOT NULL CHECK (
    previous_folder IN ('Imbox', 'The Feed', 'Paper Trail', 'Screener')
  ),
  PRIMARY KEY (change_id, message_id)
);
