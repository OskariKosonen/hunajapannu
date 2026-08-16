-- Capture the SSH client identity and tunnel abuse the sensor was discarding.
--
-- The forwarder only ever mapped five Cowrie event types (login, command,
-- connect, file up/download) and dropped the rest on the Pi, so the most
-- identifying data the honeypot collects never reached the database at all:
--
--   cowrie.client.kex        -> HASSH, an MD5 over the key-exchange algorithms
--                               the client offers. It fingerprints the software,
--                               not the address. Two IPs in different countries
--                               with one HASSH are one tool; source addresses
--                               rotate, client stacks do not. This is the only
--                               campaign-linkage primitive available for SSH.
--   cowrie.client.version    -> the banner, e.g. SSH-2.0-libssh2_1.9.0 vs
--                               SSH-2.0-Go vs SSH-2.0-PuTTY. Separates botnet
--                               loaders from hands-on-keyboard operators.
--   cowrie.direct-tcpip.*    -> the attacker using the honeypot as a TCP relay
--                               to reach a third party. A different abuse class
--                               from dropping malware, invisible to command
--                               analysis, and the destination says what they
--                               wanted the box for.
--
-- These go in their own tables rather than as columns on cowrie_events on
-- purpose. Client identity is one fact per session, not an event, and tunnel
-- requests are their own kind of action; folding either into cowrie_events
-- would add rows and silently inflate the total event count that the whole
-- dashboard is built on.

-- One row per session. cowrie.client.version and cowrie.client.kex arrive as
-- two separate log lines for the same session, so ingest upserts and COALESCEs
-- rather than assuming either arrives first.
CREATE TABLE IF NOT EXISTS cowrie_client_fingerprints (
  session_id     text PRIMARY KEY,
  first_seen     timestamp with time zone NOT NULL,
  src_ip         inet,
  client_version text,
  hassh          text,
  country_iso    text,
  asn            integer,
  org            text
);

-- The linkage query is "which sessions share this client fingerprint", so the
-- index is on hassh. Partial: rows exist before the kex event lands.
CREATE INDEX IF NOT EXISTS idx_client_fp_hassh
  ON cowrie_client_fingerprints (hassh) WHERE hassh IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_fp_version
  ON cowrie_client_fingerprints (client_version) WHERE client_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_fp_first_seen
  ON cowrie_client_fingerprints (first_seen DESC);

-- Many per session, so this is an event stream rather than a per-session fact.
-- dst_host is text, not inet: direct-tcpip carries whatever the client asked
-- for, which may be a hostname.
CREATE TABLE IF NOT EXISTS cowrie_tunnel_requests (
  id          bigserial PRIMARY KEY,
  timestamp   timestamp with time zone NOT NULL,
  session_id  text,
  src_ip      inet,
  dst_host    text NOT NULL,
  dst_port    integer,
  country_iso text,
  asn         integer,
  org         text
);

CREATE INDEX IF NOT EXISTS idx_tunnel_dst
  ON cowrie_tunnel_requests (dst_host, dst_port);
CREATE INDEX IF NOT EXISTS idx_tunnel_timestamp
  ON cowrie_tunnel_requests (timestamp DESC);

-- schema.sql grants to cowrie_user; new tables need the same or the API cannot
-- write them. Migration 006 was tripped up by exactly this.
GRANT SELECT, INSERT, UPDATE ON cowrie_client_fingerprints TO cowrie_user;
GRANT SELECT, INSERT, UPDATE ON cowrie_tunnel_requests TO cowrie_user;
GRANT USAGE, SELECT ON SEQUENCE cowrie_tunnel_requests_id_seq TO cowrie_user;
