ALTER TABLE outgoing_drafts ADD COLUMN cc_address TEXT NOT NULL DEFAULT '';
ALTER TABLE outgoing_drafts ADD COLUMN bcc_address TEXT NOT NULL DEFAULT '';
