-- Speeds up time-windowed queries (attacks24h, events-per-hour, latest).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_timestamp
  ON cowrie_events (timestamp);
