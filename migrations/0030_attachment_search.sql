CREATE VIRTUAL TABLE attachments_search USING fts5(
  filename,
  content = 'attachments',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER attachments_search_insert AFTER INSERT ON attachments BEGIN
  INSERT INTO attachments_search(rowid, filename)
  VALUES (new.rowid, new.filename);
END;

CREATE TRIGGER attachments_search_delete AFTER DELETE ON attachments BEGIN
  INSERT INTO attachments_search(attachments_search, rowid, filename)
  VALUES ('delete', old.rowid, old.filename);
END;

CREATE TRIGGER attachments_search_update
AFTER UPDATE OF filename ON attachments BEGIN
  INSERT INTO attachments_search(attachments_search, rowid, filename)
  VALUES ('delete', old.rowid, old.filename);
  INSERT INTO attachments_search(rowid, filename)
  VALUES (new.rowid, new.filename);
END;

INSERT INTO attachments_search(attachments_search) VALUES ('rebuild');
