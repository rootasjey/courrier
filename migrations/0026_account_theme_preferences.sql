-- Theme choices belong to the signed-in account and follow it between devices.
-- NULL keeps the distinction between an untouched account and a saved choice,
-- so existing browser-local preferences can be migrated without overwriting them.
ALTER TABLE users ADD COLUMN theme_mode TEXT
  CHECK (theme_mode IS NULL OR theme_mode IN ('system', 'light', 'dark'));

ALTER TABLE users ADD COLUMN theme_name TEXT
  CHECK (theme_name IS NULL OR theme_name IN (
    'paper', 'forest', 'graphite', 'lavender', 'ayu',
    'one-dark-pro', 'synthwave', 'shades-purple', 'min'
  ));
