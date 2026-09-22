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
-- 5. What this migration deliberately does NOT do
-- ---------------------------------------------------------------------------
-- It does not classify the existing rows.
--
-- The first version of this migration did, in 50,000-row batches with a
-- COMMIT each, on the reasoning that short transactions make a bulk UPDATE
-- safe. That reasoning was about lock duration and it was correct as far as
-- it went — but the dominant cost of rewriting 1.6M rows is disk, not locks,
-- and batching does nothing about disk. Every UPDATE writes a new row
-- version, so the table grows by its own size again regardless of how many
-- transactions the work is spread across. On 2026-09-22 this filled the
-- volume to 100%, PostgreSQL crashed, and the API served 503 until the
-- cluster was restarted by hand.
--
-- So the schema change and the data change are now separate:
--
--   this migration   adds the type, the column and the indexes. All of it is
--                    catalog-only — PostgreSQL 11+ stores a column default in
--                    the catalog instead of rewriting the table — so it costs
--                    no disk and takes milliseconds.
--
--   the ingest path  classifies every row it touches from the moment the new
--                    code starts, so the table only gets more correct.
--
--   the backfill     db/backfill/013_record_class.sh classifies the history,
--                    vacuuming between chunks so the table reuses its own
--                    freed space rather than extending the file, and refusing
--                    to start if the volume is short on room.
--
-- On a database where the backfill has not yet run, every row reads
-- 'unknown' and the endpoints return no commands. That is why this shipped
-- as two deploys: the column and the ingest-side classification first, the
-- endpoint switch only once the backfill had finished. Filtering on a
-- half-populated column returns 200 with a shorter list, and nothing
-- anywhere reports a problem.
