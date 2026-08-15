-- /top-asn, /top-countries and /creds each re-ran an unbounded
-- GROUP BY + COUNT(DISTINCT src_ip) over all of cowrie_events on every cache
-- miss (60s+ in production; slow enough to exhaust the connection pool and
-- 500 every other endpoint). Pre-aggregate on write instead, same pattern as
-- cowrie_unique_commands / cowrie_files_agg, so the read path is an indexed
-- LIMIT query.
--
-- COUNT(DISTINCT src_ip) can't be kept as a bare counter, so each aggregate
-- gets a companion (key, src_ip) table; the trigger bumps unique_ips only
-- when the (key, src_ip) pair is first seen.

CREATE TABLE IF NOT EXISTS cowrie_asn_agg (
  asn integer PRIMARY KEY,
  org text,
  total bigint NOT NULL DEFAULT 0,
  unique_ips bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cowrie_asn_ips (
  asn integer NOT NULL,
  src_ip inet NOT NULL,
  PRIMARY KEY (asn, src_ip)
);

CREATE TABLE IF NOT EXISTS cowrie_country_agg (
  country_iso text PRIMARY KEY,
  total bigint NOT NULL DEFAULT 0,
  unique_ips bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cowrie_country_ips (
  country_iso text NOT NULL,
  src_ip inet NOT NULL,
  PRIMARY KEY (country_iso, src_ip)
);

-- cowrie_unique_creds already tracks first/last_seen per combo; add the
-- counters the /creds leaderboard needs (mirrors cowrie_unique_commands).
ALTER TABLE cowrie_unique_creds
  ADD COLUMN IF NOT EXISTS total_events bigint,
  ADD COLUMN IF NOT EXISTS unique_ips bigint;

CREATE TABLE IF NOT EXISTS cowrie_cred_ips (
  username text NOT NULL,
  password text NOT NULL,
  src_ip inet NOT NULL,
  PRIMARY KEY (username, password, src_ip)
);

-- One-time backfill, mirroring the GROUP BY logic the API queries used to run
-- on every request. Guarded so re-runs (the deploy workflow applies every
-- migration on every deploy) skip the full-table scans. Three separate DO
-- blocks (= three transactions) so one failing backfill cannot roll back the
-- others — the first deploy of this migration lost 36 minutes of ASN/country
-- backfill when the creds branch hit an unindexable row.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cowrie_asn_agg) THEN
    INSERT INTO cowrie_asn_ips (asn, src_ip)
    SELECT DISTINCT asn, src_ip
    FROM cowrie_events
    WHERE asn IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO cowrie_asn_agg (asn, org, total, unique_ips)
    SELECT asn,
           mode() WITHIN GROUP (ORDER BY org),
           COUNT(*),
           COUNT(DISTINCT src_ip)
    FROM cowrie_events
    WHERE asn IS NOT NULL
    GROUP BY asn
    ON CONFLICT (asn) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cowrie_country_agg) THEN
    INSERT INTO cowrie_country_ips (country_iso, src_ip)
    SELECT DISTINCT country_iso, src_ip
    FROM cowrie_events
    WHERE country_iso IS NOT NULL AND country_iso <> ''
    ON CONFLICT DO NOTHING;

    INSERT INTO cowrie_country_agg (country_iso, total, unique_ips)
    SELECT country_iso,
           COUNT(*),
           COUNT(DISTINCT src_ip)
    FROM cowrie_events
    WHERE country_iso IS NOT NULL AND country_iso <> ''
    GROUP BY country_iso
    ON CONFLICT (country_iso) DO NOTHING;
  END IF;
END $$;

-- Attackers throw multi-kilobyte junk at the auth prompt (a 56KB "password"
-- exists in cowrie_events) and a btree index row caps out at 8191 bytes, so
-- oversized combos can be neither indexed here nor stored in
-- cowrie_unique_creds. Cap what the leaderboard tracks; anything over the cap
-- is one-off noise that would never chart in a top-N anyway. The same cap is
-- enforced at ingest in backend/index.js (LIMITS.MAX_CRED_BYTES).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cowrie_cred_ips) THEN
    INSERT INTO cowrie_cred_ips (username, password, src_ip)
    SELECT DISTINCT username, password, src_ip
    FROM cowrie_events
    WHERE username IS NOT NULL AND username <> ''
      AND password IS NOT NULL AND password <> ''
      AND octet_length(username) + octet_length(password) <= 1000
    ON CONFLICT DO NOTHING;

    INSERT INTO cowrie_unique_creds (username, password, first_seen, last_seen, total_events, unique_ips)
    SELECT username, password,
           MIN("timestamp"), MAX("timestamp"),
           COUNT(*), COUNT(DISTINCT src_ip)
    FROM cowrie_events
    WHERE username IS NOT NULL AND username <> ''
      AND password IS NOT NULL AND password <> ''
      AND octet_length(username) + octet_length(password) <= 1000
    GROUP BY username, password
    ON CONFLICT (username, password) DO UPDATE SET
      first_seen   = LEAST(cowrie_unique_creds.first_seen, EXCLUDED.first_seen),
      last_seen    = GREATEST(cowrie_unique_creds.last_seen, EXCLUDED.last_seen),
      total_events = EXCLUDED.total_events,
      unique_ips   = EXCLUDED.unique_ips;
  END IF;
END $$;

-- Keeps the aggregates in sync with every insert into cowrie_events. FOUND
-- after INSERT ... ON CONFLICT DO NOTHING is true only when the row was
-- actually inserted, i.e. the (key, src_ip) pair is new; EXCLUDED.unique_ips
-- carries that 0/1 into the upsert.
CREATE OR REPLACE FUNCTION sync_cowrie_event_aggs() RETURNS trigger AS $$
DECLARE
  new_ip boolean;
BEGIN
  IF NEW.asn IS NOT NULL THEN
    INSERT INTO cowrie_asn_ips (asn, src_ip)
    VALUES (NEW.asn, NEW.src_ip)
    ON CONFLICT DO NOTHING;
    new_ip := FOUND;

    INSERT INTO cowrie_asn_agg (asn, org, total, unique_ips)
    VALUES (NEW.asn, NEW.org, 1, CASE WHEN new_ip THEN 1 ELSE 0 END)
    ON CONFLICT (asn) DO UPDATE SET
      total      = cowrie_asn_agg.total + 1,
      unique_ips = cowrie_asn_agg.unique_ips + EXCLUDED.unique_ips,
      org        = COALESCE(cowrie_asn_agg.org, EXCLUDED.org);
  END IF;

  IF NEW.country_iso IS NOT NULL AND NEW.country_iso <> '' THEN
    INSERT INTO cowrie_country_ips (country_iso, src_ip)
    VALUES (NEW.country_iso, NEW.src_ip)
    ON CONFLICT DO NOTHING;
    new_ip := FOUND;

    INSERT INTO cowrie_country_agg (country_iso, total, unique_ips)
    VALUES (NEW.country_iso, 1, CASE WHEN new_ip THEN 1 ELSE 0 END)
    ON CONFLICT (country_iso) DO UPDATE SET
      total      = cowrie_country_agg.total + 1,
      unique_ips = cowrie_country_agg.unique_ips + EXCLUDED.unique_ips;
  END IF;

  IF NEW.username IS NOT NULL AND NEW.username <> ''
     AND NEW.password IS NOT NULL AND NEW.password <> ''
     AND octet_length(NEW.username) + octet_length(NEW.password) <= 1000 THEN
    INSERT INTO cowrie_cred_ips (username, password, src_ip)
    VALUES (NEW.username, NEW.password, NEW.src_ip)
    ON CONFLICT DO NOTHING;
    new_ip := FOUND;

    INSERT INTO cowrie_unique_creds (username, password, first_seen, last_seen, total_events, unique_ips)
    VALUES (NEW.username, NEW.password, NEW."timestamp", NEW."timestamp", 1, CASE WHEN new_ip THEN 1 ELSE 0 END)
    ON CONFLICT (username, password) DO UPDATE SET
      first_seen   = LEAST(cowrie_unique_creds.first_seen, EXCLUDED.first_seen),
      last_seen    = GREATEST(cowrie_unique_creds.last_seen, EXCLUDED.last_seen),
      total_events = COALESCE(cowrie_unique_creds.total_events, 0) + 1,
      unique_ips   = COALESCE(cowrie_unique_creds.unique_ips, 0) + EXCLUDED.unique_ips;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_cowrie_event_aggs ON cowrie_events;
CREATE TRIGGER trg_sync_cowrie_event_aggs
  AFTER INSERT ON cowrie_events
  FOR EACH ROW EXECUTE FUNCTION sync_cowrie_event_aggs();
