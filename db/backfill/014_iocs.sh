#!/usr/bin/env bash
#
# Phase 4 backfill: extract indicators from every stored command into
# cowrie_iocs, using the same backend/lib/iocs.js the ingest path uses.
#
#   psql  COPY (id, first_seen, last_seen, command) TO STDOUT
#     |   node ioc-stream.js        (extraction, as the repo owner)
#     |   psql  COPY stage FROM STDIN
#   psql  upsert stage -> cowrie_iocs; TRUNCATE stage
#
# Splitting it this way keeps each side doing what only it can: psql reaches
# the database as postgres via peer auth, node reads the repo as the invoking
# user. Neither needs the other's permissions.
#
# Re-runnable. The upsert keeps the earliest first_seen and the latest
# last_seen, and recomputes occurrence_count from scratch per run rather than
# adding to it, so running twice does not double every count.
#
# Usage:  db/backfill/014_iocs.sh <psql invocation...>
#   e.g.  db/backfill/014_iocs.sh sudo -u postgres psql -d cowrie_db
#
# Environment:
#   CHUNK=20000     commands per round trip
#   MIN_FREE_MB=700 abort if the database volume drops below this
#   ALL_CLASSES=1   extract from artifacts too (default: real commands only)

set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
CHUNK=${CHUNK:-20000}
MIN_FREE_MB=${MIN_FREE_MB:-700}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null || { echo "node is required (the extractors are JavaScript)" >&2; exit 1; }

q() { "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }

# Free space on the volume the database is actually on. Returns nothing when
# the data directory is not visible from here, which is the normal case when
# psql talks to a server elsewhere.
free_mb() {
  local dir
  dir=$(q "SHOW data_directory;")
  [ -n "$dir" ] && [ -d "$dir" ] || return 0
  df -Pm "$dir" 2>/dev/null | awk 'NR==2 {print $4}'
}

check_disk() {
  [ "$MIN_FREE_MB" -eq 0 ] && return 0
  local free; free=$(free_mb)
  if [ -z "$free" ]; then
    echo "  note: the server's data directory is not visible from here, so the" >&2
    echo "        disk floor cannot be enforced. Set MIN_FREE_MB=0 to proceed." >&2
    exit 1
  fi
  if [ "$free" -lt "$MIN_FREE_MB" ]; then
    echo >&2
    echo "ABORTING: ${free}MB free, below the ${MIN_FREE_MB}MB floor." >&2
    echo "Indicators already extracted are kept; re-run after reclaiming space." >&2
    exit 1
  fi
}

# Artifacts are Cowrie's own log lines. "Attempt to download file(s) from URL
# ..." contains a URL, and mining it would publish the honeypot's own logging
# as threat intelligence.
FILTER="record_class = 'command'"
[ "${ALL_CLASSES:-0}" = "1" ] && FILTER="true"

echo "=== Phase 4 backfill: cowrie_iocs ==="
check_disk
TOTAL=$(q "SELECT count(*) FROM cowrie_unique_commands WHERE ${FILTER};")
MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_unique_commands;")
free_note=$(free_mb)
echo "  scanning ${TOTAL} commands, ids 1..${MAXID}, chunks of ${CHUNK}, ${free_note:-?}MB free"

q "TRUNCATE cowrie_iocs_stage;" >/dev/null

lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + CHUNK ))
  [ "$hi" -gt "$MAXID" ] && hi=$MAXID
  check_disk

  "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
    COPY (SELECT id, first_seen, last_seen, command
            FROM cowrie_unique_commands
           WHERE id > ${lo} AND id <= ${hi} AND ${FILTER})
    TO STDOUT" \
    | node "${HERE}/ioc-stream.js" \
    | "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
      COPY cowrie_iocs_stage (ioc_type, value, meta, first_seen, last_seen, occurrence_count, source_command_id)
      FROM STDIN" >/dev/null

  printf '\r  ids %d / %d' "$hi" "$MAXID"
  lo=$hi
done
echo

echo "  collapsing duplicates and upserting"
# Aggregate in SQL rather than in the stream: an indicator appears in many
# commands, and the stream sees each command independently.
q "
WITH agg AS (
  SELECT ioc_type::cowrie_ioc_type AS ioc_type,
         value,
         (array_agg(meta ORDER BY first_seen))[1] AS meta,
         min(first_seen)            AS first_seen,
         max(last_seen)             AS last_seen,
         count(DISTINCT source_command_id) AS occurrence_count,
         min(source_command_id)     AS source_command_id
    FROM cowrie_iocs_stage
   GROUP BY ioc_type, value
)
INSERT INTO cowrie_iocs (ioc_type, value, meta, first_seen, last_seen, occurrence_count, source_command_id)
SELECT ioc_type, value, meta, first_seen, last_seen, occurrence_count, source_command_id FROM agg
ON CONFLICT (ioc_type, value_sha256) DO UPDATE SET
  first_seen        = LEAST(cowrie_iocs.first_seen, EXCLUDED.first_seen),
  last_seen         = GREATEST(cowrie_iocs.last_seen, EXCLUDED.last_seen),
  -- Assigned, not added: a re-run recomputes the count from the full corpus,
  -- so running this twice must not double it.
  occurrence_count  = EXCLUDED.occurrence_count,
  meta              = EXCLUDED.meta,
  source_command_id = LEAST(cowrie_iocs.source_command_id, EXCLUDED.source_command_id);
" >/dev/null

# Record which commands carry which indicator, then derive occurrence_count
# from that table rather than from the aggregate above. Both paths then mean
# the same thing by the number, and a re-run cannot drift from ingest.
q "
INSERT INTO cowrie_ioc_commands (ioc_id, command_id)
SELECT i.id, s.source_command_id
  FROM cowrie_iocs_stage s
  JOIN cowrie_iocs i
    ON i.ioc_type = s.ioc_type::cowrie_ioc_type
   AND i.value_sha256 = sha256(convert_to(s.value, 'UTF8'))
 WHERE s.source_command_id IS NOT NULL
ON CONFLICT DO NOTHING;
" >/dev/null

q "
UPDATE cowrie_iocs i
   SET occurrence_count = c.n
  FROM (SELECT ioc_id, count(*) AS n FROM cowrie_ioc_commands GROUP BY ioc_id) c
 WHERE c.ioc_id = i.id AND i.occurrence_count IS DISTINCT FROM c.n;
" >/dev/null

q "TRUNCATE cowrie_iocs_stage;" >/dev/null
q "ANALYZE cowrie_iocs;" >/dev/null
q "ANALYZE cowrie_ioc_commands;" >/dev/null

echo "  done."
"${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
  SELECT '  ' || lpad(count(*)::text, 5) || '  ' || ioc_type
    FROM cowrie_iocs GROUP BY ioc_type ORDER BY count(*) DESC;"
