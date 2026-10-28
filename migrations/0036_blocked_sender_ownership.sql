ALTER TABLE blocked_senders
  ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
