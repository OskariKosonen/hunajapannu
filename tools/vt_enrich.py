#!/usr/bin/env python3
"""
Enrich captured malware samples with VirusTotal verdicts.

Replaces a one-off script that lived only on the VPS at
/home/admin/apps/cowrie-api/vt_backfill_frontend_min. That script worked, but:

  * it was run by hand — no cron entry, no timer, nothing scheduled. Shell
    history shows `python vt_backfill_frontend_min` typed twenty-odd times.
    Enrichment stopped the day someone stopped typing it (2026-07-25), and by
    August every new sample was unenriched while the dashboard still showed a
    VirusTotal column.
  * it hardcoded the VirusTotal API key *and* the production Postgres password
    in the file body.
  * a hash VirusTotal has never seen (404) left vt_last_fetched NULL, so every
    subsequent run asked about it again, forever. At 4 requests/minute an
    accumulating set of permanent 404s eventually starves the budget.

This version takes all configuration from the environment, records 404s so
they are not retried, and stops after a bounded number of lookups so a
scheduled run has a predictable worst case.

Environment:
  VT_API_KEY   required. Without it the script exits 0 and does nothing, so a
               scheduled job on a host with no key is quiet rather than red.
  PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE
               standard libpq variables.
  VT_BATCH     max lookups this run (default 50)
  VT_RPM       requests per minute (default 4, the free-tier limit)
"""

import os
import re
import sys
import time
from datetime import datetime, timezone

import psycopg2
import requests

VT_URL = "https://www.virustotal.com/api/v3/files/{}"
SHA256_RE = re.compile(r"^[A-Fa-f0-9]{64}$")

API_KEY = os.environ.get("VT_API_KEY", "").strip()
BATCH = int(os.environ.get("VT_BATCH", "50"))
RPM = max(int(os.environ.get("VT_RPM", "4")), 1)
DELAY = 60.0 / RPM

DB = {
    "host": os.environ.get("PGHOST", "localhost"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname": os.environ.get("PGDATABASE", "cowrie_db"),
    "user": os.environ.get("PGUSER", "cowrie_user"),
    "password": os.environ.get("PGPASSWORD"),
}


def epoch_to_dt(value):
    if isinstance(value, (int, float)) and value > 0:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    return None


def vt_lookup(session, sha256):
    """Returns (record, status). record is None when VT has never seen the file."""
    resp = session.get(
        VT_URL.format(sha256),
        headers={"x-apikey": API_KEY},
        timeout=30,
    )

    if resp.status_code == 404:
        return None, 404
    if resp.status_code == 429:
        retry = resp.headers.get("Retry-After")
        return {"retry_after": int(retry) if retry and retry.isdigit() else 60}, 429
    if not resp.ok:
        return {"error": resp.status_code}, resp.status_code

    attrs = resp.json().get("data", {}).get("attributes", {})
    stats = attrs.get("last_analysis_stats", {})
    tags = attrs.get("tags")

    return {
        "malicious": stats.get("malicious"),
        "suspicious": stats.get("suspicious"),
        "harmless": stats.get("harmless"),
        "undetected": stats.get("undetected"),
        "timeout": stats.get("timeout"),
        "reputation": attrs.get("reputation"),
        "vt_type": attrs.get("type_description"),
        "vt_magic": attrs.get("magic"),
        "first_submission": epoch_to_dt(attrs.get("first_submission_date")),
        "last_analysis": epoch_to_dt(attrs.get("last_analysis_date")),
        "tags": tags[:25] if isinstance(tags, list) else None,
    }, 200


UPDATE_SQL = """
    UPDATE cowrie_files
       SET vt_last_fetched          = now(),
           vt_found                 = %(found)s,
           vt_malicious             = %(malicious)s,
           vt_suspicious            = %(suspicious)s,
           vt_harmless              = %(harmless)s,
           vt_undetected            = %(undetected)s,
           vt_timeout               = %(timeout)s,
           vt_reputation            = %(reputation)s,
           vt_type                  = %(vt_type)s,
           vt_magic                 = %(vt_magic)s,
           vt_first_submission_date = %(first_submission)s,
           vt_last_analysis_date    = %(last_analysis)s,
           vt_tags                  = %(tags)s
     WHERE sha256 = %(sha256)s
"""

NOT_FOUND_SQL = """
    UPDATE cowrie_files
       SET vt_last_fetched = now(),
           vt_found        = false
     WHERE sha256 = %(sha256)s
"""


def main():
    if not API_KEY:
        print("VT_API_KEY is not set — nothing to do.")
        return 0

    conn = psycopg2.connect(**DB)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            # Oldest first, so a backlog drains in the order samples arrived.
            # vt_last_fetched IS NULL is the only "needs work" signal, which is
            # why recording 404s matters: otherwise they queue forever.
            cur.execute(
                """
                SELECT sha256
                  FROM cowrie_files
                 WHERE sha256 ~ '^[A-Fa-f0-9]{64}$'
                   AND vt_last_fetched IS NULL
                 GROUP BY sha256
                 ORDER BY MIN(timestamp)
                 LIMIT %s
                """,
                (BATCH,),
            )
            hashes = [r[0] for r in cur.fetchall() if SHA256_RE.match(r[0] or "")]

        if not hashes:
            print("Nothing to enrich; every sample already has a VirusTotal verdict.")
            return 0

        print(f"Enriching {len(hashes)} sample(s) at {RPM}/min "
              f"(~{len(hashes) * DELAY / 60:.1f} min)")

        session = requests.Session()
        found = missing = failed = 0

        for i, sha256 in enumerate(hashes, 1):
            record, status = vt_lookup(session, sha256)

            if status == 429:
                wait = record.get("retry_after", 60)
                print(f"  rate limited, stopping early (would wait {wait}s)")
                break

            with conn.cursor() as cur:
                if status == 404:
                    cur.execute(NOT_FOUND_SQL, {"sha256": sha256})
                    missing += 1
                    print(f"  [{i}/{len(hashes)}] {sha256[:12]} not known to VT")
                elif status == 200:
                    cur.execute(UPDATE_SQL, {**record, "found": True, "sha256": sha256})
                    found += 1
                    print(f"  [{i}/{len(hashes)}] {sha256[:12]} "
                          f"{record.get('malicious')} malicious · {record.get('vt_type')}")
                else:
                    failed += 1
                    print(f"  [{i}/{len(hashes)}] {sha256[:12]} HTTP {status}, leaving for next run")
            conn.commit()

            if i < len(hashes):
                time.sleep(DELAY)

        print(f"Done: {found} enriched, {missing} unknown to VT, {failed} failed.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
