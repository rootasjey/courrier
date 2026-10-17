-- Allow a member's optional MFA to be used both during login and for
-- re-verifying account security settings. Existing admin challenges are kept.
CREATE TABLE auth_webauthn_challenges_new (
  attempt_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_version INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'register',
    'admin_step_up',
    'account_login',
    'account_step_up'
  )),
  challenge TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO auth_webauthn_challenges_new (
  attempt_id,
  user_id,
  session_version,
  purpose,
  challenge,
  label,
  created_at,
  expires_at
)
SELECT
  attempt_id,
  user_id,
  session_version,
  purpose,
  challenge,
  label,
  created_at,
  expires_at
FROM auth_webauthn_challenges;

DROP TABLE auth_webauthn_challenges;
ALTER TABLE auth_webauthn_challenges_new RENAME TO auth_webauthn_challenges;

CREATE INDEX auth_webauthn_challenges_expiry_idx
  ON auth_webauthn_challenges(expires_at);
