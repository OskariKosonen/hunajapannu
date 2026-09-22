<div align="center">

# hunajapannu.fi

**A real SSH honeypot on a Raspberry Pi in Finland, and the threat-intelligence platform built around it.**

Eight million attacks. 28,930 unique attackers. 168 countries. Live, since November 2025.

[**→ See it live**](https://hunajapannu.fi) · [API](#public-api) · [Architecture](#architecture) · [What broke, and what changed](#what-broke-and-what-changed)

</div>

![The live dashboard](docs/dashboard.png)

---

## What this is

A [Cowrie](https://github.com/cowrie/cowrie) SSH/Telnet honeypot sits on a Raspberry Pi on a Finnish consumer broadband line, pretending to be a badly-secured server. Botnets log in with credentials like `admin:admin123` and `support:support` — the two most-tried pairs here — and then start typing. Everything they do is captured, enriched, and published, at roughly 15,000 attacks a day.

It is not a demo. It has been running unattended since **24 November 2025**, has survived a 12-hour outage and a four-day silent failure, and every number on the dashboard is live.

| | |
|---|---|
| **8,031,815** attacks recorded | **28,930** unique attacker IPs |
| **168** countries · **3,414** networks (ASNs) | **223,063** distinct credential pairs tried |
| **302** malware samples captured & hashed | **4,025** distinct attacker commands |

<sub>Snapshot, 22 September 2026. The live figures are on the dashboard.</sub>

## Architecture

```
  Raspberry Pi (Finland, consumer broadband)       VPS                        Browser
 ┌────────────────────────────────────────┐   ┌──────────────────────┐   ┌──────────────┐
 │  Cowrie honeypot  →  cowrie.json       │   │  Express 5 API       │   │  React 19    │
 │         ↓                              │   │        ↕             │   │  Vite        │
 │  forwarder.py  ──── HTTPS + bearer ───────→│  PostgreSQL 16       │←──│  Tailwind    │
 │  · tails by byte offset                │   │  · trigger-maintained│   │  zero deps   │
 │  · batches, at-least-once              │   │    aggregates        │   │  beyond React│
 │  · dead-letters what the API rejects   │   │  · GeoIP / ASN       │   └──────────────┘
 └────────────────────────────────────────┘   └──────────────────────┘
```

**The forwarder** ([`forwarder/forwarder.py`](forwarder/forwarder.py)) has zero third-party dependencies — standard library only, because a dependency tree on an unattended Pi is a liability. It persists its byte offset *only after* a successful POST, so backend downtime delays events instead of losing them. Batches the API permanently rejects are parked in a dead-letter file rather than retried forever.

**The backend** ([`backend/`](backend/)) is Express 5 over PostgreSQL 16. Every aggregate the dashboard reads — per-country, per-ASN, per-credential, per-command — is maintained by database triggers as events land, not recomputed per request. Counting distinct IPs is the awkward case: you cannot keep `COUNT(DISTINCT …)` as a running total, so each aggregate has a companion `(key, ip)` pair table and the counter increments only when an `INSERT … ON CONFLICT DO NOTHING` actually inserted.

**The frontend** ([`frontend/`](frontend/)) is React 19 + Vite + Tailwind, with **no runtime dependencies beyond React itself**. The charts, the ASCII network topology, and the attack replay are all hand-rolled.

## The interesting parts

**Attack replay.** *Anatomy of an attack* replays a captured session at the pace it actually happened — typically a dozen-odd commands inside a minute — so you watch a botnet work in real time instead of reading a table. Each command is mapped to its [MITRE ATT&CK](https://attack.mitre.org/) technique.

**Command templatization.** Attackers randomise the fields that identify them: the dropped binary's name, the temp file, the generated password. One campaign becomes thousands of "unique" commands. A shared normalizer collapses those fields into typed placeholders — `scp -t /tmp/V62vtXQH` and `scp -t /tmp/Kp9zWm42` are one template, not two.

The hard part is knowing what *not* to collapse. A fixed password is a fingerprint, not noise: `modzmodz` identifies a specific loader, and tokenising it would silently merge two distinct actors into one row with nothing left to notice it by. So every substitution is gated on a randomness test, and the first credential field is always preserved. Result: **4,025 raw commands → 2,377 templates**, with 58 templates absorbing 1,706 rows — 29:1 inside the randomising families — and no over-merges. The [unit tests](backend/test/normalize.test.js) use real captured commands as fixtures, including the over-merge cases.

**k-anonymous password lookup.** Check whether a password has been tried against the honeypot without sending it anywhere: the client sends a 3-character hash prefix and the server returns the whole bucket, [HIBP](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange)-style. The server never learns which one you asked about.

**Indicator export.** Every IP, payload URL, command and malware hash is exportable as JSON, CSV or plain text, with a provenance header — and optionally *defanged* (`hxxp://1.2.3[.]4`) so the list is safe to paste into a ticket. Defanging reaches inside command text, not just URL fields.

**Malware enrichment.** Captured binaries are SHA-256 fingerprinted and enriched against VirusTotal by a scheduled workflow.

## Engineering practices

This is where most of the work actually went.

- **CI gates production.** 117 integration assertions run against a real PostgreSQL 16 — schema, migrations, seed data, then every endpoint asserted for *content*, not just a 200. Deploy is `workflow_call`-gated on it. Plus 209 unit tests (83 backend, 114 frontend, 12 forwarder).
- **`tools/ci-local.sh`** runs that exact suite against a throwaway container in about a minute. It *extracts* the assertions from the CI workflow rather than duplicating them, so there is one set of checks and it is the set CI runs.
- **Migrations are apply-once and checksummed.** A ledger records version, checksum and timestamp; an edited migration that has already been applied is an error, not a surprise. Every migration is idempotent and re-runnable, and CI proves it by force-replaying all of them on every push.
- **Schema changes run against live data.** 8M rows, no maintenance window. Backfills are batched, restartable, and separated from the trigger that owns new rows by an explicit ID cutoff — captured under a lock so no row can land on both sides of the boundary, or neither.
- **Failure is assumed.** A health endpoint reports ingest staleness and clock skew; a watchdog workflow alerts when events stop arriving; the deploy rolls the code back automatically if the backend does not come up.

## What broke, and what changed

Every one of these is a real incident on this system, and each one is why some piece of the paragraph above exists.

**A four-day silent stop.** Ingestion halted and nothing noticed. Both Pi services reported `active`, the deploy was green, the API answered every request, the dashboard loaded. The only symptom was data that wasn't getting newer. Cause: Cloudflare's Browser Integrity Check started 403ing `Python-urllib/3.x`. → The forwarder identifies itself honestly, `/health` reports ingest freshness, and a watchdog workflow now fails loudly.

**Twelve hours down from one long command.** An attacker sent a 4,792-byte command. The leaderboard table was keyed on the command *text*, and a PostgreSQL btree index entry stops at ~2,704 bytes. The insert failed, which rolled back the entire batch — the raw events with it — and the forwarder retried the same poisoned batch every 60 seconds forever, because a 500 was not one of the statuses it parks. → Re-keyed on `sha256(command)` so length no longer decides what gets recorded. Recovering the history showed the old ceiling had been silently dropping **44 of the 45** commands over 2,000 bytes — including 33 loader lines carrying C2 addresses, the single most valuable thing in the dataset.

**Counters maintained by nothing.** Two columns on the command leaderboard were written by a one-off backfill and then never again: not by the ingest path, not by any trigger, not by a cron. They had been frozen for months. `unique_ips` was **69× low** — 42,919 against 2,948,377 actual distinct pairs. Anything ranked on a hits-per-IP ratio had been wrong by two orders of magnitude. → Trigger-maintained now, with the rebuild proven on a clean-room database before it touched production.

**A green deploy over a failed migration.** The deploy loop ended in `|| echo "(skipped/failed)"`. A migration aborted partway through, the deploy reported success, and an endpoint served an empty table for days. → Migrations now fail the deploy, and the working tree is restored to the previously-deployed revision so the schema and the running code never silently disagree.

## Repo layout

| Path | |
|---|---|
| [`forwarder/`](forwarder/) | Python log shipper for the Pi, plus systemd units and dead-letter replay |
| [`backend/`](backend/) | Express 5 API — [`routes/`](backend/routes/) public + ingest, [`lib/`](backend/lib/) normalizer, MITRE mapping, URL handling |
| [`db/`](db/) | Schema, [migrations](db/migrations/), batched [backfills](db/backfill/), CI seed data — [see `db/README.md`](db/README.md) |
| [`frontend/`](frontend/) | React 19 dashboard |
| [`.github/workflows/`](.github/workflows/) | CI, deploy, ingest watchdog, VirusTotal enrichment, Pi diagnostics & replay |
| [`tools/`](tools/) | Local CI runner, VirusTotal enrichment script |

## Public API

No key, no auth, rate-limited. `https://hunajapannu.fi/api/public/cowrie/…`

```sh
curl 'https://hunajapannu.fi/api/public/cowrie/summary'
curl 'https://hunajapannu.fi/api/public/cowrie/top-asn?limit=10'
curl 'https://hunajapannu.fi/api/public/cowrie/iocs?type=ips&hours=24&format=txt&defang=1'
```

`summary` · `latest` · `events-per-hour` · `commands` · `creds` · `files` · `top-asn` · `top-countries` · `ip-stats` · `mitre` · `payload-hosts` · `sessions/featured` · `iocs` · `passwords/range/:prefix`

## Running it locally

```sh
tools/ci-local.sh                      # full suite vs a throwaway Postgres 16 — ~1 min
cd backend  && npm ci && npm test      # 83 unit tests
cd frontend && npm ci && npm run dev   # dashboard on :5173
```

No local `psql` needed — `ci-local.sh` shims it through the container.

---

<div align="center">

Built by **[Oskari Kosonen](https://www.linkedin.com/in/oskari-kosonen-ba2589294/)** · [hunajapannu.fi](https://hunajapannu.fi)

*hunajapannu* — Finnish for *honeypot*.

</div>
