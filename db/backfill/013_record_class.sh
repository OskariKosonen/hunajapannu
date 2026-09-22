#!/usr/bin/env bash
#
# Phase 2 re-classification: recompute cowrie_unique_commands.record_class for
# every row from backend/lib/record-class.js.
#
# Migration 013 already classified the history once, inline, because the
# endpoints filter to record_class = 'command' the moment the new code starts
# and a migration must not leave the database in a state the application
# cannot serve. This script is what you run *afterwards*, whenever the
# classification itself changes — a new Cowrie log prefix turns up on the
# leaderboard, or a sixth binary fragment appears.
#
# It is the authority when the two disagree: the CASE here is generated from
# the JavaScript lists at run time, so it cannot drift from what the ingest
# path applies to new rows, whereas the migration's copy is frozen history.
#
# Re-runnable and safe to interrupt. Unlike the migration's pass this does not
# skip already-classified rows — recomputing is the entire point — but the
# UPDATE is guarded on the value actually changing, so a no-op run writes
# nothing and creates no dead tuples.
#
# Usage:  db/backfill/013_record_class.sh <psql invocation...>
#   e.g.  db/backfill/013_record_class.sh sudo -u postgres psql -d cowrie_db
#
# Environment:
#   CHUNK=50000   rows per transaction

set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
CHUNK=${CHUNK:-50000}
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v node >/dev/null || { echo "node is required (the rules are JavaScript)" >&2; exit 1; }

q() { "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }

# One source of truth: the CASE comes out of the same module the ingest path
# calls, rather than being written again here.
CASE_SQL="$(node -e "process.stdout.write(require('${REPO}/backend/lib/record-class').recordClassSql('command', 'command_sha256'))")"
[ -n "$CASE_SQL" ] || { echo "record-class.js produced no CASE expression" >&2; exit 1; }

echo "=== Phase 2 re-classification ==="
MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_unique_commands;")
echo "  ids 1..${MAXID}, chunks of ${CHUNK}"

changed=0
lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + CHUNK ))
  [ "$hi" -gt "$MAXID" ] && hi=$MAXID

  n=$(q "
    WITH upd AS (
      UPDATE cowrie_unique_commands
         SET record_class = ${CASE_SQL}
       WHERE id > ${lo} AND id <= ${hi}
         AND record_class IS DISTINCT FROM (${CASE_SQL})
      RETURNING 1
    )
    SELECT count(*) FROM upd;")

  changed=$(( changed + n ))
  printf '\r  ids %d / %d — %d reclassified' "$hi" "$MAXID" "$changed"
  lo=$hi
done
echo

q "ANALYZE cowrie_unique_commands;" >/dev/null

echo "  done. ${changed} rows changed class."
"${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
  SELECT '  ' || lpad(count(*)::text, 9) || '  ' || record_class
    FROM cowrie_unique_commands GROUP BY record_class ORDER BY count(*) DESC;"
