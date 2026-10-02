CREATE TABLE sender_rule_change_merges (
  change_id TEXT NOT NULL,
  merge_id TEXT NOT NULL,
  previous_folder TEXT NOT NULL CHECK (
    previous_folder IN ('Imbox', 'The Feed', 'Paper Trail')
  ),
  PRIMARY KEY (change_id, merge_id)
);
