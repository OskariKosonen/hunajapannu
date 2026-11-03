#!/usr/bin/env python3
"""Cowrie -> backend forwarder. Tails cowrie.json, maps events to the ingestion
API schema, batches, and POSTs over HTTPS with a bearer token. The byte offset
is persisted only after a successful POST, so backend downtime never drops
events (keep log-rotation retention longer than your worst-case outage).
Delivery is at-least-once. Zero third-party deps."""
import datetime
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request

LOG_PATH   = os.environ.get("COWRIE_LOG", "/home/cowrie/var/log/cowrie/cowrie.json")
STATE_PATH = os.environ.get("FWD_STATE", "/var/lib/cowrie-forwarder/state.json")
BASE_URL   = os.environ["FWD_BASE_URL"].rstrip("/")
TOKEN      = os.environ["FWD_TOKEN"]
BATCH_MAX  = int(os.environ.get("FWD_BATCH_MAX", "100"))
FLUSH_SECS = float(os.environ.get("FWD_FLUSH_SECS", "5"))
DECOY_PORT = int(os.environ.get("FWD_DECOY_PORT", "22"))
EVENTS_URL = f"{BASE_URL}/api/cowrie/events"
FILES_URL  = f"{BASE_URL}/api/cowrie/files"
# Cloudflare's Browser Integrity Check 403s the default "Python-urllib/x.y"
# signature with error 1010 — that silently cut ingestion off on 2026-08-11.
# Any other UA passes; identify ourselves honestly.
USER_AGENT = "cowrie-forwarder/1.0"

def load_state():
    try:
        with open(STATE_PATH) as f: return json.load(f)
    except (FileNotFoundError, ValueError): return {"inode": None, "offset": 0}

def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f: json.dump(state, f)
    os.replace(tmp, STATE_PATH)

# Cowrie formats its timestamps from the machine's local wall clock but suffixes
# them with "Z", so on a Pi set to Europe/London every event was recorded an
# hour ahead of reality for the whole of BST — proven by comparing this
# forwarder's own clock against the label on an event it was posting at the
# time. Set FWD_COWRIE_TZ=local to reinterpret those naive wall-clock readings
# in the machine's timezone and emit real UTC. Leave it unset (or "utc") if
# Cowrie is ever fixed to emit genuine UTC, otherwise the correction would be
# applied twice.
COWRIE_TZ = os.environ.get("FWD_COWRIE_TZ", "utc").strip().lower()

def _parse_naive(s):
    body = s[:-1] if s[-1:] in ("Z", "z") else s
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.datetime.strptime(body, fmt)
        except ValueError:
            pass
    return None

def normalize_ts(s):
    if not s or COWRIE_TZ != "local":
        return s
    naive = _parse_naive(s)
    if naive is None:
        return s  # unrecognised shape: pass through rather than mangle it
    # astimezone() on a naive datetime reads it as local time using the offset
    # in force on that date, so GMT readings pass through unchanged and only
    # BST ones shift. That keeps winter data correct without a special case.
    return naive.astimezone(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def map_event(ev):
    # "" rather than None: a log line without an eventid must not turn a
    # string comparison into an AttributeError. map_event is called from the
    # tail loop without a try, so one malformed line would kill ingestion.
    eid = ev.get("eventid") or ""
    ts, ip, sess = normalize_ts(ev.get("timestamp")), ev.get("src_ip"), ev.get("session")
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
    # Client identity. Cowrie already computes both of these and we were
    # throwing them away here, which cost us the only campaign-linkage signal
    # SSH offers: HASSH fingerprints the client *software*, so two addresses in
    # two countries sharing one HASSH are one tool. Source IPs rotate freely;
    # the algorithms a client offers do not.
    #
    # The two arrive as separate log lines for the same session, in either
    # order, so both are sent as kind="client" and the backend COALESCEs them
    # onto one row keyed by session.
    if eid == "cowrie.client.version":
        return "event", {"kind": "client", "timestamp": ts, "src_ip": ip, "session_id": sess,
                         "client_version": ev.get("version")}
    if eid == "cowrie.client.kex":
        return "event", {"kind": "client", "timestamp": ts, "src_ip": ip, "session_id": sess,
                         "hassh": ev.get("hassh")}
    # The attacker using the honeypot as a TCP relay to reach somebody else —
    # a different abuse class from dropping a payload, and invisible to command
    # analysis because no command is ever typed. The destination is the finding.
    # Only .request, never .direct-tcpip.data: Cowrie emits one data event per
    # relayed chunk, which would flood the batcher with no analytic value.
    if eid == "cowrie.direct-tcpip.request":
        dst = ev.get("dst_ip")
        if not dst:
            return None, None
        return "event", {"kind": "tunnel", "timestamp": ts, "src_ip": ip, "session_id": sess,
                         "dst_host": dst, "dst_port": ev.get("dst_port")}
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
        req.add_header("User-Agent", USER_AGENT)
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
        except (OSError, http.client.HTTPException) as e:
            # URLError covers a refused connection, but a server that accepts
            # the connection and then stalls past the timeout raises a bare
            # TimeoutError from the socket read, and a dropped keep-alive a
            # RemoteDisconnected. Neither is a URLError. Both used to escape
            # this loop and kill the process: 28 crash-restarts while the
            # database was down from 2026-10-22, and each restart that landed
            # after a log rotation skipped ahead (see drain_rotated).
            sys.stderr.write(f"POST {url} failed: {e!r}\n")
        time.sleep(backoff); backoff = min(backoff * 2, 60)

def flush(events, files):
    post_batch(EVENTS_URL, "events", events); post_batch(FILES_URL, "files", files)

def drain_deadletter():
    """Push any parked batches before tailing. Bounded (replay_deadletter caps
    attempts per batch and re-parks what still fails) and never fatal — a
    backlog must not stop us collecting new events."""
    path = os.path.join(os.path.dirname(STATE_PATH), "deadletter.jsonl")
    if not os.path.exists(path): return
    try:
        import replay_deadletter
        replay_deadletter.main()
    except Exception as e:
        sys.stderr.write(f"dead-letter drain failed, continuing: {e}\n")

def rotated_logs():
    """Every rotated copy of LOG_PATH, oldest first. Cowrie names them
    cowrie.json.YYYY-MM-DD, so name order is date order."""
    d = os.path.dirname(LOG_PATH) or "."; base = os.path.basename(LOG_PATH)
    try: names = os.listdir(d)
    except OSError: return []
    return [os.path.join(d, n) for n in sorted(names) if n.startswith(base + ".")]

def find_rotated(inode):
    """Locate the rotated file that used to be LOG_PATH, by inode. Cowrie
    rotates cowrie.json -> cowrie.json.YYYY-MM-DD, keeping the same inode."""
    for p in rotated_logs():
        try:
            if os.stat(p).st_ino == inode: return p
        except OSError: continue
    return None

def drain_rotated(path, offset):
    """Forward whatever is left in a file that has since been rotated away.
    Without this the unread tail is lost at every rotation — that is how
    2026-08-12..14 went missing while the forwarder sat blocked on a POST.

    Progress is saved against the rotated file's own inode after every
    delivered batch, so a restart mid-drain resumes here (find_rotated locates
    it again) instead of re-sending the file or skipping it.

    Only opening and reading the file is guarded. The guard used to wrap the
    POSTs as well, and TimeoutError is an OSError: on 2026-11-02 a timed-out
    POST was reported as "could not drain rotated cowrie.json.2026-10-30" and
    that file's tail, plus every day rotated after it, was silently dropped.
    post_batch retries until delivery, so a slow backend now blocks here,
    which is what at-least-once requires."""
    try:
        f = open(path); ino = os.fstat(f.fileno()).st_ino
    except OSError as e:
        sys.stderr.write(f"could not open rotated {path}, its unread events are lost: {e}\n"); return
    events, files = [], []
    with f:
        f.seek(offset)
        while True:
            try: line = f.readline()
            except OSError as e:
                sys.stderr.write(f"could not read rotated {path} at {f.tell()}: {e}\n"); return
            if not line or not line.endswith("\n"): break
            s = line.strip()
            if not s: continue
            try: ev = json.loads(s)
            except ValueError: continue
            kind, row = map_event(ev)
            if kind == "event": events.append(row)
            elif kind == "file": files.append(row)
            if len(events) + len(files) >= BATCH_MAX:
                flush(events, files); events, files = [], []
                save_state({"inode": ino, "offset": f.tell()})
        flush(events, files)
        save_state({"inode": ino, "offset": f.tell()})
    sys.stderr.write(f"drained rotated log {path} from offset {offset}\n")

def catch_up(state):
    """Forward everything rotated away since `state` was saved: the rest of the
    file it points at, then every newer rotated file in full.

    A long outage spans several rotations. Draining only the file the offset
    was in skipped the days in between — after the 2026-10-22 database outage
    that would have been ten days of captures."""
    old = find_rotated(state["inode"])
    if old is None:
        sys.stderr.write(f"rotated log with inode {state['inode']} is gone; "
                         f"events after offset {state['offset']} in it are lost\n")
        return
    drain_rotated(old, state["offset"])
    for p in rotated_logs():
        if p > old: drain_rotated(p, 0)

def run():
    drain_deadletter()
    state = load_state(); events, files = [], []; last_flush = time.time()
    while True:
        try: st = os.stat(LOG_PATH)
        except FileNotFoundError: time.sleep(1); continue
        if state["inode"] != st.st_ino or st.st_size < state["offset"]:
            # Finish the rotated-away file before following the new one.
            if state["inode"] is not None and state["inode"] != st.st_ino:
                catch_up(state)
            state = {"inode": st.st_ino, "offset": 0}
            save_state(state)
        with open(LOG_PATH) as f:
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
