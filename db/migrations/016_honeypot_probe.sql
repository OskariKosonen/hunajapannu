-- Phase 5: honeypot-detection scoring.
--
-- Some attackers check whether the box is real before committing a payload.
-- The checks range from unambiguous (naming a hypervisor, naming the honeypot
-- software) to indistinguishable from ordinary recon (reading /proc/cpuinfo),
-- so what is stored is a score and the rules that produced it, not a verdict.
--
-- The rules live in backend/lib/rules/honeypot-probes.json. Adding one is an
-- edit to that file and a deploy, with no code change — which was the point of
-- the phase. Worth being precise about the limit of that claim: the rules are
-- data, the matching is not, so a rule needing anything beyond a
-- case-insensitive regex over the command text still needs code.
--
-- The threshold deliberately does not live here. Storing the score keeps the
-- file authoritative: retuning the threshold becomes a query change rather
-- than a re-backfill of 1.7M rows.
--
-- Measured over the 4,010 real commands when written: 32 score at or above
-- the current threshold of 3, of which 26 include at least one deliberate
-- signal and 6 are an accumulation of weak fingerprinting.

ALTER TABLE cowrie_unique_commands
  ADD COLUMN IF NOT EXISTS probe_score integer NOT NULL DEFAULT 0,
  -- Which rules fired, so a score can be explained rather than trusted. Also
  -- what makes a rule change auditable: if a rule is retired, the rows that
  -- depended on it are findable.
  ADD COLUMN IF NOT EXISTS probe_rules text[] NOT NULL DEFAULT '{}';

-- Partial, because the interesting rows are a rounding error on the table:
-- 32 of 1.7M. A plain index would be ignored by the planner and still cost
-- writes on every ingest.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_commands_probe
  ON cowrie_unique_commands (probe_score DESC)
  WHERE probe_score > 0;

CREATE UNLOGGED TABLE IF NOT EXISTS cowrie_probe_stage (
  id          bigint PRIMARY KEY,
  probe_score integer NOT NULL,
  probe_rules text[] NOT NULL
);

-- Catalog-only. Adding a NOT NULL column with a default is a metadata change
-- on PostgreSQL 11+, not a rewrite, so this costs no disk on 1.7M rows.
-- Population is db/backfill/016_honeypot_probe.sh, for the reason every
-- backfill since migration 013 is separate: only a backfill can be paced,
-- resumed, and made to refuse to start when the volume is short.
