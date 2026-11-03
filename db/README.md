# Database

Postgres 16 on the VPS, database `cowrie_db`, owned by `cowrie_user`.

| Path | What it is |
|---|---|
| `schema.sql` | `pg_dump --schema-only` of production. The starting point for a fresh database. |
| `migrations/*.sql` | Ordered, apply-once changes on top of `schema.sql`. |
| `testdata/seed.sql` | Synthetic traffic used by CI so endpoints are asserted against real rows. |
| `apply-migrations.sh` | The only supported way to apply migrations. |
| `systemd/` | Drop-in for `postgresql@16-main` so a failed start is retried. Installed by hand. |

## Applying migrations

```sh
./db/apply-migrations.sh sudo -u postgres psql -d cowrie_db          # production
./db/apply-migrations.sh psql -h localhost -U postgres -d cowrie_db  # local/CI
```

Each file is applied once and recorded in `schema_migrations` (version,
checksum, applied_at). Already-recorded migrations are skipped. **A migration
that fails aborts the run with a non-zero exit code** — the deploy fails with
it rather than continuing.

| Variable | Effect |
|---|---|
| `FORCE=1` | Re-apply every migration, ignoring the ledger. CI uses this to prove migrations are still idempotent. |
| `ALLOW_CHECKSUM_DRIFT=1` | Warn instead of failing when a file no longer matches what was applied. |

## Running the CI suite locally

```sh
tools/ci-local.sh
```

Schema, migrations, seed and every endpoint assertion, against a throwaway
Postgres 16 container. About a minute. It extracts the assertions from
`.github/workflows/ci.yml` rather than copying them, so there is one set of
checks and it is the set CI runs.

No local `psql` is needed — the script shims it through the container. Only
docker, jq, python3 (pyyaml) and node.

Worth running before a push. Two bugs in the payload-URL export reached
production because the checks that would have caught them were only ever run
after the push, and were only written after reading the broken output.

## Rules

**Never edit a migration that has been applied.** Its checksum is recorded, and
the next deploy will refuse to run:

```
! 006_add_leaderboard_aggs changed since it was applied to this database.
```

Add a new migration instead. The escape hatch exists for the case where you
have genuinely verified the edit is cosmetic.

**Write every migration to be re-runnable** (`IF NOT EXISTS`, `CREATE OR
REPLACE`, guarded `DO` blocks). The ledger means it should only run once, but
`FORCE=1` and disaster recovery both replay them, and CI fails the build if one
is not idempotent.

**Mind the transaction boundary.** `CREATE INDEX CONCURRENTLY` cannot run
inside a transaction, so `apply-migrations.sh` deliberately does not wrap
migrations in one. A file containing several statements can therefore fail
halfway and leave the earlier ones applied. Where that matters, put the risky
work in its own `DO` block — see `006_add_leaderboard_aggs.sql`, which is split
into three because a single oversized value aborted the whole thing in
production and rolled back 36 minutes of backfill.

**Cap anything that lands in a btree index.** Attackers send multi-kilobyte
credentials; a btree index row tops out at 8191 bytes. `cowrie_unique_creds`
and `cowrie_cred_ips` are limited to 1000 bytes of `username + password`, in
both the trigger and the API (`LIMITS.MAX_CRED_BYTES`).

## Disk

The API and PostgreSQL share one 20 GB volume, and the database is about
8 GB of it. `/api/health` reports `diskLow` below `DISK_LOW_FREE_MB` (2 GB)
and the watchdog opens an issue.

**When it fills, PostgreSQL stops.** That happened on 2026-10-22 and the
database stayed down for twelve days after space returned, because nothing
restarted it. [`systemd/postgresql@16-main.service.d/restart.conf`](systemd/postgresql@16-main.service.d/restart.conf)
makes systemd retry a failed start every 30 s. It is installed on the VPS; if
the machine is ever rebuilt, install it again (instructions in the file).

**What can be reclaimed**, largest first:

| What | Size | Safe? |
|---|---|---|
| `~/actions-runner/_work/_update` | ~700 MB | Yes. Staging copy the runner leaves after every self-update. |
| `~/actions-runner/{bin,externals}.<old version>` | ~700 MB | Yes, for any version the `bin`/`externals` symlinks do not point at. |
| `~/actions-runner/actions-runner-linux-*.tar.gz` | ~220 MB | Yes. The original installer. |

The [`VPS housekeeping`](../.github/workflows/vps-housekeeping.yml) workflow
removes all three daily, because the runner auto-updates and each update
leaves another ~1.4 GB behind. That is what took the volume from "low" to
full in under an hour on 2026-10-22.

Inside the database, a `VACUUM FULL` or a rebuild of the large indexes can give
space back, but both need free space roughly the size of the table being
rewritten. Do them only with headroom to spare, and never at a full disk.

**After an outage, backfill.** The forwarder delivers at-least-once, but
events only stay on the Pi in Cowrie's rotated logs. If the forwarder has
moved past a gap, [`tools/backfill_cowrie.py`](../tools/backfill_cowrie.py)
replays a time window from those logs through the ingest API. The window
matters: `cowrie_events` has no natural key, so replaying anything already
stored doubles it and every counter maintained from it.

## Aggregate tables

`cowrie_asn_agg`, `cowrie_country_agg`, `cowrie_files_agg`, `cowrie_cred_ips`
and the counters on `cowrie_unique_creds` are maintained by triggers, not by
queries at read time. This is what took `/summary` from 51s to 0.10s: the
leaderboard endpoints used to run unbounded `GROUP BY` scans over
`cowrie_events` (7.7M rows) and starved the 20-connection pool.

`unique_ips` relies on `FOUND` being true only when `INSERT ... ON CONFLICT DO
NOTHING` actually inserted, which is how a repeat visit from a known IP
increments `total` but not `unique_ips`. CI asserts this
(AS4134 → 8 events, 2 unique IPs) because getting it wrong yields plausible
looking numbers rather than an error.

`cowrie_unique_commands` is the exception — it is maintained by the ingest
endpoint, so `testdata/seed.sql` has to populate it explicitly.

## Password hashes

`cowrie_unique_creds.password_sha256` backs the k-anonymous password lookup
(`/api/public/cowrie/passwords/range/:prefix`). The browser hashes a password
with SHA-256 and sends only the first five hex characters; the API returns
every stored hash sharing that prefix and the browser matches locally, so the
password never reaches the server.

The column is maintained by a `BEFORE INSERT` trigger rather than a
`GENERATED ALWAYS` column: Postgres rejects the latter because `convert_to()`
is stable, not immutable — it depends on the database encoding. The index is
on `left(password_sha256, 3)`, matching the lookup exactly.

**The prefix length is sized to this corpus, not copied from HIBP.** Migration
008 used HIBP's 5 characters, which was wrong here. Measured against
production:

| Prefix | Buckets | Candidates per lookup |
|---|---|---|
| 5 (migration 008) | 1,048,576 | **0.25** — the caller's own hash, and nothing else |
| 3 (migration 009) | 4,096 | ~33, in a ~5 KB response, ~150 ms |

HIBP can afford 5 because it holds ~850M hashes; this table holds ~134k
distinct passwords. At k=1 the server can infer which password was checked,
which defeats the entire point, so the endpoint **rejects** a longer prefix
rather than accepting one. If the corpus grows by an order of magnitude,
4 characters becomes the right choice — re-measure before changing it.

Migration 009's own comment quotes a ~262k corpus estimate taken from a
40-prefix sample before the change; a 60-prefix sample afterwards put it at
~134k. The migration is left as applied rather than corrected, because editing
an applied migration is what the checksum guard exists to prevent.

## Local database for testing

```sh
docker run -d --name hp -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cowrie_db \
  -p 5432:5432 postgres:16
psql -h localhost -U postgres -d cowrie_db \
  -c "CREATE ROLE cowrie_user LOGIN PASSWORD 'dev';"
grep -v '^\\restrict\|^\\unrestrict' db/schema.sql | psql -h localhost -U postgres -d cowrie_db
./db/apply-migrations.sh psql -h localhost -U postgres -d cowrie_db
psql -h localhost -U postgres -d cowrie_db -f db/testdata/seed.sql
```

The `\restrict` / `\unrestrict` lines are stripped because they are emitted by
newer `pg_dump` versions and rejected by older `psql` clients.
