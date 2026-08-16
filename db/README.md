# Database

Postgres 16 on the VPS, database `cowrie_db`, owned by `cowrie_user`.

| Path | What it is |
|---|---|
| `schema.sql` | `pg_dump --schema-only` of production. The starting point for a fresh database. |
| `migrations/*.sql` | Ordered, apply-once changes on top of `schema.sql`. |
| `testdata/seed.sql` | Synthetic traffic used by CI so endpoints are asserted against real rows. |
| `apply-migrations.sh` | The only supported way to apply migrations. |

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
on `left(password_sha256, 5)`, matching the lookup exactly.

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
