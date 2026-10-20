-- Avatar preferences follow the signed-in account across devices.
-- NULL preserves the existing photo-first behavior for current accounts.
ALTER TABLE users ADD COLUMN avatar_mode TEXT
  CHECK (avatar_mode IS NULL OR avatar_mode IN ('default', 'photo', 'tronche'));

ALTER TABLE users ADD COLUMN avatar_config TEXT
  CHECK (avatar_config IS NULL OR json_valid(avatar_config));
