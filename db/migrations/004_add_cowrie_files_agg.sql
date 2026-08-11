-- GET /api/public/cowrie/files re-aggregated the entire cowrie_files table
-- (GROUP BY sha256 + DISTINCT ON) on every cache miss, which scales with every
-- download ever recorded. cowrie_unique_commands / cowrie_unique_creds already
-- solve this for commands/creds via a pre-aggregated table kept in sync on
-- write; do the same here so the read path is an indexed LIMIT query.

CREATE TABLE IF NOT EXISTS cowrie_files_agg (
  sha256 text PRIMARY KEY,
  size_bytes bigint,
  first_seen timestamp with time zone,
  vt_last_fetched timestamp with time zone,
  vt_found boolean,
  vt_malicious integer,
  vt_suspicious integer,
  vt_harmless integer,
  vt_undetected integer,
  vt_timeout integer,
  vt_reputation integer,
  vt_type text,
  vt_magic text,
  vt_first_submission_date timestamp with time zone,
  vt_last_analysis_date timestamp with time zone,
  vt_tags text[]
);

-- One-time backfill, mirroring the CTE logic the API query used to run on
-- every request.
INSERT INTO cowrie_files_agg (
  sha256, size_bytes, first_seen,
  vt_last_fetched, vt_found, vt_malicious, vt_suspicious, vt_harmless,
  vt_undetected, vt_timeout, vt_reputation, vt_type, vt_magic,
  vt_first_submission_date, vt_last_analysis_date, vt_tags
)
SELECT
  file_agg.sha256,
  file_agg.size_bytes,
  file_agg.first_seen,
  vt_latest.vt_last_fetched,
  vt_latest.vt_found,
  vt_latest.vt_malicious,
  vt_latest.vt_suspicious,
  vt_latest.vt_harmless,
  vt_latest.vt_undetected,
  vt_latest.vt_timeout,
  vt_latest.vt_reputation,
  vt_latest.vt_type,
  vt_latest.vt_magic,
  vt_latest.vt_first_submission_date,
  vt_latest.vt_last_analysis_date,
  vt_latest.vt_tags
FROM (
  SELECT sha256, MAX(size_bytes) AS size_bytes, MIN(mtime) AS first_seen
  FROM cowrie_files
  GROUP BY sha256
) file_agg
LEFT JOIN LATERAL (
  SELECT vt_last_fetched, vt_found, vt_malicious, vt_suspicious, vt_harmless,
         vt_undetected, vt_timeout, vt_reputation, vt_type, vt_magic,
         vt_first_submission_date, vt_last_analysis_date, vt_tags
  FROM cowrie_files cf
  WHERE cf.sha256 = file_agg.sha256
  ORDER BY vt_last_fetched DESC NULLS LAST, mtime DESC
  LIMIT 1
) vt_latest ON true
ON CONFLICT (sha256) DO NOTHING;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_files_agg_first_seen
  ON cowrie_files_agg (first_seen DESC);

-- Keeps cowrie_files_agg in sync however cowrie_files gets written: bulk
-- ingest from the API, or the separate VT-enrichment process that updates
-- vt_* columns directly (no code for that lives in this repo).
CREATE OR REPLACE FUNCTION sync_cowrie_files_agg() RETURNS trigger AS $$
BEGIN
  INSERT INTO cowrie_files_agg (
    sha256, size_bytes, first_seen,
    vt_last_fetched, vt_found, vt_malicious, vt_suspicious, vt_harmless,
    vt_undetected, vt_timeout, vt_reputation, vt_type, vt_magic,
    vt_first_submission_date, vt_last_analysis_date, vt_tags
  )
  VALUES (
    NEW.sha256, NEW.size_bytes, NEW.mtime,
    NEW.vt_last_fetched, NEW.vt_found, NEW.vt_malicious, NEW.vt_suspicious, NEW.vt_harmless,
    NEW.vt_undetected, NEW.vt_timeout, NEW.vt_reputation, NEW.vt_type, NEW.vt_magic,
    NEW.vt_first_submission_date, NEW.vt_last_analysis_date, NEW.vt_tags
  )
  ON CONFLICT (sha256) DO UPDATE SET
    size_bytes = GREATEST(cowrie_files_agg.size_bytes, EXCLUDED.size_bytes),
    first_seen = LEAST(cowrie_files_agg.first_seen, EXCLUDED.first_seen),
    -- Only adopt the incoming row's VT fields if they're a more recent VT
    -- fetch than what's already stored (mirrors the old
    -- DISTINCT ON (sha256) ORDER BY vt_last_fetched DESC NULLS LAST).
    vt_last_fetched = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_last_fetched ELSE cowrie_files_agg.vt_last_fetched END,
    vt_found = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_found ELSE cowrie_files_agg.vt_found END,
    vt_malicious = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_malicious ELSE cowrie_files_agg.vt_malicious END,
    vt_suspicious = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_suspicious ELSE cowrie_files_agg.vt_suspicious END,
    vt_harmless = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_harmless ELSE cowrie_files_agg.vt_harmless END,
    vt_undetected = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_undetected ELSE cowrie_files_agg.vt_undetected END,
    vt_timeout = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_timeout ELSE cowrie_files_agg.vt_timeout END,
    vt_reputation = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_reputation ELSE cowrie_files_agg.vt_reputation END,
    vt_type = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_type ELSE cowrie_files_agg.vt_type END,
    vt_magic = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_magic ELSE cowrie_files_agg.vt_magic END,
    vt_first_submission_date = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_first_submission_date ELSE cowrie_files_agg.vt_first_submission_date END,
    vt_last_analysis_date = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_last_analysis_date ELSE cowrie_files_agg.vt_last_analysis_date END,
    vt_tags = CASE WHEN EXCLUDED.vt_last_fetched IS NOT NULL
        AND (cowrie_files_agg.vt_last_fetched IS NULL OR EXCLUDED.vt_last_fetched > cowrie_files_agg.vt_last_fetched)
      THEN EXCLUDED.vt_tags ELSE cowrie_files_agg.vt_tags END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_cowrie_files_agg ON cowrie_files;
CREATE TRIGGER trg_sync_cowrie_files_agg
  AFTER INSERT OR UPDATE ON cowrie_files
  FOR EACH ROW EXECUTE FUNCTION sync_cowrie_files_agg();
