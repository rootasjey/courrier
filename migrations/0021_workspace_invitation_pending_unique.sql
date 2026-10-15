-- Keep only one outstanding invitation for a workspace and email address.
-- Expired, duplicate, and legacy admin invitations are closed before indexing.
UPDATE workspace_invitations
SET revoked_at = datetime('now')
WHERE accepted_at IS NULL
  AND revoked_at IS NULL
  AND (
    datetime(expires_at) <= datetime('now')
    OR role = 'admin'
    OR EXISTS (
      SELECT 1 FROM workspace_invitations newer
      WHERE newer.workspace_id = workspace_invitations.workspace_id
        AND lower(newer.email) = lower(workspace_invitations.email)
        AND newer.accepted_at IS NULL AND newer.revoked_at IS NULL
        AND datetime(newer.expires_at) > datetime('now')
        AND (
          newer.created_at > workspace_invitations.created_at
          OR (newer.created_at = workspace_invitations.created_at AND newer.id > workspace_invitations.id)
        )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_pending_email_idx
  ON workspace_invitations(workspace_id, email COLLATE NOCASE)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
