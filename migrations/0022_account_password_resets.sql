-- Store only hashed reset tokens and short-lived rate-limit keys. Raw tokens and
-- client IP addresses are never persisted.
CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_user_idx
  ON auth_password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_expiry_idx
  ON auth_password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS auth_password_reset_requests (
  id TEXT PRIMARY KEY,
  email_key_hash TEXT NOT NULL,
  ip_key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_password_reset_requests_email_idx
  ON auth_password_reset_requests(email_key_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_password_reset_requests_ip_idx
  ON auth_password_reset_requests(ip_key_hash, created_at DESC);
