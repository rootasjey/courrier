ALTER TABLE attachments ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
ALTER TABLE attachments ADD COLUMN search_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (search_status IN ('pending', 'indexed', 'empty', 'unsupported', 'skipped', 'failed'));

CREATE VIRTUAL TABLE attachment_content_search USING fts5(
  search_text,
  content = 'attachments',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER attachment_content_search_insert AFTER INSERT ON attachments BEGIN
  INSERT INTO attachment_content_search(rowid, search_text)
  VALUES (new.rowid, new.search_text);
END;

CREATE TRIGGER attachment_content_search_delete AFTER DELETE ON attachments BEGIN
  INSERT INTO attachment_content_search(attachment_content_search, rowid, search_text)
  VALUES ('delete', old.rowid, old.search_text);
END;

CREATE TRIGGER attachment_content_search_update AFTER UPDATE OF search_text ON attachments BEGIN
  INSERT INTO attachment_content_search(attachment_content_search, rowid, search_text)
  VALUES ('delete', old.rowid, old.search_text);
  INSERT INTO attachment_content_search(rowid, search_text)
  VALUES (new.rowid, new.search_text);
END;

INSERT INTO attachment_content_search(attachment_content_search) VALUES ('rebuild');
