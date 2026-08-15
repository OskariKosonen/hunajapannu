-- Session drill-down (/api/public/cowrie/sessions/:id) pulls every event for
-- one session_id out of a 7.7M-row table; without an index that is a full
-- scan per request. The session list itself stays bounded by the existing
-- timestamp index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_events_session_id
  ON cowrie_events (session_id)
  WHERE session_id IS NOT NULL;

-- Command / credential search filters on text with ILIKE '%term%', which no
-- btree can serve. pg_trgm makes those substring searches indexable.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_commands_trgm
  ON cowrie_unique_commands USING gin (command gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_creds_username_trgm
  ON cowrie_unique_creds USING gin (username gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cowrie_unique_creds_password_trgm
  ON cowrie_unique_creds USING gin (password gin_trgm_ops);
