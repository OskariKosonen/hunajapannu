-- The forwarder doesn't supply filesystem metadata for every download event.
ALTER TABLE cowrie_files
  ALTER COLUMN size_bytes DROP NOT NULL,
  ALTER COLUMN mtime      DROP NOT NULL,
  ALTER COLUMN mode       DROP NOT NULL,
  ALTER COLUMN uid        DROP NOT NULL,
  ALTER COLUMN gid        DROP NOT NULL;
