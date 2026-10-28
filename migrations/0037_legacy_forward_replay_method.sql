ALTER TABLE legacy_forward_deliveries
  ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'email_forward';
