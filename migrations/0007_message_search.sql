CREATE VIRTUAL TABLE messages_search USING fts5(
  sender_name,
  sender_address,
  subject,
  text_body,
  content = 'messages',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER messages_search_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_search(rowid, sender_name, sender_address, subject, text_body)
  VALUES (new.rowid, new.sender_name, new.sender_address, new.subject, new.text_body);
END;

CREATE TRIGGER messages_search_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_search(messages_search, rowid, sender_name, sender_address, subject, text_body)
  VALUES ('delete', old.rowid, old.sender_name, old.sender_address, old.subject, old.text_body);
END;

CREATE TRIGGER messages_search_update
AFTER UPDATE OF sender_name, sender_address, subject, text_body ON messages BEGIN
  INSERT INTO messages_search(messages_search, rowid, sender_name, sender_address, subject, text_body)
  VALUES ('delete', old.rowid, old.sender_name, old.sender_address, old.subject, old.text_body);
  INSERT INTO messages_search(rowid, sender_name, sender_address, subject, text_body)
  VALUES (new.rowid, new.sender_name, new.sender_address, new.subject, new.text_body);
END;

INSERT INTO messages_search(messages_search) VALUES ('rebuild');
