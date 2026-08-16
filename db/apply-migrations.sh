#!/usr/bin/env bash
#
# Applies db/migrations/*.sql exactly once each, recording what ran in a
# schema_migrations ledger.
#
# Two problems this fixes, both of which have already bitten us:
#
#   1. The deploy used to replay every migration on every push, so migrations
#      only worked because each was hand-guarded with IF NOT EXISTS. That is a
#      convention, not a guarantee.
#   2. The deploy swallowed failures with `|| echo "(skipped/failed...)"`. On
#      2026-08-12 migration 006 aborted partway through, the deploy went green,
#      and /top-asn served an empty aggregate table for days. A migration that
#      fails must now fail the deploy.
#
# Usage: pass the psql invocation for the target database as arguments.
#
#   ./db/apply-migrations.sh sudo -u postgres psql -d cowrie_db     # production
#   ./db/apply-migrations.sh psql -h localhost -U postgres -d cowrie_db  # CI
#
# Environment:
#   FORCE=1                  re-apply every migration regardless of the ledger.
#                            CI uses this to prove migrations are still
#                            re-runnable; it is also the manual escape hatch.
#   ALLOW_CHECKSUM_DRIFT=1   downgrade "this file changed after it was applied"
#                            from an error to a warning.
#
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: $0 <psql> [psql args...]" >&2
  exit 2
fi

PSQL=("$@")
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/migrations"

# -q quiet, -t tuples only, -A unaligned: gives bare values we can test on.
psql_value() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -qtA -c "$1"; }
psql_file()  { "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -f "$1"; }

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
# This script invokes psql with different arguments than the old inline deploy
# loop did (-c and -qtA as well as -f). If the runner's sudoers entry turns out
# to allowlist specific arguments rather than the psql binary, that would
# surface as a confusing permission or password-prompt failure partway through.
# Fail immediately with something actionable instead.
if ! "${PSQL[@]}" -v ON_ERROR_STOP=1 -qtA -c 'SELECT 1' >/dev/null 2>&1; then
  echo "Cannot reach the database with: ${PSQL[*]}" >&2
  echo "Check that the invoking user may run this command non-interactively" >&2
  echo "(e.g. a sudoers entry permitting the psql binary, not a fixed argument list)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Ledger
# ---------------------------------------------------------------------------
# Note there is no wrapping transaction: several migrations use CREATE INDEX
# CONCURRENTLY, which Postgres refuses to run inside one. So a migration and
# its ledger row are recorded in two steps, and a crash between them leaves
# the migration applied but unrecorded — it would simply run again next time,
# which is the same situation we are in today and is safe for these files.
psql_value "CREATE TABLE IF NOT EXISTS schema_migrations (
              version     text PRIMARY KEY,
              checksum    text NOT NULL,
              applied_at  timestamptz NOT NULL DEFAULT now()
            )" >/dev/null

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [ ${#migrations[@]} -eq 0 ]; then
  echo "No migration files found in $MIGRATIONS_DIR"
  exit 0
fi

applied=0
skipped=0

for path in "${migrations[@]}"; do
  version="$(basename "$path" .sql)"
  checksum="$(sha256sum "$path" | cut -d' ' -f1)"
  recorded="$(psql_value "SELECT checksum FROM schema_migrations WHERE version = '${version}'")"

  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$checksum" ]; then
      if [ "${ALLOW_CHECKSUM_DRIFT:-0}" = "1" ]; then
        echo "  ! $version changed since it was applied (ignoring: ALLOW_CHECKSUM_DRIFT=1)"
      else
        echo "  ! $version changed since it was applied to this database." >&2
        echo "    recorded: $recorded" >&2
        echo "    on disk:  $checksum" >&2
        echo "    An applied migration is history and must not be edited — add a new" >&2
        echo "    migration instead. To accept the new contents: ALLOW_CHECKSUM_DRIFT=1" >&2
        exit 1
      fi
    fi

    if [ "${FORCE:-0}" != "1" ]; then
      echo "  - $version (already applied)"
      skipped=$((skipped + 1))
      continue
    fi
    echo "  ~ $version (re-applying: FORCE=1)"
  else
    echo "  + $version"
  fi

  # No `|| true` here on purpose: set -e aborts the deploy if this fails.
  psql_file "$path"

  psql_value "INSERT INTO schema_migrations (version, checksum)
              VALUES ('${version}', '${checksum}')
              ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum,
                                                 applied_at = now()" >/dev/null
  applied=$((applied + 1))
done

echo "Migrations: $applied applied, $skipped already up to date."
