-- Archive a mailbox without deleting its messages, grants, or attachments.
-- Archived mailboxes are represented as suspended for all existing access and
-- routing checks; these fields retain the prior state so restoration is safe.
ALTER TABLE mailboxes ADD COLUMN archived_at TEXT;
ALTER TABLE mailboxes ADD COLUMN status_before_archive TEXT
  CHECK (status_before_archive IS NULL OR status_before_archive IN ('active', 'suspended'));
