-- Store only a one-way key derived from the normalized email and client IP.
-- This limits repeated password guesses without retaining raw IP addresses.
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  key_hash TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_updated_idx
  ON auth_login_attempts(updated_at);
