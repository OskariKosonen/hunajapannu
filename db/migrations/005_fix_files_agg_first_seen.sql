-- 004's sync trigger populated cowrie_files_agg.first_seen from NEW.mtime, but
-- the forwarder never sends mtime (which is why 003 dropped the NOT NULLs), so
-- every sha256 ingested through it landed with first_seen NULL — and NULLs
-- sort first under ORDER BY first_seen DESC, so blank rows headed the files
-- panel. Fall back to the ingest timestamp, and backfill the affected rows.
-- (The pre-004 API query had the same MIN(mtime) bug; this fixes both.)

CREATE OR REPLACE FUNCTION sync_cowrie_files_agg() RETURNS trigger AS $$
BEGIN
  INSERT INTO cowrie_files_agg (
    sha256, size_bytes, first_seen,
    vt_last_fetched, vt_found, vt_malicious, vt_suspicious, vt_harmless,
    vt_undetected, vt_timeout, vt_reputation, vt_type, vt_magic,
    vt_first_submission_date, vt_last_analysis_date, vt_tags
  )
  VALUES (
    NEW.sha256, NEW.size_bytes, COALESCE(NEW.mtime, NEW."timestamp"),
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

-- Backfill rows the old trigger left NULL. Guarded so re-runs (the deploy
-- workflow applies every migration on every deploy) skip the GROUP BY once
-- the data is clean.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cowrie_files_agg WHERE first_seen IS NULL) THEN
    UPDATE cowrie_files_agg a
    SET first_seen = s.first_seen,
        size_bytes = COALESCE(a.size_bytes, s.size_bytes)
    FROM (
      SELECT sha256,
             MIN(COALESCE(mtime, "timestamp")) AS first_seen,
             MAX(size_bytes) AS size_bytes
      FROM cowrie_files
      GROUP BY sha256
    ) s
    WHERE a.sha256 = s.sha256
      AND a.first_seen IS NULL;
  END IF;
END $$;
