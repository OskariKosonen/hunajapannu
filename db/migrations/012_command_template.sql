-- Phase 1: command templatization.
--
-- A single campaign shows up as thousands of distinct rows in
-- cowrie_unique_commands because the attacker randomises one field — the
-- dropped binary's name, the temp file, the generated password, the hidden
-- directory the spreader runs from. Measured over the 3,968 real commands in
-- the corpus (artifacts excluded, see backend/lib/record-class.js):
--
--   3,968 raw commands  ->  2,330 templates
--   58 of those templates absorb 1,696 raw rows      (29:1 inside the
--                                                     randomising families)
--   2,272 templates are 1:1, and carry 2,230 distinct
--   six-word stems — genuinely different commands, not an uncaught family.
--
-- The earlier ~550-600 estimate was extrapolated from a corpus where
-- /(passwd|chpasswd)/ matched 82% of rows. That regex was matching
-- `cat /etc/passwd` reads and `login attempt [root/passwd]` log lines, not the
-- credential-change family. The randomising families are real and collapse
-- hard; they are simply a minority of the corpus.
--
-- `command` is never modified. The template is an additional column, so every
-- indicator the raw text carries — C2 addresses, wallets, keys, base64 config
-- blobs — stays available to Phase 4 extraction.
--
-- The normalizer itself is backend/lib/normalize.js, with its fixtures in
-- backend/test/normalize.test.js. It is JavaScript, not plpgsql, because it is
-- shared by the ingest path and the backfill and must not exist twice: two
-- implementations of the same rules drift, and a drifted normalizer produces
-- two templates for one campaign without erroring. That is why this migration
-- adds the column but does not populate it — see db/backfill/012_command_template.sh.

-- ---------------------------------------------------------------------------
-- 1. The template, and a fixed-width grouping key for it
-- ---------------------------------------------------------------------------
-- NULL means "not templated yet", which keeps the backfill resumable and
-- interruptible. It is deliberately not NOT NULL: on a database where the
-- backfill has not run, the correct state is absent, not empty string.

ALTER TABLE cowrie_unique_commands
  ADD COLUMN IF NOT EXISTS command_template text,
  ADD COLUMN IF NOT EXISTS template_sha256  bytea;

-- template_sha256 exists for the same reason command_sha256 does. Migration
-- 011 removed a 2704-byte btree ceiling from this table after it silently
-- dropped 44 of the 45 commands over 2000 bytes. Indexing command_template
-- directly would reintroduce exactly that ceiling: a long command whose text
-- contains no base64 blob to collapse produces a long template. Hashing the
-- grouping key means length never decides what is indexable.

-- sha256(convert_to(...)) is STABLE rather than IMMUTABLE, so it cannot be a
-- generated column; migrations 008 and 011 both use a BEFORE trigger instead.
-- This replaces 011's version of the function and widens the trigger's column
-- list, so that an UPDATE of command_template maintains its hash.
CREATE OR REPLACE FUNCTION set_command_sha256() RETURNS trigger AS $$
BEGIN
  NEW.command_sha256  := sha256(convert_to(NEW.command, 'UTF8'));
  NEW.template_sha256 := CASE
    WHEN NEW.command_template IS NULL THEN NULL
    ELSE sha256(convert_to(NEW.command_template, 'UTF8'))
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_command_sha256 ON cowrie_unique_commands;
CREATE TRIGGER trg_set_command_sha256
  BEFORE INSERT OR UPDATE OF command, command_template ON cowrie_unique_commands
  FOR EACH ROW EXECUTE FUNCTION set_command_sha256();

-- Catch up any row templated before the trigger covered the column. On a fresh
-- database this matches nothing.
UPDATE cowrie_unique_commands
   SET template_sha256 = sha256(convert_to(command_template, 'UTF8'))
 WHERE command_template IS NOT NULL
   AND template_sha256 IS NULL;

-- Not unique: collapsing many commands onto one template is the entire point.
-- CONCURRENTLY because the table is ~1.7M rows on production and the ingest
-- path writes to it on every batch.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_commands_template_sha256
  ON cowrie_unique_commands (template_sha256);

-- ---------------------------------------------------------------------------
-- 2. Staging table for the backfill
-- ---------------------------------------------------------------------------
-- UNLOGGED and truncated between chunks: it holds at most one chunk of
-- (id, template) pairs on their way from the normalizer back into the table,
-- and losing it to a crash costs nothing because the backfill is resumable.
-- Declared here rather than created ad hoc by the script so that the script
-- needs no DDL rights and so the shape is reviewable with the rest of the
-- schema.

CREATE UNLOGGED TABLE IF NOT EXISTS cowrie_command_template_stage (
  id               bigint PRIMARY KEY,
  command_template text NOT NULL
);
