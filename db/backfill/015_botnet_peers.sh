#!/usr/bin/env bash
#
# Phase 3 backfill: populate cowrie_botnet_peers from the captured Panchan
# launch commands, enriched with the same MaxMind databases the API uses.
#
#   psql  COPY (id, first_seen, last_seen, command) TO STDOUT
#     |   node peer-stream.js       (extraction + geo, as the repo owner)
#     |   psql  COPY stage FROM STDIN
#   psql  upsert stage -> peers, pairs, list_count
#
# Re-runnable: list_count is derived from the pair table rather than
# incremented, so a second run cannot double it.
#
# Usage:  db/backfill/015_botnet_peers.sh <psql invocation...>
#
# Environment:
#   CHUNK=20000     commands per round trip
#   MIN_FREE_MB=700 abort if the database volume drops below this

set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
CHUNK=${CHUNK:-20000}
MIN_FREE_MB=${MIN_FREE_MB:-700}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LISTS_TMP="$(mktemp)"
trap 'rm -f "$LISTS_TMP"' EXIT

command -v node >/dev/null || { echo "node is required (the extractor is JavaScript)" >&2; exit 1; }

q() { "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }

free_mb() {
  local dir; dir=$(q "SHOW data_directory;")
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
    echo >&2; echo "ABORTING: ${free}MB free, below the ${MIN_FREE_MB}MB floor." >&2
    exit 1
  fi
}

echo "=== Phase 3 backfill: cowrie_botnet_peers ==="
check_disk
MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_unique_commands;")
free_note=$(free_mb)
echo "  ids 1..${MAXID}, chunks of ${CHUNK}, ${free_note:-?}MB free"

q "TRUNCATE cowrie_peers_stage;" >/dev/null
: > "$LISTS_TMP"

lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + CHUNK )); [ "$hi" -gt "$MAXID" ] && hi=$MAXID
  check_disk
  chunk_lists="$(mktemp)"

  "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
    COPY (SELECT id, first_seen, last_seen, command
            FROM cowrie_unique_commands
           WHERE id > ${lo} AND id <= ${hi} AND record_class = 'command')
    TO STDOUT" \
    | PEER_LISTS_OUT="$chunk_lists" node "${HERE}/peer-stream.js" \
    | "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
      COPY cowrie_peers_stage (peer_ip, first_seen, last_seen, country_iso, asn, org, city, source_command_id)
      FROM STDIN" >/dev/null

  cat "$chunk_lists" >> "$LISTS_TMP"; rm -f "$chunk_lists"
  printf '\r  ids %d / %d' "$hi" "$MAXID"
  lo=$hi
done
echo

# Same reconciliation as the indicator backfill: a launch command that is no
# longer classified as a command must stop contributing peers.
echo "  reconciling against the current classification"
q "
DELETE FROM cowrie_peer_commands pc
 USING cowrie_unique_commands u
 WHERE u.id = pc.command_id AND u.record_class <> 'command';
" >/dev/null
q "
DELETE FROM cowrie_botnet_peers p
 WHERE NOT EXISTS (SELECT 1 FROM cowrie_peer_commands pc WHERE pc.peer_id = p.id);
" >/dev/null
q "
DELETE FROM cowrie_peer_lists l
 USING cowrie_unique_commands u
 WHERE u.id = l.command_id AND u.record_class <> 'command';
" >/dev/null

echo "  recording the launches (including the empty ones)"
# The 46 launches that pass no addresses are kept deliberately: the ratio of
# empty to populated lists says how often the operator ships a fresh bootstrap
# set, and storing only the populated ones would overstate it.
"${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
  CREATE TEMP TABLE lists_in (command_id bigint, peer_count int, first_seen timestamptz, last_seen timestamptz);
  COPY lists_in FROM STDIN;
  INSERT INTO cowrie_peer_lists (command_id, peer_count, first_seen, last_seen)
  SELECT command_id, peer_count, first_seen, last_seen FROM lists_in
  ON CONFLICT (command_id) DO UPDATE SET
    peer_count = EXCLUDED.peer_count,
    first_seen = LEAST(cowrie_peer_lists.first_seen, EXCLUDED.first_seen),
    last_seen  = GREATEST(cowrie_peer_lists.last_seen, EXCLUDED.last_seen);
" < "$LISTS_TMP" >/dev/null

echo "  upserting peers"
q "
WITH agg AS (
  SELECT peer_ip,
         min(first_seen) AS first_seen,
         max(last_seen)  AS last_seen,
         (array_agg(country_iso) FILTER (WHERE country_iso IS NOT NULL))[1] AS country_iso,
         (array_agg(asn)         FILTER (WHERE asn IS NOT NULL))[1]         AS asn,
         (array_agg(org)         FILTER (WHERE org IS NOT NULL))[1]         AS org,
         (array_agg(city)        FILTER (WHERE city IS NOT NULL))[1]        AS city,
         min(source_command_id) AS source_command_id
    FROM cowrie_peers_stage GROUP BY peer_ip
)
INSERT INTO cowrie_botnet_peers
      (peer_ip, first_seen, last_seen, country_iso, asn, org, city, source_command_id)
SELECT peer_ip, first_seen, last_seen, country_iso, asn, org, city, source_command_id FROM agg
ON CONFLICT (peer_ip) DO UPDATE SET
  first_seen  = LEAST(cowrie_botnet_peers.first_seen, EXCLUDED.first_seen),
  last_seen   = GREATEST(cowrie_botnet_peers.last_seen, EXCLUDED.last_seen),
  country_iso = COALESCE(EXCLUDED.country_iso, cowrie_botnet_peers.country_iso),
  asn         = COALESCE(EXCLUDED.asn, cowrie_botnet_peers.asn),
  org         = COALESCE(EXCLUDED.org, cowrie_botnet_peers.org),
  city        = COALESCE(EXCLUDED.city, cowrie_botnet_peers.city);
" >/dev/null

q "
INSERT INTO cowrie_peer_commands (peer_id, command_id)
SELECT p.id, s.source_command_id
  FROM cowrie_peers_stage s JOIN cowrie_botnet_peers p ON p.peer_ip = s.peer_ip
ON CONFLICT DO NOTHING;
" >/dev/null

# Derived, not incremented, so a re-run cannot double it.
q "
UPDATE cowrie_botnet_peers p
   SET list_count = c.n
  FROM (SELECT peer_id, count(*) AS n FROM cowrie_peer_commands GROUP BY peer_id) c
 WHERE c.peer_id = p.id AND p.list_count IS DISTINCT FROM c.n;
" >/dev/null

q "TRUNCATE cowrie_peers_stage;" >/dev/null
q "ANALYZE cowrie_botnet_peers;" >/dev/null
q "ANALYZE cowrie_peer_commands;" >/dev/null

echo "  done."
"${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
  SELECT '  peers: '        || (SELECT count(*) FROM cowrie_botnet_peers)
      || '   pairs: '       || (SELECT count(*) FROM cowrie_peer_commands)
      || '   launches: '    || (SELECT count(*) FROM cowrie_peer_lists)
      || '   of which empty: ' || (SELECT count(*) FROM cowrie_peer_lists WHERE peer_count = 0);"
