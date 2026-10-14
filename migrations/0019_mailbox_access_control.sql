-- Mailbox-level access is an additional boundary inside each workspace.
-- Workspace roles still control actions; a grant is required to see or change
-- mail associated with a particular mailbox.

CREATE TABLE mailbox_access_grants (
  workspace_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (workspace_id, mailbox_id, user_id),
  FOREIGN KEY (mailbox_id, workspace_id)
    REFERENCES mailboxes(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX mailbox_access_grants_user_idx
  ON mailbox_access_grants(user_id, workspace_id, status, mailbox_id);
CREATE INDEX mailbox_access_grants_mailbox_idx
  ON mailbox_access_grants(workspace_id, mailbox_id, status, user_id);

-- The only configured sending identity is courrier-test@verbatims.cc. Keep it
-- as a mailbox so that outgoing drafts and sent copies are covered by the same
-- access checks as received mail.
INSERT OR IGNORE INTO workspace_domains
  (id, workspace_id, domain, verification_status, created_at)
VALUES
  ('legacy-domain-verbatims.cc', 'legacy-courrier-workspace', 'verbatims.cc', 'legacy_unverified', datetime('now'));

-- Preserve historical sent mail whose From identity is different from the
-- currently configured Cloudflare sender. Only canonical envelope addresses
-- are mapped; malformed values remain inaccessible until explicitly resolved.
INSERT OR IGNORE INTO workspace_domains
  (id, workspace_id, domain, verification_status, created_at)
SELECT 'legacy-domain-' || lower(trim(substr(envelope_from, instr(envelope_from, '@') + 1))),
  'legacy-courrier-workspace',
  lower(trim(substr(envelope_from, instr(envelope_from, '@') + 1))),
  'legacy_unverified', datetime('now')
FROM messages
WHERE COALESCE(is_outgoing, 0) = 1
  AND instr(envelope_from, '@') > 1
  AND instr(envelope_from, '@') < length(trim(envelope_from))
  AND instr(trim(envelope_from), ' ') = 0
  AND instr(envelope_from, ',') = 0
  AND instr(envelope_from, ';') = 0;

INSERT OR IGNORE INTO mailboxes (id, workspace_id, domain_id, address, created_at)
SELECT 'legacy-mailbox-' || lower(trim(envelope_from)),
  'legacy-courrier-workspace',
  'legacy-domain-' || lower(trim(substr(envelope_from, instr(envelope_from, '@') + 1))),
  lower(trim(envelope_from)), datetime('now')
FROM messages
WHERE COALESCE(is_outgoing, 0) = 1
  AND instr(envelope_from, '@') > 1
  AND instr(envelope_from, '@') < length(trim(envelope_from))
  AND instr(trim(envelope_from), ' ') = 0
  AND instr(envelope_from, ',') = 0
  AND instr(envelope_from, ';') = 0;

INSERT OR IGNORE INTO mailboxes (id, workspace_id, domain_id, address, created_at)
SELECT 'legacy-sender-courrier-test-verbatims-cc',
  'legacy-courrier-workspace', id, 'courrier-test@verbatims.cc', datetime('now')
FROM workspace_domains
WHERE workspace_id = 'legacy-courrier-workspace'
  AND lower(domain) = 'verbatims.cc';

-- Existing active members retain their prior workspace-wide mail access. New
-- memberships and newly provisioned mailboxes receive no implicit grant.
INSERT OR IGNORE INTO mailbox_access_grants
  (workspace_id, mailbox_id, user_id, granted_by_user_id, status, created_at)
SELECT wm.workspace_id, mb.id, wm.user_id, NULL, 'active', datetime('now')
FROM workspace_memberships wm
JOIN mailboxes mb ON mb.workspace_id = wm.workspace_id
WHERE wm.status = 'active';

ALTER TABLE outgoing_drafts ADD COLUMN mailbox_id TEXT REFERENCES mailboxes(id) ON DELETE RESTRICT;

UPDATE outgoing_drafts
SET mailbox_id = (
  SELECT mb.id FROM mailboxes mb
  WHERE mb.workspace_id = outgoing_drafts.workspace_id
    AND lower(mb.address) = 'courrier-test@verbatims.cc'
  LIMIT 1
)
WHERE mailbox_id IS NULL;

CREATE INDEX outgoing_drafts_mailbox_idx
  ON outgoing_drafts(workspace_id, mailbox_id, status, updated_at DESC);

CREATE TRIGGER outgoing_drafts_mailbox_required_insert
BEFORE INSERT ON outgoing_drafts
WHEN NEW.mailbox_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM mailboxes mb
  WHERE mb.id = NEW.mailbox_id AND mb.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'outgoing draft mailbox is required in its workspace');
END;
CREATE TRIGGER outgoing_drafts_mailbox_required_update
BEFORE UPDATE OF mailbox_id, workspace_id ON outgoing_drafts
WHEN NEW.mailbox_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM mailboxes mb
  WHERE mb.id = NEW.mailbox_id AND mb.workspace_id = NEW.workspace_id
)
BEGIN
  SELECT RAISE(ABORT, 'outgoing draft mailbox is required in its workspace');
END;
