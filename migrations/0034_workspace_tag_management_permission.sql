-- Keep the workspace-wide tag catalogue under owner/admin control.
-- Members retain mail.classify to assign existing tags to messages.
INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('owner', 'mail.tags.manage'),
  ('admin', 'mail.tags.manage');
