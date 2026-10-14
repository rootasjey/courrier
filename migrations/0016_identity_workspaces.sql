-- Identity and tenant foundation. This migration is intentionally additive:
-- existing mail APIs still run behind Cloudflare Access until tenant scoping
-- has been applied to every read, write, attachment, export, and send path.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending')),
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS password_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'legacy_unverified', 'suspended')),
  verification_method TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, workspace_id)
);

CREATE INDEX IF NOT EXISTS workspace_domains_workspace_idx
  ON workspace_domains(workspace_id, domain);

CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (domain_id, workspace_id)
    REFERENCES workspace_domains(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (id, workspace_id)
);

CREATE INDEX IF NOT EXISTS mailboxes_workspace_idx ON mailboxes(workspace_id, address);
CREATE INDEX IF NOT EXISTS mailboxes_domain_idx ON mailboxes(domain_id, address);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx
  ON workspace_memberships(user_id, status, workspace_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('owner', 'mail.read'),
  ('owner', 'mail.write'),
  ('owner', 'mail.send'),
  ('owner', 'mail.classify'),
  ('owner', 'mail.trash'),
  ('owner', 'members.manage'),
  ('owner', 'domains.manage'),
  ('owner', 'workspace.settings.manage'),
  ('admin', 'mail.read'),
  ('admin', 'mail.write'),
  ('admin', 'mail.send'),
  ('admin', 'mail.classify'),
  ('admin', 'mail.trash'),
  ('admin', 'members.manage'),
  ('admin', 'domains.manage'),
  ('admin', 'workspace.settings.manage'),
  ('member', 'mail.read'),
  ('member', 'mail.write'),
  ('member', 'mail.send'),
  ('member', 'mail.classify'),
  ('member', 'mail.trash'),
  ('viewer', 'mail.read');

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_idx
  ON workspace_invitations(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_audit_log_created_idx
  ON platform_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_target_idx
  ON platform_audit_log(target_type, target_id, created_at DESC);

-- Preserve the existing domain-based mailbox structure as one pending legacy
-- workspace. No user or administrator is created implicitly by this backfill.
INSERT OR IGNORE INTO workspaces (id, name, created_at, updated_at)
VALUES ('legacy-courrier-workspace', 'Espace Courrier existant', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO workspace_domains
  (id, workspace_id, domain, verification_status, created_at)
SELECT 'legacy-domain-' || lower(trim(mailbox_domain)),
  'legacy-courrier-workspace', lower(trim(mailbox_domain)), 'legacy_unverified', datetime('now')
FROM (
  SELECT mailbox_domain
  FROM messages
  WHERE COALESCE(is_outgoing, 0) = 0 AND trim(mailbox_domain) <> ''
  UNION
  SELECT mailbox_domain FROM drafts WHERE trim(mailbox_domain) <> ''
)
WHERE trim(mailbox_domain) <> '';

INSERT OR IGNORE INTO mailboxes (id, workspace_id, domain_id, address, created_at)
SELECT 'legacy-mailbox-' || lower(trim(address)),
  'legacy-courrier-workspace',
  'legacy-domain-' || lower(trim(substr(address, instr(address, '@') + 1))),
  lower(trim(address)), datetime('now')
FROM (
  SELECT envelope_to AS address
  FROM messages
  WHERE COALESCE(is_outgoing, 0) = 0 AND instr(envelope_to, '@') > 0
)
WHERE trim(address) <> ''
  AND instr(address, ' ') = 0
  AND instr(address, ',') = 0
  AND instr(address, ';') = 0;
