-- Phase 2: record_class.
--
-- Phase 0 replayed the full event history into cowrie_unique_commands and
-- discovered that the table is 99.76% not-commands. Cowrie writes its own log
-- messages into cowrie_events.command, and they had been accumulating there
-- since the project started. Measured 2026-09-22 over all 1,688,768 rows:
--
--   log_artifact      1,684,736 rows   (99.76%)
--   command               4,025 rows
--   prompt_echo               2 rows   ('Enter new UNIX password:', +/- a space)
--   binary_fragment           5 rows
--
-- Until now the endpoints excluded these with a 21-clause NOT LIKE predicate
-- assembled in JavaScript. That worked, but it re-derived the same answer on
-- every request, could not be indexed, and existed in a form nothing else
-- could query. This stores the decision once.
--
-- The classification itself stays in backend/lib/record-class.js — the CASE
-- expression below is generated from it by db/backfill/013_record_class.sh.
-- Writing the rules here as well would put them in two places, and a drifted
-- classifier hides real commands from every endpoint without erroring.

-- ---------------------------------------------------------------------------
-- 1. The type
-- ---------------------------------------------------------------------------
-- A real enum rather than text + CHECK: 1.7M rows make the 4-byte
-- representation worth having, and PostgreSQL 12+ takes ALTER TYPE ... ADD
-- VALUE IF NOT EXISTS outside a transaction block, so the value set is still
-- extensible. apply-migrations.sh deliberately does not wrap migrations in a
-- transaction (CREATE INDEX CONCURRENTLY forbids it), which is what makes
-- that possible here.
--
-- 'log_artifact' is not in the original Phase 2 specification, which named
-- command / binary_fragment / prompt_echo / unknown. It has to exist: without
-- it the 1.68M Cowrie log lines would all be 'unknown', and a class that
-- means "we could not tell" would be carrying 99.76% of rows we can in fact
-- identify exactly. 'unknown' keeps its intended meaning — not yet
-- classified — and is the column default, so an un-backfilled database is
-- honestly described rather than silently mislabelled.

DO $$
BEGIN
  CREATE TYPE cowrie_record_class AS ENUM
    ('unknown', 'command', 'log_artifact', 'binary_fragment', 'prompt_echo');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The column
-- ---------------------------------------------------------------------------
-- NOT NULL with a DEFAULT is free here: PostgreSQL 11+ stores the default in
-- the catalog rather than rewriting the table, so this is a metadata change
-- on 1.7M rows rather than a full rewrite.

ALTER TABLE cowrie_unique_commands
  ADD COLUMN IF NOT EXISTS record_class cowrie_record_class NOT NULL DEFAULT 'unknown';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
-- A plain index on record_class would be nearly useless: the column has five
-- values and one of them holds 99.76% of the rows, so the planner would
-- correctly ignore it. What the endpoints actually ask for is "the commands,
-- ordered", and a partial index answers that from 4,025 entries instead of
-- 1.7M — the leaderboard snapshot and the summary count both become index
-- scans over a tenth of a percent of the table.

-- Indexed on COALESCE(total_events, 0), not on total_events, because that is
-- the expression the endpoints actually sort by. The two orderings are
-- equivalent in practice — the Phase 0 backfill left no NULLs and the trigger
-- always writes a value — but an expression index is only usable when it
-- matches the query's expression syntactically, so an index on the bare
-- column would have been dead weight that looked like a tuned query plan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_commands_cmd_total
  ON cowrie_unique_commands (COALESCE(total_events, 0) DESC)
  WHERE record_class = 'command';

-- The indicator export windows on last_seen instead.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_commands_cmd_last_seen
  ON cowrie_unique_commands (last_seen DESC)
  WHERE record_class = 'command';

-- ---------------------------------------------------------------------------
-- 4. Staging table for the backfill
-- ---------------------------------------------------------------------------
-- Mirrors 012's: the backfill classifies by id range and this is where a
-- chunk lands on its way back into the table. Nothing depends on it between
-- runs, hence UNLOGGED.

CREATE UNLOGGED TABLE IF NOT EXISTS cowrie_record_class_stage (
  id           bigint PRIMARY KEY,
  record_class cowrie_record_class NOT NULL
);

-- ---------------------------------------------------------------------------
-- 5. Classify the existing rows, in batches
-- ---------------------------------------------------------------------------
-- This one has to happen inside the migration rather than being left to the
-- backfill script. The endpoints filter to record_class = 'command' from the
-- moment the new code starts; if every row still read 'unknown' at that point
-- the public dashboard would show no commands at all until someone
-- remembered to run a shell script. A migration must not leave the database
-- in a state the application cannot serve.
--
-- So the rules appear twice: as the CASE below, and as the lists in
-- backend/lib/record-class.js. That is a deliberate and bounded duplication.
-- The copy below executes exactly once and then is history — which is what a
-- migration is. The live rules stay in the JavaScript, which is what the
-- ingest path uses for new rows and what generates the re-runnable
-- db/backfill/013_record_class.sh for when the classification changes. If the
-- two ever disagree, re-running the backfill is what settles it, and the
-- backfill wins.
--
-- Batched with a COMMIT per chunk, via a procedure rather than a DO block —
-- DO cannot commit. A single UPDATE would touch 1.7M rows in one transaction
-- and hold them against the ingest path, which writes to this same table on
-- every batch. 50,000 rows at a time keeps each lock short enough that the
-- forwarder never notices.

CREATE OR REPLACE PROCEDURE cowrie_classify_existing_records()
LANGUAGE plpgsql AS $proc$
DECLARE
  lo    bigint := 0;
  maxid bigint;
  step  bigint := 50000;
BEGIN
  SELECT COALESCE(max(id), 0) INTO maxid FROM cowrie_unique_commands;
  WHILE lo < maxid LOOP
    UPDATE cowrie_unique_commands
       SET record_class = CASE
             WHEN encode(command_sha256, 'hex') IN (
               'c0c42bf6869232095a1470c917375b34310a541bbc6d565fc8612b5168c2fe20',
               '23f76381806a0f7225441e50442022a1710b7f4971dd8ff970407c7e074dadc2',
               'ac0c967b43a1c7823b97cea37ef5d54622ee4ae696c1b56bcd5290b913327299',
               'bd45ca7d32548e2927e3f41c458da25369191e69a01b8a47ce01661423a0fdfc',
               'e8d735e884c2cdb7388d32264434e3c5e73529d51ae27a1c8275953ee9546756'
             ) THEN 'binary_fragment'
             WHEN command LIKE 'Enter new UNIX password:%' THEN 'prompt_echo'
             WHEN command LIKE 'Remote SSH version:%'
               OR command LIKE 'SSH client hassh fingerprint:%'
               OR command LIKE 'Connection lost%'
               OR command LIKE 'Terminal Size:%'
               OR command LIKE 'login attempt [%'
               OR command LIKE 'CMD: %'
               OR command LIKE 'INPUT (%'
               OR command LIKE 'New connection:%'
               OR command LIKE 'SFTP Uploaded file%'
               OR command LIKE 'Closing TTY Log:%'
               OR command LIKE 'Saved redir contents with SHA-256%'
               OR command LIKE 'Saved stdin contents with SHA-256%'
               OR command LIKE 'public key login attempt for%'
               OR command LIKE 'public key attempt for%'
               OR command LIKE 'direct-tcp connection request to%'
               OR command LIKE 'reversedns:%'
               OR command LIKE 'Attempt to download file(s) from URL%'
               OR command = '{}' OR command = '[]' OR command = '' OR command = '?'
             THEN 'log_artifact'
             ELSE 'command'
           END::cowrie_record_class
     WHERE id > lo AND id <= lo + step
       AND record_class = 'unknown';   -- re-runnable: already-classified rows cost nothing
    COMMIT;
    lo := lo + step;
  END LOOP;
END;
$proc$;

CALL cowrie_classify_existing_records();

DROP PROCEDURE IF EXISTS cowrie_classify_existing_records();

ANALYZE cowrie_unique_commands;
