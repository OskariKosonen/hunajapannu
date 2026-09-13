/**
 * Configuration and environment validation.
 *
 * Split out of index.js so a route module can state exactly which limits it
 * depends on instead of reaching into a shared file scope.
 */

const LIMITS = {
  MAX_COMMANDS: 3000,
  DEFAULT_COMMANDS: 100,
  // Upper bound on the in-memory tagged command snapshot. One row per unique
  // command string, ~3.7k after nine months, so this is generous headroom.
  MAX_COMMANDS_SNAPSHOT: 20000,
  MAX_CREDS: 1000,
  DEFAULT_CREDS: 100,
  MAX_FILES: 1000,
  DEFAULT_FILES: 100,
  MAX_ASN: 1000,
  DEFAULT_ASN: 50,
  MAX_SESSION_EVENTS: 500,
  MAX_COUNTRIES: 1000,
  DEFAULT_COUNTRIES: 20,
  MAX_HOURS_LOOKBACK: 168,  // 7 days
  DEFAULT_HOURS_LOOKBACK: 24,
  MAX_LATEST_EVENTS: 200,
  DEFAULT_LATEST_EVENTS: 50,
  // Attackers throw multi-kilobyte junk at the auth prompt (a 56KB "password"
  // exists in cowrie_events); a btree index row caps out at 8191 bytes, so
  // oversized combos can't be stored in cowrie_unique_creds/cowrie_cred_ips.
  // Same cap as the sync_cowrie_event_aggs trigger (migration 006).
  MAX_CRED_BYTES: 1000,
};

const CACHE_CONFIG = {
  MAX_IPS: 5000,
  TTL_HOURS: 6,
  TTL_MS: 1000 * 60 * 60 * 6,
};

// How quiet ingestion has to go before /health calls itself degraded. The
// honeypot sees a few hundred events an hour, so half an hour of complete
// silence means something is broken, not that attackers took a break.
const INGEST_STALE_AFTER_SECONDS = Number(process.env.INGEST_STALE_AFTER_SECONDS || 1800);

// Events timestamped ahead of our own clock by more than this mean the
// sensor's clock or timezone is wrong. Cowrie on the Pi currently writes
// local (BST) times labelled 'Z', which puts every event an hour ahead.
const CLOCK_SKEW_TOLERANCE_SECONDS = Number(process.env.CLOCK_SKEW_TOLERANCE_SECONDS || 120);

const SUMMARY_CACHE_TTL_MS = 60 * 1000; // 1 minute
const LEADERBOARD_CACHE_TTL_MS = 60 * 1000; // 1 minute for top-N slices

const RATE_LIMIT_CONFIG = {
  WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
  MAX_REQUESTS: 500,           // max requests per window
};

// Secrets come from the environment now, never hardcoded. Fail loudly at
// startup if they are missing rather than silently 401ing / failing to connect.
const API_KEY = process.env.INGEST_API_KEY;
if (!API_KEY) {
  console.error('FATAL: INGEST_API_KEY is not set in the environment');
  process.exit(1);
}
if (!process.env.PGPASSWORD) {
  console.error('FATAL: PGPASSWORD is not set in the environment');
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

const GEO_CITY_DB_PATH = process.env.GEO_CITY_DB_PATH || '/var/lib/GeoIP/GeoLite2-City.mmdb';
const GEO_ASN_DB_PATH = process.env.GEO_ASN_DB_PATH || '/var/lib/GeoIP/GeoLite2-ASN.mmdb';

module.exports = {
  LIMITS,
  CACHE_CONFIG,
  INGEST_STALE_AFTER_SECONDS,
  CLOCK_SKEW_TOLERANCE_SECONDS,
  SUMMARY_CACHE_TTL_MS,
  LEADERBOARD_CACHE_TTL_MS,
  RATE_LIMIT_CONFIG,
  API_KEY,
  PORT,
  GEO_CITY_DB_PATH,
  GEO_ASN_DB_PATH,
};
