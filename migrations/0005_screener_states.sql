ALTER TABLE messages ADD COLUMN screener_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (screener_state IN ('pending', 'cleared', 'blocked'));

CREATE TABLE blocked_senders (
  mailbox_domain TEXT NOT NULL,
  sender_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_domain, sender_address)
);

CREATE INDEX messages_screener_state_idx
  ON messages(mailbox_domain, folder, screener_state, received_at DESC);
