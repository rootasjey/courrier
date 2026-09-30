ALTER TABLE messages ADD COLUMN mailbox_domain TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN folder TEXT NOT NULL DEFAULT 'Imbox'
  CHECK (folder IN ('Imbox', 'The Feed', 'Paper Trail', 'Screener'));

UPDATE messages
SET mailbox_domain = lower(trim(substr(envelope_to, instr(envelope_to, '@') + 1)))
WHERE instr(envelope_to, '@') > 0;

CREATE TABLE sender_rules (
  mailbox_domain TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  folder TEXT NOT NULL CHECK (folder IN ('Imbox', 'The Feed', 'Paper Trail')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_domain, sender_address)
);

CREATE INDEX messages_mailbox_folder_received_at_idx
  ON messages(mailbox_domain, folder, received_at DESC);

CREATE INDEX messages_sender_classification_idx
  ON messages(mailbox_domain, sender_address);

-- Existing messages were already shown in Imbox before sender rules existed.
-- Preserve that behavior for their senders when future mail arrives.
INSERT OR IGNORE INTO sender_rules (mailbox_domain, sender_address, folder, created_at, updated_at)
SELECT DISTINCT mailbox_domain, lower(trim(sender_address)), 'Imbox', datetime('now'), datetime('now')
FROM messages
WHERE mailbox_domain <> '' AND trim(sender_address) <> '';
