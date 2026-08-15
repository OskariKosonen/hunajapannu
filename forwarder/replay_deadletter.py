#!/usr/bin/env python3
"""Replay batches parked in deadletter.jsonl back into the ingestion API.

Batches land there when the backend permanently rejects them (see
post_batch in forwarder.py). The 2026-08-11 outage parked four days of
events because Cloudflare 403'd the forwarder's default User-Agent, so
this exists to get that backlog in once the underlying cause is fixed.

Batches that still fail are written back to the dead-letter file, so
re-running is safe; the file is only removed once everything lands.
Delivery is at-least-once, same as the forwarder — the backend has no
content dedupe, so only replay batches that never got through.
"""
import json, os, sys, time, urllib.request, urllib.error

STATE_DIR = os.path.dirname(os.environ.get("FWD_STATE", "/var/lib/cowrie-forwarder/state.json"))
DL_PATH   = os.environ.get("FWD_DEADLETTER", os.path.join(STATE_DIR, "deadletter.jsonl"))
BASE_URL  = os.environ["FWD_BASE_URL"].rstrip("/")
TOKEN     = os.environ["FWD_TOKEN"]
USER_AGENT = "cowrie-forwarder/1.0"
URLS = {"events": f"{BASE_URL}/api/cowrie/events", "files": f"{BASE_URL}/api/cowrie/files"}
MAX_ATTEMPTS = 5

def post(url, key, rows):
    """One batch. Returns True on delivery, False if it should stay parked."""
    data = json.dumps({key: rows}).encode(); backoff = 1
    for attempt in range(MAX_ATTEMPTS):
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {TOKEN}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", USER_AGENT)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status == 200: return True
                sys.stderr.write(f"  -> {resp.status}\n")
        except urllib.error.HTTPError as e:
            sys.stderr.write(f"  -> {e.code}: {e.read()[:200]!r}\n")
            if e.code in (400, 413, 422): return False  # will never succeed
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            sys.stderr.write(f"  failed: {e}\n")
        if attempt < MAX_ATTEMPTS - 1:
            time.sleep(backoff); backoff = min(backoff * 2, 30)
    return False

def main():
    if not os.path.exists(DL_PATH):
        print(f"no dead-letter file at {DL_PATH}; nothing to replay"); return 0

    with open(DL_PATH) as f:
        lines = [ln for ln in f if ln.strip()]
    print(f"replaying {len(lines)} parked batches from {DL_PATH}")

    still_failed, sent_rows, sent_batches = [], 0, 0
    for i, ln in enumerate(lines, 1):
        try:
            rec = json.loads(ln)
        except ValueError:
            sys.stderr.write(f"batch {i}: unparseable, keeping\n"); still_failed.append(ln); continue
        key, rows = rec.get("key"), rec.get("rows") or []
        if key not in URLS or not rows:
            sys.stderr.write(f"batch {i}: bad record (key={key!r}), keeping\n"); still_failed.append(ln); continue
        if post(URLS[key], key, rows):
            sent_batches += 1; sent_rows += len(rows)
        else:
            still_failed.append(ln)
        if i % 100 == 0:
            print(f"  {i}/{len(lines)} batches processed ({sent_rows} rows delivered)")

    print(f"delivered {sent_rows} rows in {sent_batches} batches; {len(still_failed)} batches still parked")

    if still_failed:
        tmp = DL_PATH + ".tmp"
        with open(tmp, "w") as f: f.writelines(still_failed)
        os.replace(tmp, DL_PATH)
    else:
        os.replace(DL_PATH, DL_PATH + ".done")
        print(f"all batches delivered; archived to {DL_PATH}.done")
    return 0

if __name__ == "__main__":
    sys.exit(main())
