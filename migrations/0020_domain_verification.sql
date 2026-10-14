-- Store one active DNS ownership challenge per domain. The TXT value is public
-- by design; it is returned only from admin-only endpoints and removed after
-- successful verification.
CREATE TABLE IF NOT EXISTS domain_verification_challenges (
  domain_id TEXT PRIMARY KEY REFERENCES workspace_domains(id) ON DELETE CASCADE,
  verification_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS domain_verification_challenges_expiry_idx
  ON domain_verification_challenges(expires_at);
