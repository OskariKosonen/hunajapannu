#!/usr/bin/env python3
"""Replay a window of Cowrie JSON logs through the ingest API.

For the gap a stalled forwarder leaves behind: the events are still in
Cowrie's rotated logs on the Pi, but the forwarder has moved past them. Reads
log lines on stdin (or from the files named), maps them with the forwarder's
own map_event so the rows are exactly what live ingestion would have sent,
keeps only events strictly inside (--after, --before), and posts them with the
forwarder's post_batch: same retries, same dead-lettering.

The window is what makes a replay safe. cowrie_events has no natural key, so
anything already stored would be inserted twice and every trigger-maintained
counter would double. Take --after from MAX(timestamp) as it stood before
ingestion resumed, and --before from the first event the live forwarder is
re-sending itself.

Timestamps must be interpreted the way the forwarder on the Pi interprets
them, so run with the Pi's TZ and FWD_COWRIE_TZ, e.g. from the VPS:

    ssh pi 'tar czf - -C backfill cowrie.json.2026-10-22 ...' \\
      | TZ=Europe/London FWD_COWRIE_TZ=local FWD_BASE_URL=http://localhost:3001 \\
        FWD_TOKEN=... FWD_STATE=/tmp/backfill/state.json \\
        python3 -I tools/backfill_cowrie.py --tar \\
          --after 2026-10-22T18:56:01.308Z --before 2026-11-02T00:00:00.000Z

Rows the API permanently rejects land in deadletter.jsonl next to FWD_STATE.
"""
import argparse
import json
import os
import sys
import tarfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "forwarder"))
import forwarder  # noqa: E402  (reads its configuration from the environment)


def lines_from(args):
    if args.tar:
        with tarfile.open(fileobj=sys.stdin.buffer, mode="r|*") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                sys.stderr.write(f"reading {member.name}\n")
                for raw in tar.extractfile(member):
                    yield raw.decode("utf-8", "replace")
    elif args.files:
        for path in args.files:
            sys.stderr.write(f"reading {path}\n")
            with open(path, encoding="utf-8", errors="replace") as f:
                yield from f
    else:
        yield from sys.stdin


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--after", required=True,
                    help="exclusive lower bound, ISO UTC as stored, e.g. 2026-10-22T18:56:01.308Z")
    ap.add_argument("--before", required=True, help="exclusive upper bound, same format")
    ap.add_argument("--tar", action="store_true", help="stdin is a tar stream of log files, in order")
    ap.add_argument("--dry-run", action="store_true", help="count what would be sent, send nothing")
    ap.add_argument("files", nargs="*")
    args = ap.parse_args(argv)

    # The mapped timestamps are fixed-width "YYYY-MM-DDTHH:MM:SS.mmmZ", so
    # string comparison is time comparison. Validate the bounds have that shape.
    for bound in (args.after, args.before):
        if len(bound) != 24 or not bound.endswith("Z"):
            ap.error(f"bound {bound!r} must look like 2026-10-22T18:56:01.308Z")

    events, files = [], []
    sent = {"event": 0, "file": 0}
    skipped = 0

    def flush():
        nonlocal events, files
        if not args.dry_run:
            forwarder.flush(events, files)
        events, files = [], []

    for line in lines_from(args):
        s = line.strip()
        if not s:
            continue
        try:
            ev = json.loads(s)
        except ValueError:
            continue
        kind, row = forwarder.map_event(ev)
        if kind is None:
            continue
        ts = row.get("timestamp") or ""
        if not (args.after < ts < args.before):
            skipped += 1
            continue
        (events if kind == "event" else files).append(row)
        sent[kind] += 1
        if len(events) + len(files) >= forwarder.BATCH_MAX:
            flush()
            if (sent["event"] + sent["file"]) % 10000 < forwarder.BATCH_MAX:
                sys.stderr.write(f"  {sent['event']} events, {sent['file']} files so far (last {ts})\n")
    flush()

    verb = "would send" if args.dry_run else "sent"
    print(f"{verb} {sent['event']} events and {sent['file']} files; {skipped} outside the window")
    return 0


if __name__ == "__main__":
    sys.exit(main())
