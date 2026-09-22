#!/usr/bin/env bash
#
# Phase 2 backfill: populate cowrie_unique_commands.record_class for the
# 1.6M existing rows, using the same backend/lib/record-class.js the ingest
# path uses.
#
# Migration 013 deliberately does none of this. An earlier version of it did,
# in 50,000-row batches, and filled the disk: every UPDATE writes a new row
# version, so rewriting 1.6M rows grows the table by its own size again no
# matter how many transactions you spread the work across. The volume hit
# 100%, PostgreSQL crashed, and the API served 503 until the cluster was
# started by hand.
#
# Two things here are the lesson from that, and neither is optional:
#
#   VACUUM between chunks.  A plain VACUUM does not return space to the
#       operating system, but it does mark dead tuples reusable — so the next
#       chunk writes into the space the previous one freed instead of
#       extending the file. Peak growth becomes one chunk, not the whole
#       table. This is the difference between needing 500MB and needing 16MB.
#
#   A disk precondition.  Checked before starting and again every chunk, so a
#       run aborts with room to spare rather than taking the database down.
#       The database is on the root volume, so this is not a hypothetical.
#
# Re-runnable and safe to interrupt: the UPDATE is guarded on the value
# actually changing, so a second run writes nothing and creates no dead
# tuples. Run it again after changing the classification rules — the CASE is
# generated from the JavaScript at run time, so it cannot drift from what the
# ingest path applies to new rows.
#
# Usage:  db/backfill/013_record_class.sh <psql invocation...>
#   e.g.  db/backfill/013_record_class.sh sudo -u postgres psql -d cowrie_db
#
# Environment:
#   CHUNK=50000     rows per transaction
#   MIN_FREE_MB=700 abort if the volume has less free space than this
#   VACUUM_EVERY=1  vacuum after every N chunks

set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
CHUNK=${CHUNK:-50000}
MIN_FREE_MB=${MIN_FREE_MB:-700}
VACUUM_EVERY=${VACUUM_EVERY:-1}
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v node >/dev/null || { echo "node is required (the rules are JavaScript)" >&2; exit 1; }

q() { "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }

# Free megabytes on whatever volume the database lives on. Asked of the
# database rather than assumed to be /, so this stays correct if the data
# directory is ever moved to its own mount.
#
# Returns nothing when the data directory is not visible from here, which is
# the normal case when psql is talking to a server on another host or in a
# container — the client's own free space says nothing about the server's, so
# reporting it would be worse than reporting nothing.
free_mb() {
  local dir
  dir=$(q "SHOW data_directory;")
  [ -n "$dir" ] && [ -d "$dir" ] || return 0
  df -Pm "$dir" 2>/dev/null | awk 'NR==2 {print $4}'
}

disk_check_warned=0
check_disk() {
  [ "$MIN_FREE_MB" -eq 0 ] && return 0
  local free
  free=$(free_mb)
  if [ -z "$free" ]; then
    if [ "$disk_check_warned" -eq 0 ]; then
      echo "  note: the server's data directory is not visible from here," >&2
      echo "        so the disk floor cannot be enforced. Set MIN_FREE_MB=0" >&2
      echo "        to acknowledge, or run this on the database host." >&2
      disk_check_warned=1
    fi
    exit 1
  fi
  if [ "$free" -lt "$MIN_FREE_MB" ]; then
    echo
    echo "ABORTING: ${free}MB free, below the ${MIN_FREE_MB}MB floor." >&2
    echo "The table has been left partly classified, which is safe — the" >&2
    echo "endpoints do not read this column until the backfill completes." >&2
    echo "Reclaim space, then re-run; already-classified rows cost nothing." >&2
    exit 1
  fi
}

# One source of truth: the CASE comes out of the same module the ingest path
# calls, rather than being written again here.
CASE_SQL="$(node -e "process.stdout.write(require('${REPO}/backend/lib/record-class').recordClassSql('command', 'command_sha256'))")"
[ -n "$CASE_SQL" ] || { echo "record-class.js produced no CASE expression" >&2; exit 1; }

echo "=== Phase 2 backfill: record_class ==="
check_disk
MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_unique_commands;")
free_note=$(free_mb)
echo "  ids 1..${MAXID}, chunks of ${CHUNK}, ${free_note:-?}MB free (floor ${MIN_FREE_MB}MB)"

changed=0
chunks=0
lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + CHUNK ))
  [ "$hi" -gt "$MAXID" ] && hi=$MAXID
  check_disk

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
  chunks=$(( chunks + 1 ))

  # The whole point. Without this the table grows by its own size and the
  # volume fills; with it each chunk writes into the space the last one
  # freed. VACUUM is online — it takes no exclusive lock and the ingest path
  # keeps writing throughout.
  if [ $(( chunks % VACUUM_EVERY )) -eq 0 ]; then
    q "VACUUM cowrie_unique_commands;" >/dev/null
  fi

  printf '\r  ids %d / %d — %d classified, %sMB free   ' "$hi" "$MAXID" "$changed" "$(free_mb || echo '?')"
  lo=$hi
done
echo

q "VACUUM ANALYZE cowrie_unique_commands;" >/dev/null

echo "  done. ${changed} rows classified."
"${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
  SELECT '  ' || lpad(count(*)::text, 9) || '  ' || record_class
    FROM cowrie_unique_commands GROUP BY record_class ORDER BY count(*) DESC;"
