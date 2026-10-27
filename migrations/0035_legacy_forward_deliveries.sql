CREATE TABLE legacy_forward_deliveries (
  message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'forwarded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  claimed_at TEXT,
  forwarded_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX legacy_forward_deliveries_status_idx
  ON legacy_forward_deliveries(status, claimed_at);
