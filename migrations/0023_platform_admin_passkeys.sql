-- Platform-administrator passkeys are used for step-up MFA. Public keys and
-- credential metadata are stored; private keys remain with the authenticator.
CREATE TABLE IF NOT EXISTS auth_passkeys (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports_json TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0, 1)),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS auth_passkeys_user_idx
  ON auth_passkeys(user_id, created_at);

CREATE TABLE IF NOT EXISTS auth_webauthn_challenges (
  attempt_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_version INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'admin_step_up')),
  challenge TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_webauthn_challenges_expiry_idx
  ON auth_webauthn_challenges(expires_at);

CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS auth_mfa_recovery_codes_user_idx
  ON auth_mfa_recovery_codes(user_id, used_at);
