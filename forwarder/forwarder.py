#!/usr/bin/env python3
"""Cowrie -> backend forwarder. Tails cowrie.json, maps events to the ingestion
API schema, batches, and POSTs over HTTPS with a bearer token. The byte offset
is persisted only after a successful POST, so backend downtime never drops
events (keep log-rotation retention longer than your worst-case outage).
Delivery is at-least-once. Zero third-party deps."""
import json, os, sys, time, urllib.request, urllib.error

LOG_PATH   = os.environ.get("COWRIE_LOG", "/home/cowrie/var/log/cowrie/cowrie.json")
STATE_PATH = os.environ.get("FWD_STATE", "/var/lib/cowrie-forwarder/state.json")
BASE_URL   = os.environ["FWD_BASE_URL"].rstrip("/")
TOKEN      = os.environ["FWD_TOKEN"]
BATCH_MAX  = int(os.environ.get("FWD_BATCH_MAX", "100"))
FLUSH_SECS = float(os.environ.get("FWD_FLUSH_SECS", "5"))
DECOY_PORT = int(os.environ.get("FWD_DECOY_PORT", "22"))
EVENTS_URL = f"{BASE_URL}/api/cowrie/events"
FILES_URL  = f"{BASE_URL}/api/cowrie/files"

def load_state():
    try:
        with open(STATE_PATH) as f: return json.load(f)
    except (FileNotFoundError, ValueError): return {"inode": None, "offset": 0}

def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f: json.dump(state, f)
    os.replace(tmp, STATE_PATH)

def map_event(ev):
    eid = ev.get("eventid"); ts, ip, sess = ev.get("timestamp"), ev.get("src_ip"), ev.get("session")
    if eid in ("cowrie.login.success", "cowrie.login.failed"):
        return "event", {"timestamp": ts, "src_ip": ip, "session_id": sess, "dest_port": DECOY_PORT,
                         "username": ev.get("username"), "password": ev.get("password")}
    if eid == "cowrie.command.input":
        return "event", {"timestamp": ts, "src_ip": ip, "session_id": sess, "dest_port": DECOY_PORT,
                         "command": ev.get("input")}
    if eid == "cowrie.session.connect":
        return "event", {"timestamp": ts, "src_ip": ip, "session_id": sess, "dest_port": DECOY_PORT}
    if eid in ("cowrie.session.file_download", "cowrie.session.file_upload"):
        return "file", {"timestamp": ts, "sha256": ev.get("shasum"), "size_bytes": ev.get("size"),
                        "full_path": ev.get("destfile") or ev.get("outfile") or ev.get("filename")}
    return None, None

def dead_letter(key, rows, code):
    """Park a batch the backend permanently rejects (4xx) instead of retrying it
    forever — one poison batch must not stall the whole pipeline. Parked rows
    live next to the state file for manual replay."""
    path = os.path.join(os.path.dirname(STATE_PATH), "deadletter.jsonl")
    try:
        with open(path, "a") as f:
            f.write(json.dumps({"ts": time.time(), "status": code, "key": key, "rows": rows}) + "\n")
        sys.stderr.write(f"parked {len(rows)} {key} rows in {path} (HTTP {code})\n")
    except OSError as e:
        sys.stderr.write(f"failed to dead-letter {len(rows)} {key} rows: {e}\n")

def post_batch(url, key, rows):
    if not rows: return
    data = json.dumps({key: rows}).encode(); backoff = 1
    while True:
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {TOKEN}"); req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200: return
                sys.stderr.write(f"POST {url} -> {resp.status}\n")
        except urllib.error.HTTPError as e:
            sys.stderr.write(f"POST {url} -> {e.code}: {e.read()[:200]!r}\n")
            # Park only payload-level rejections, which retrying can never fix.
            # 401/403 (token rotated or misconfigured), 408 and 429 stay in the
            # retry loop — those are operator-fixable, and silently discarding
            # honeypot data over a typo'd token would be worse than stalling.
            if e.code in (400, 413, 422):
                dead_letter(key, rows, e.code); return
        except urllib.error.URLError as e:
            sys.stderr.write(f"POST {url} failed: {e}\n")
        time.sleep(backoff); backoff = min(backoff * 2, 60)

def flush(events, files):
    post_batch(EVENTS_URL, "events", events); post_batch(FILES_URL, "files", files)

def run():
    state = load_state(); events, files = [], []; last_flush = time.time()
    while True:
        try: st = os.stat(LOG_PATH)
        except FileNotFoundError: time.sleep(1); continue
        if state["inode"] != st.st_ino or st.st_size < state["offset"]:
            state = {"inode": st.st_ino, "offset": 0}
        with open(LOG_PATH, "r") as f:
            f.seek(state["offset"])
            while True:
                line = f.readline()
                if not line: break
                if not line.endswith("\n"): break
                state["offset"] = f.tell(); s = line.strip()
                if not s: continue
                try: ev = json.loads(s)
                except ValueError: continue
                kind, row = map_event(ev)
                if kind == "event": events.append(row)
                elif kind == "file": files.append(row)
                if len(events) + len(files) >= BATCH_MAX:
                    flush(events, files); events, files = [], []; save_state(state); last_flush = time.time()
        if (events or files) and (time.time() - last_flush >= FLUSH_SECS):
            flush(events, files); events, files = [], []; save_state(state); last_flush = time.time()
        time.sleep(1)

if __name__ == "__main__":
    run()
