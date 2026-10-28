CREATE TABLE inbound_email_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('rejected', 'degraded', 'failed')),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'sender_blocked',
    'mailbox_unconfigured',
    'mail_storage_unavailable',
    'processing_failed'
  )),
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX inbound_email_events_created_idx
  ON inbound_email_events(created_at DESC, id DESC);
