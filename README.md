# hunajapannu.fi

An SSH honeypot on a Raspberry Pi in Finland, and the threat-intel platform around it.

**[hunajapannu.fi](https://hunajapannu.fi)** · live since November 2025 · 8M attacks, 28,930 IPs, 168 countries

![Dashboard](docs/dashboard.png)

## What it does

A [Cowrie](https://github.com/cowrie/cowrie) honeypot pretends to be a badly-secured server. Botnets log in (`admin:admin123` is the most-tried pair), run their scripts and drop malware. All of it gets captured, enriched and published, at around 15,000 attacks a day.

| | |
|---|---|
| 8,031,815 attacks | 28,930 unique IPs |
| 168 countries, 3,414 networks | 223,063 credential pairs |
| 302 malware samples | 4,020 distinct commands |

## Stack

```
Raspberry Pi                    VPS                      Browser
Cowrie → forwarder.py  ──TLS──→ Express 5 + Postgres 16 → React 19 + Vite
```

**forwarder.py** uses the stdlib only. It saves its file offset after a successful POST, never before, so backend downtime delays events instead of losing them. Batches the API permanently rejects go to a dead-letter file.

**Backend** aggregates are maintained by database triggers as events land, not recomputed per request.

**Frontend** has no runtime deps beyond React. Charts, ASCII topology and attack replay are hand-rolled.

## Worth a look

**Attack replay.** A captured session plays back at its original pace, each command mapped to its [MITRE ATT&CK](https://attack.mitre.org/) technique.

**Command templatization.** Attackers randomise binary names, temp files and generated passwords, so one campaign looks like thousands of unique commands. A normalizer collapses those fields: 4,020 raw commands become 2,372 templates.

What it refuses to collapse matters more. `modzmodz` is a hardcoded password identifying one specific loader, so tokenising it would merge two actors into one row with nothing to flag it. Every substitution is gated on a randomness test, and the first credential field always survives.

**Indicator export.** IPs, URLs, commands and hashes as JSON/CSV/txt, optionally defanged (`hxxp://1.2.3[.]4`) for pasting into a ticket.

**Password check.** Test a password against the corpus without sending it. The client sends a 3-character hash prefix and gets the whole bucket back, [HIBP](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange)-style.

## Things that broke

Each of these is a real incident, and each one is why some safeguard exists.

**Four days of silence.** Ingestion stopped and nothing noticed: both Pi services showed `active`, the deploy was green, the API answered, the dashboard loaded. Cloudflare had started 403ing `Python-urllib/3.x`. Now `/health` reports ingest freshness and a watchdog fails loudly.

**One long command, twelve hours down.** An attacker sent 4,792 bytes. The leaderboard was keyed on command text, a btree entry stops at ~2,704 bytes, so the insert failed and rolled back the whole batch including the raw events, which the forwarder then retried every 60 seconds forever. Re-keying on `sha256(command)` revealed the old limit had been quietly dropping 44 of the 45 commands over 2,000 bytes, 33 of them loader lines carrying C2 addresses.

**Counters maintained by nothing.** Two columns were written once by a backfill and never again. `unique_ips` was 69x low, 42,919 against 2,948,377 actual pairs, so anything ranked on a hits-per-IP ratio was wrong by two orders of magnitude.

**A green deploy over a failed migration.** The deploy loop ended in `|| echo "(skipped/failed)"`. A migration aborted, the deploy reported success, an endpoint served an empty table for days.

**A migration that filled the disk.** Classifying 1.6M rows inside a migration took Postgres down. Batching kept locks short, which was the wrong thing to optimise: every UPDATE writes a new row version, so the table grows by its own size however you split the transactions. `record_class` also sat in two partial index predicates, which blocks HOT updates and made each row rewrite entries in all six indexes. Dropping those two 184 KB indexes for the run took the cost from 176 MB per 75k rows to zero.

## Engineering

- 117 CI assertions against a real Postgres 16, checking content rather than status codes. Deploy is gated on them. Plus 209 unit tests.
- `tools/ci-local.sh` runs that same suite against a throwaway container in about a minute. It extracts the assertions from the CI workflow rather than copying them.
- Migrations are apply-once and checksummed. Editing an applied one is an error. CI force-replays all of them every push to prove they stay idempotent.
- Schema changes run against 8M live rows with no maintenance window. Backfills are batched, restartable, and separated from the trigger that owns new rows by an explicit ID cutoff.

## Layout

| | |
|---|---|
| [`forwarder/`](forwarder/) | Python log shipper, systemd units, dead-letter replay |
| [`backend/`](backend/) | Express 5 API |
| [`db/`](db/) | Schema, [migrations](db/migrations/), [backfills](db/backfill/) — [details](db/README.md) |
| [`frontend/`](frontend/) | React dashboard |
| [`.github/workflows/`](.github/workflows/) | CI, deploy, watchdog, VirusTotal enrichment, Pi diagnostics |

## API

No key, rate-limited.

```sh
curl 'https://hunajapannu.fi/api/public/cowrie/summary'
curl 'https://hunajapannu.fi/api/public/cowrie/iocs?type=ips&hours=24&format=txt&defang=1'
```

`summary` `latest` `events-per-hour` `commands` `creds` `files` `top-asn` `top-countries` `ip-stats` `mitre` `payload-hosts` `sessions/featured` `iocs` `passwords/range/:prefix`

## Local

```sh
tools/ci-local.sh                      # full suite, throwaway Postgres
cd backend  && npm ci && npm test
cd frontend && npm ci && npm run dev
```

---

Built by [Oskari Kosonen](https://www.linkedin.com/in/oskari-kosonen-ba2589294/). MIT licensed. *hunajapannu* is Finnish for honeypot.
