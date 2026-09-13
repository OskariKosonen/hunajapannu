#!/usr/bin/env bash
#
# Phase 0 backfill: rebuild cowrie_unique_commands.total_events / unique_ips
# and cowrie_command_ips from the full cowrie_events history.
#
# Why a rebuild rather than "fill in the missing part": the existing counters
# are not merely incomplete, they are wrong by an unknown per-row factor.
# Measured 2026-09-13, total_events was ~9% low and unique_ips was 69x low
# (sum 42,919 against 2,948,377 actual distinct pairs). There is nothing worth
# preserving, so this zeroes and recomputes.
#
# Concurrency: the trigger's command block fails closed when no marker row
# exists (see migration 011). This script deletes the marker first, which stops
# the trigger counting commands, does the work, then re-arms the marker under
# SHARE ROW EXCLUSIVE together with a catch-up pass for anything that arrived
# while it ran. Trigger and backfill therefore never both count the same event,
# and nothing is dropped in between.
#
# Everything else the trigger maintains — asn, country, creds — is untouched.
#
# Usage:  db/backfill/011_command_counters.sh <psql invocation...>
#   e.g.  db/backfill/011_command_counters.sh sudo -u postgres psql -d cowrie_db

set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
BATCH=${BATCH:-200000}

q() { "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }

echo "=== Phase 0 backfill ==="

# 1. Disarm. The trigger's command block no-ops from here until step 5.
q "DELETE FROM cowrie_backfill_marker WHERE name = 'command_counters';" >/dev/null
echo "  marker cleared — trigger is no longer counting commands"

# 2. Reset. Both targets are derived, so there is no state to keep.
q "UPDATE cowrie_unique_commands SET total_events = 0, unique_ips = 0;" >/dev/null
q "TRUNCATE cowrie_command_ips;" >/dev/null
echo "  counters zeroed, pair table truncated"

MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_events;")
echo "  replaying ids 1..${MAXID} in batches of ${BATCH}"

# 3. Batched replay. Each batch is its own transaction so the table is never
#    locked for long and a failure costs one batch, not the run.
lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + BATCH ))
  [ "$hi" -gt "$MAXID" ] && hi=$MAXID

  q "
  WITH src AS (
    SELECT command,
           sha256(convert_to(command, 'UTF8')) AS h,
           src_ip,
           \"timestamp\"
      FROM cowrie_events
     WHERE id > ${lo} AND id <= ${hi}
       AND command IS NOT NULL AND command <> ''
  ),
  pairs AS (
    INSERT INTO cowrie_command_ips (command_sha256, src_ip)
    SELECT DISTINCT h, src_ip FROM src
    ON CONFLICT DO NOTHING
    RETURNING command_sha256, src_ip
  ),
  new_ip_counts AS (
    SELECT command_sha256 AS h, count(*) AS n FROM pairs GROUP BY 1
  ),
  agg AS (
    SELECT h,
           min(command)     AS command,
           count(*)         AS events,
           min(\"timestamp\") AS first_seen,
           max(\"timestamp\") AS last_seen
      FROM src GROUP BY h
  )
  INSERT INTO cowrie_unique_commands
        (command, command_sha256, first_seen, last_seen, total_events, unique_ips)
  SELECT a.command, a.h, a.first_seen, a.last_seen, a.events,
         COALESCE(n.n, 0)
    FROM agg a LEFT JOIN new_ip_counts n ON n.h = a.h
  ON CONFLICT (command_sha256) DO UPDATE SET
    first_seen   = LEAST(cowrie_unique_commands.first_seen, EXCLUDED.first_seen),
    last_seen    = GREATEST(cowrie_unique_commands.last_seen, EXCLUDED.last_seen),
    total_events = COALESCE(cowrie_unique_commands.total_events, 0) + EXCLUDED.total_events,
    unique_ips   = COALESCE(cowrie_unique_commands.unique_ips, 0) + EXCLUDED.unique_ips;
  " >/dev/null

  printf '\r  %d / %d' "$hi" "$MAXID"
  lo=$hi
done
echo

# 4+5. Catch up on anything ingested during the replay and re-arm, in one
# transaction under the same lock the migration uses. Inside it no new event
# can commit, so max(id) is exact and the trigger takes over cleanly at the
# boundary with nothing counted twice and nothing skipped.
echo "  catching up and re-arming under lock"
q "
BEGIN;
LOCK TABLE cowrie_events IN SHARE ROW EXCLUSIVE MODE;

WITH src AS (
  SELECT command, sha256(convert_to(command, 'UTF8')) AS h, src_ip, \"timestamp\"
    FROM cowrie_events
   WHERE id > ${MAXID} AND command IS NOT NULL AND command <> ''
),
pairs AS (
  INSERT INTO cowrie_command_ips (command_sha256, src_ip)
  SELECT DISTINCT h, src_ip FROM src ON CONFLICT DO NOTHING
  RETURNING command_sha256, src_ip
),
new_ip_counts AS (SELECT command_sha256 AS h, count(*) AS n FROM pairs GROUP BY 1),
agg AS (
  SELECT h, min(command) AS command, count(*) AS events,
         min(\"timestamp\") AS first_seen, max(\"timestamp\") AS last_seen
    FROM src GROUP BY h
)
INSERT INTO cowrie_unique_commands
      (command, command_sha256, first_seen, last_seen, total_events, unique_ips)
SELECT a.command, a.h, a.first_seen, a.last_seen, a.events, COALESCE(n.n, 0)
  FROM agg a LEFT JOIN new_ip_counts n ON n.h = a.h
ON CONFLICT (command_sha256) DO UPDATE SET
  first_seen   = LEAST(cowrie_unique_commands.first_seen, EXCLUDED.first_seen),
  last_seen    = GREATEST(cowrie_unique_commands.last_seen, EXCLUDED.last_seen),
  total_events = COALESCE(cowrie_unique_commands.total_events, 0) + EXCLUDED.total_events,
  unique_ips   = COALESCE(cowrie_unique_commands.unique_ips, 0) + EXCLUDED.unique_ips;

INSERT INTO cowrie_backfill_marker (name, cutoff_id, notes)
SELECT 'command_counters', COALESCE(max(id), 0),
       'Phase 0 backfill completed; trigger counts id > cutoff.'
  FROM cowrie_events
ON CONFLICT (name) DO UPDATE SET
  cutoff_id  = EXCLUDED.cutoff_id,
  created_at = now(),
  notes      = EXCLUDED.notes;

COMMIT;
" >/dev/null

q "ANALYZE cowrie_unique_commands;" >/dev/null
q "ANALYZE cowrie_command_ips;" >/dev/null
echo "  done. marker re-armed at $(q "SELECT cutoff_id FROM cowrie_backfill_marker WHERE name='command_counters';")"
