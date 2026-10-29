-- Prevent mailbox restoration or state changes once irreversible deletion starts.
ALTER TABLE mailboxes ADD COLUMN deletion_started_at TEXT;
ALTER TABLE mailboxes ADD COLUMN deletion_claimed_at TEXT;
