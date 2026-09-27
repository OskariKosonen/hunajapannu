# hunajapannu.fi

An SSH honeypot on a Raspberry Pi at home, and the platform that keeps it running.

**[hunajapannu.fi](https://hunajapannu.fi)** · live and unattended since 24 November 2025 · **306 days** and counting

![Dashboard](docs/dashboard.png)

A [Cowrie](https://github.com/cowrie/cowrie) honeypot pretends to be a badly-secured Linux server. Botnets log in, run their scripts and drop malware. Everything is captured, enriched and published through a public API.

**8,065,527** attacks · **29,333** unique IPs · **169** countries · **3,457** networks  
**308** malware samples · **223,282** credential pairs · **4,041** distinct commands · **~11k** events/day

## How it runs

```
Raspberry Pi (home broadband)          VPS                        Cloudflare
┌──────────────────────────┐   ┌────────────────────────┐
│ Cowrie          :22/:2222│   │ nginx → Express 5 :3001│
│   ↓ cowrie.json          │   │           ↕            │ ──→  hunajapannu.fi
│ forwarder.py ──HTTPS+Bearer──→ PostgreSQL 16          │
│   systemd, Restart=always│   │ pm2, GeoIP, VirusTotal │
└──────────────────────────┘   └────────────────────────┘
```

**Delivery is at-least-once and survives outages.** `forwarder.py` tails Cowrie's JSON log by byte offset and persists that offset *only after* a successful POST, so backend downtime delays events instead of dropping them. Batches the API rejects permanently are parked in a dead-letter file with a separate replay unit, rather than retried forever.

**The forwarder runs locked down.** Dedicated user, `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, read-only access to the Cowrie log and write access to exactly one state directory. See [`cowrie-forwarder.service`](forwarder/cowrie-forwarder.service).

**Deploys are gated and reversible.** Push to `main` runs 131 integration assertions against a real PostgreSQL 16 on a hosted runner. Only if those pass does the self-hosted runner apply migrations, restart the API and rsync the frontend. If the backend fails its health check, the deploy rolls the code back automatically and says so. Migrations are apply-once and checksummed: editing one that has already run aborts the deploy.

**Monitoring is about staleness, not liveness.** `/health` reports the age of the newest event and clock skew between the sensor and the server, because the failure that actually happens is a service that is `active` and answering while no data arrives. A scheduled workflow polls it and fails loudly.

Seven workflows cover CI, deploy, the ingest watchdog, VirusTotal enrichment and read-only remote diagnostics: [`.github/workflows/`](.github/workflows/).

## Things that broke, and what changed

Every entry is a real incident on this system. Each one is why some safeguard above exists.

**Four days of silent failure.** Ingestion stopped and nothing noticed: both Pi services reported `active`, the deploy was green, the API answered, the dashboard loaded. Cloudflare had begun returning 403 to the default `Python-urllib/3.x` User-Agent. Fixed at the HTTP layer, then made detectable — this is why `/health` reports data age and a watchdog polls it.

**Twelve hours down from one long command.** An attacker sent 4,792 bytes. The leaderboard table was keyed on the command text, a PostgreSQL btree entry stops at about 2,704 bytes, so the insert failed, rolled back the entire batch including the raw events, and the forwarder retried the same poisoned batch every 60 seconds. Re-keyed on `sha256(command)`. Recovering the history showed the old limit had silently dropped 44 of the 45 commands over 2,000 bytes, 33 of them loader lines carrying C2 addresses.

**A green deploy over a failed migration.** The deploy loop ended in `|| echo "(skipped/failed)"`. A migration aborted, the deploy reported success, and an endpoint served an empty table for days. Migrations now fail the deploy and restore the working tree to the running revision.

**Counters maintained by nothing.** Two columns were written once by a backfill and never again. `unique_ips` was 69x low, 42,919 against 2,948,377 actual pairs, so anything ranked on a hits-per-IP ratio was wrong by two orders of magnitude. Now trigger-maintained, with the rebuild proven on a scratch database first.

**A migration that filled the disk.** Classifying 1.6M rows inside a migration took PostgreSQL down at 100% disk. Batching kept locks short, which was the wrong thing to optimise: every UPDATE writes a new row version, so the table grows by its own size regardless of how the transactions are split. The column also sat in two partial index predicates, which blocks HOT updates and made each row rewrite entries in all six indexes. Dropping those two 184 kB indexes for the duration took the cost from 176 MB per 75k rows to zero.

## What the data shows

**Command templatization.** Attackers randomise binary names, temp files and generated passwords, so one campaign looks like thousands of distinct commands. A normalizer collapses those fields: 4,041 raw commands become 2,389 templates. What it refuses to collapse matters more — `modzmodz` is a hardcoded password identifying one specific loader, so tokenising it would merge two actors into one row with nothing to flag it. Every substitution is gated on a randomness test.

**A Panchan P2P botnet peer map.** The honeypot captured a Go SSH worm being handed its bootstrap peer list, 51 addresses at a time. Ten months of those lists give **1,927 distinct peers**, against 209 and 96 in the two published enumerations, which were point-in-time crawls. The peer geography is 5.3x weighted to Japan relative to the general attacker population, independently matching Akamai's attribution of the operator.

**Indicator export and a password check.** IPs, URLs, commands and hashes as JSON, CSV or text, optionally defanged for pasting into a ticket. Passwords can be tested against the corpus without being sent: the client submits a 3-character hash prefix and receives the whole bucket, [HIBP](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange)-style.

## Testing

131 CI assertions against a real PostgreSQL 16, checking response content rather than status codes, plus 98 backend, 114 frontend and 12 forwarder unit tests. [`tools/ci-local.sh`](tools/ci-local.sh) runs the same suite against a throwaway container in about a minute; it extracts the assertions from the CI workflow rather than duplicating them.

## Layout

| | |
|---|---|
| [`forwarder/`](forwarder/) | Python log shipper, systemd units, dead-letter replay. No third-party dependencies. |
| [`backend/`](backend/) | Express 5 API over PostgreSQL 16. Aggregates maintained by database triggers. |
| [`db/`](db/) | Schema, [migrations](db/migrations/), batched [backfills](db/backfill/) — [notes](db/README.md) |
| [`frontend/`](frontend/) | React 19 + Vite. No runtime dependencies beyond React. |
| [`.github/workflows/`](.github/workflows/) | CI, deploy, watchdog, enrichment, diagnostics — [notes](.github/workflows/README.md) |

## API

No key, rate-limited.

```sh
curl 'https://hunajapannu.fi/api/public/cowrie/summary'
curl 'https://hunajapannu.fi/api/public/cowrie/iocs?type=ips&hours=24&format=txt&defang=1'
```

`summary` `latest` `events-per-hour` `commands` `creds` `files` `top-asn` `top-countries` `ip-stats` `mitre` `payload-hosts` `sessions/featured` `iocs` `passwords/range/:prefix`

## Running it

```sh
tools/ci-local.sh                      # full suite against a throwaway Postgres
cd backend  && npm ci && npm test
cd frontend && npm ci && npm run dev
```

---

Built by [Oskari Kosonen](https://www.linkedin.com/in/oskari-kosonen-ba2589294/). MIT licensed. *hunajapannu* is Finnish for honeypot.
