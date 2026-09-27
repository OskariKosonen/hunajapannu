#!/usr/bin/env bash
#
# Phase 5 backfill: score every stored command against
# backend/lib/rules/honeypot-probes.json.
#
# Re-run this after editing the rules file — that is the whole point of the
# phase. Scores are assigned, not accumulated, so a re-run reflects the
# current rules exactly, including rules that were removed.
#
# Usage:  db/backfill/016_honeypot_probe.sh <psql invocation...>
#
# Environment:
#   CHUNK=50000     commands per round trip
#   MIN_FREE_MB=700 abort if the database volume drops below this

set -euo pipefail
[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
CHUNK=${CHUNK:-50000}
MIN_FREE_MB=${MIN_FREE_MB:-700}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null || { echo "node is required (the scorer is JavaScript)" >&2; exit 1; }
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
    echo "  note: the data directory is not visible from here; set MIN_FREE_MB=0 to proceed." >&2; exit 1
  fi
  [ "$free" -ge "$MIN_FREE_MB" ] || { echo; echo "ABORTING: ${free}MB free, below ${MIN_FREE_MB}MB." >&2; exit 1; }
}

echo "=== Phase 5 backfill: honeypot probe scores ==="
check_disk
MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_unique_commands;")
free_note=$(free_mb)
echo "  ids 1..${MAXID}, chunks of ${CHUNK}, ${free_note:-?}MB free"
q "TRUNCATE cowrie_probe_stage;" >/dev/null

lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + CHUNK )); [ "$hi" -gt "$MAXID" ] && hi=$MAXID
  check_disk
  "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
    COPY (SELECT id, command FROM cowrie_unique_commands
           WHERE id > ${lo} AND id <= ${hi} AND record_class = 'command')
    TO STDOUT" \
    | node "${HERE}/probe-stream.js" \
    | "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
      COPY cowrie_probe_stage (id, probe_score, probe_rules) FROM STDIN" >/dev/null
  printf '\r  ids %d / %d' "$hi" "$MAXID"
  lo=$hi
done
echo

# Clear scores that the current rules no longer produce, then apply the new
# ones. Without the first step a retired rule would leave its verdicts behind
# forever, and the stored scores would drift from the file that defines them.
echo "  applying scores"
q "
UPDATE cowrie_unique_commands c
   SET probe_score = 0, probe_rules = '{}'
 WHERE c.probe_score <> 0
   AND NOT EXISTS (SELECT 1 FROM cowrie_probe_stage s WHERE s.id = c.id);
" >/dev/null
q "
UPDATE cowrie_unique_commands c
   SET probe_score = s.probe_score, probe_rules = s.probe_rules
  FROM cowrie_probe_stage s
 WHERE c.id = s.id
   AND (c.probe_score, c.probe_rules) IS DISTINCT FROM (s.probe_score, s.probe_rules);
" >/dev/null

q "TRUNCATE cowrie_probe_stage;" >/dev/null
q "ANALYZE cowrie_unique_commands;" >/dev/null

echo "  done."
"${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
  SELECT '  scored: ' || count(*) FILTER (WHERE probe_score > 0)
      || '   at or above threshold 3: ' || count(*) FILTER (WHERE probe_score >= 3)
    FROM cowrie_unique_commands WHERE record_class = 'command';"
