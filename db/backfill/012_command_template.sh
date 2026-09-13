#!/usr/bin/env bash
#
# Phase 1 backfill: populate cowrie_unique_commands.command_template for every
# existing row, using the same backend/lib/normalize.js that the ingest path
# uses.
#
# Shape of the run, per chunk of ids:
#
#   psql  COPY (id, command) TO STDOUT
#     |   node template-stream.js          (normalizer, runs as the repo owner)
#     |   psql  COPY stage FROM STDIN
#   psql  UPDATE ... FROM stage; TRUNCATE stage
#
# Splitting it this way keeps each side doing what only it can: psql reaches
# the database (as postgres, via peer auth, exactly like the migrations), and
# node reads the repo (as the invoking user). Neither needs the other's
# permissions — the same reasoning as the stdin redirection in
# db/apply-migrations.sh, where `sudo -u postgres psql -f path` could not
# traverse /home/admin to read its own migration file.
#
# Restartable: RESUME=1 processes only rows whose template is still NULL, so an
# interrupted run costs at most the chunk it was in. A full re-run is also safe
# — the normalizer is idempotent and the UPDATE is keyed on id — and is what
# you want after changing normalize.js.
#
# This does not touch `command`, total_events, unique_ips or cowrie_command_ips.
# Phase 0's counters are independent of it.
#
# Usage:  db/backfill/012_command_template.sh <psql invocation...>
#   e.g.  db/backfill/012_command_template.sh sudo -u postgres psql -d cowrie_db
#
# Environment:
#   CHUNK=50000   rows per round trip
#   RESUME=1      only rows with command_template IS NULL

set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $0 <psql ...>" >&2; exit 2; }
PSQL=("$@")
CHUNK=${CHUNK:-50000}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null || { echo "node is required (normalize.js is JavaScript)" >&2; exit 1; }

q() { "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "$1"; }

# Only-NULL vs everything. Note this filters the COPY OUT, not the UPDATE: a
# row excluded here is never read, so a resumed run does no work for it at all.
FILTER=""
[ "${RESUME:-0}" = "1" ] && FILTER="AND command_template IS NULL"

echo "=== Phase 1 backfill: command_template ==="

TOTAL=$(q "SELECT count(*) FROM cowrie_unique_commands WHERE true ${FILTER};")
MAXID=$(q "SELECT COALESCE(max(id), 0) FROM cowrie_unique_commands;")
echo "  ${TOTAL} rows to template, ids 1..${MAXID}, chunks of ${CHUNK}"
[ "$TOTAL" -eq 0 ] && { echo "  nothing to do"; exit 0; }

# A previous interrupted run may have left rows behind; they would be re-read
# as duplicate keys by the COPY below.
q "TRUNCATE cowrie_command_template_stage;" >/dev/null

done_rows=0
lo=0
while [ "$lo" -lt "$MAXID" ]; do
  hi=$(( lo + CHUNK ))
  [ "$hi" -gt "$MAXID" ] && hi=$MAXID

  # set -o pipefail is on, so a psql failure anywhere in this pipeline aborts
  # the run rather than quietly writing a short chunk.
  "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
    COPY (SELECT id, command
            FROM cowrie_unique_commands
           WHERE id > ${lo} AND id <= ${hi} ${FILTER})
    TO STDOUT" \
    | node "${HERE}/template-stream.js" \
    | "${PSQL[@]}" -qtA -v ON_ERROR_STOP=1 -c "
      COPY cowrie_command_template_stage (id, command_template) FROM STDIN" >/dev/null

  # The trigger from migration 012 derives template_sha256 from this write, so
  # the hash cannot fall out of step with the text it indexes.
  #
  # IS DISTINCT FROM: a re-run over unchanged rows should cost nothing. Without
  # it every row is rewritten, which on 1.7M rows is 1.7M dead tuples and a
  # table that needs vacuuming for no gain.
  n=$(q "
    WITH upd AS (
      UPDATE cowrie_unique_commands u
         SET command_template = s.command_template
        FROM cowrie_command_template_stage s
       WHERE u.id = s.id
         AND u.command_template IS DISTINCT FROM s.command_template
      RETURNING 1
    )
    SELECT count(*) FROM upd;")
  q "TRUNCATE cowrie_command_template_stage;" >/dev/null

  done_rows=$(( done_rows + n ))
  printf '\r  ids %d / %d — %d rows written' "$hi" "$MAXID" "$done_rows"
  lo=$hi
done
echo

q "ANALYZE cowrie_unique_commands;" >/dev/null

echo "  done. ${done_rows} templates written."
q "
SELECT '  coverage: ' || count(*) FILTER (WHERE command_template IS NOT NULL)
    || ' / ' || count(*) || ' rows templated'
  FROM cowrie_unique_commands;"
