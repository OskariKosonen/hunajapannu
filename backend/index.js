const express = require('express');
const { Pool } = require('pg');
const maxmind = require('maxmind');
const { LRUCache } = require('lru-cache');
const rateLimit = require('express-rate-limit');

// ============================================================================
// Configuration Constants
// ============================================================================

const LIMITS = {
  MAX_COMMANDS: 3000,
  DEFAULT_COMMANDS: 50,
  MAX_CREDS: 1000,
  DEFAULT_CREDS: 50,
  MAX_FILES: 1000,
  DEFAULT_FILES: 50,
  MAX_ASN: 1000,
  DEFAULT_ASN: 20,
  MAX_COUNTRIES: 1000,
  DEFAULT_COUNTRIES: 20,
  MAX_HOURS_LOOKBACK: 168,  // 7 days
  DEFAULT_HOURS_LOOKBACK: 24,
  MAX_LATEST_EVENTS: 200,
  DEFAULT_LATEST_EVENTS: 50,
};

const CACHE_CONFIG = {
  MAX_IPS: 5000,
  TTL_HOURS: 6,
  TTL_MS: 1000 * 60 * 60 * 6,
};

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

// ============================================================================
// Application Setup
// ============================================================================

const app = express();
app.set('trust proxy', 1);   // trust one proxy hop (Cloudflare/nginx)
app.use(express.json());

// Apply rate limiting to all public endpoints
const publicLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.MAX_REQUESTS,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/public/', publicLimiter);

// ============================================================================
// Database Configuration
// ============================================================================

/**
 * PostgreSQL connection pool for the Cowrie honeypot database.
 * Uses connection pooling to efficiently manage database connections.
 */
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'cowrie_user',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'cowrie_db',
  max: 20,                     // Maximum pool size
  idleTimeoutMillis: 30000,    // Close idle clients after 30s
  connectionTimeoutMillis: 5000,
});

// A dropped idle client would otherwise crash the process; log and move on.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// ============================================================================
// GeoIP Configuration and Cache
// ============================================================================

/**
 * Paths to MaxMind GeoIP database files.
 * Can be overridden via environment variables.
 */
const GEO_CITY_DB_PATH = process.env.GEO_CITY_DB_PATH || '/var/lib/GeoIP/GeoLite2-City.mmdb';
const GEO_ASN_DB_PATH = process.env.GEO_ASN_DB_PATH || '/var/lib/GeoIP/GeoLite2-ASN.mmdb';

/**
 * MaxMind database readers for city and ASN lookups.
 * Initialized asynchronously on startup.
 */
let geoCityReader = null;
let geoAsnReader = null;

/**
 * In-memory LRU cache for GeoIP lookup results.
 * Reduces database lookups by caching IP addresses.
 */
const geoCache = new LRUCache({
  max: CACHE_CONFIG.MAX_IPS,
  ttl: CACHE_CONFIG.TTL_MS,
});

const summaryCache = {
  data: null,
  expiresAt: 0,
};

const leaderboardCache = new Map();

function getCachedLeaderboard(key) {
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

function setCachedLeaderboard(key, data) {
  leaderboardCache.set(key, { data, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS });
}

async function getSummaryStats() {
  const now = Date.now();
  if (summaryCache.data && summaryCache.expiresAt > now) {
    return summaryCache.data;
  }

  const client = await pool.connect();
  try {
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [eventsAgg, filesAgg, commandsAgg, credsAgg, ipStatsAgg] = await Promise.all([
      client.query(
        `SELECT SUM(events_per_hour.events) AS total, MAX(events_per_hour.hour) AS peak_hour, MAX(events_per_hour.events) AS peak_events
         FROM (
           SELECT date_trunc('hour', timestamp) AS hour, COUNT(*) AS events
           FROM cowrie_events
           WHERE timestamp >= $1
           GROUP BY hour
         ) events_per_hour`,
        [twentyFourHoursAgo]
      ),
      client.query('SELECT COUNT(DISTINCT sha256) AS malware_samples FROM cowrie_files'),
      client.query('SELECT COUNT(*) AS unique_commands FROM cowrie_unique_commands'),
      client.query(
        'SELECT COUNT(*) AS unique_creds FROM cowrie_unique_creds'
      ),
      client.query(
        `SELECT COUNT(*) AS total_events, COUNT(DISTINCT src_ip) AS unique_ips
         FROM cowrie_events
         WHERE timestamp >= $1`,
        [twentyFourHoursAgo]
      ),
    ]);

    const totalTrendEvents = Number(eventsAgg.rows[0]?.total || 0);
    const peakEvents = Number(eventsAgg.rows[0]?.peak_events || 0);
    const peakHour = eventsAgg.rows[0]?.peak_hour;
    const summary = {
      attacks24h: totalTrendEvents,
      peakEvents,
      peakHour,
      malwareSamples: Number(filesAgg.rows[0]?.malware_samples || 0),
      uniqueCommands: Number(commandsAgg.rows[0]?.unique_commands || 0),
      uniqueCredCount: Number(credsAgg.rows[0]?.unique_creds || 0),
      uniqueIpPercent:
        Number(ipStatsAgg.rows[0]?.total_events || 0) > 0
          ? (Number(ipStatsAgg.rows[0].unique_ips || 0) / Number(ipStatsAgg.rows[0].total_events)) * 100
          : 0,
    };

    summaryCache.data = summary;
    summaryCache.expiresAt = now + SUMMARY_CACHE_TTL_MS;
    return summary;
  } finally {
    client.release();
  }
}

/**
 * Initializes the MaxMind GeoIP databases.
 * If initialization fails, the server continues without geo enrichment.
 *
 * @async
 * @returns {Promise<void>}
 */
async function initGeoIP() {
  try {
    geoCityReader = await maxmind.open(GEO_CITY_DB_PATH);
    geoAsnReader = await maxmind.open(GEO_ASN_DB_PATH);
    console.log('GeoIP databases loaded successfully');
  } catch (err) {
    console.error('Failed to initialize GeoIP databases, continuing without geo enrichment:', err);
    // Server continues to function; geo lookups will return null
  }
}

/**
 * Performs a GeoIP lookup for the given IP address.
 * Results are cached in memory to improve performance.
 *
 * @param {string} ip - The IP address to look up
 * @returns {Object|null} Geo data containing country_iso, city, asn, and org, or null if unavailable
 */
function lookupGeo(ip) {
  // Guard clause: return early if no IP provided
  if (!ip) return null;

  // Check cache first to avoid repeated lookups
  const cached = geoCache.get(ip);
  if (cached) return cached;

  // If databases aren't loaded, return null
  if (!geoCityReader || !geoAsnReader) return null;

  try {
    // Perform lookups in both city and ASN databases
    const cityRec = geoCityReader.get(ip);
    const asnRec = geoAsnReader.get(ip);

    // Initialize result fields
    let countryIso = null;
    let cityName = null;
    let asn = null;
    let org = null;

    // Extract city and country information
    if (cityRec) {
      // Prefer primary country, fall back to registered country
      if (cityRec.country && cityRec.country.iso_code) {
        countryIso = cityRec.country.iso_code;
      } else if (cityRec.registered_country && cityRec.registered_country.iso_code) {
        countryIso = cityRec.registered_country.iso_code;
      }

      // Extract city name in English
      if (cityRec.city && cityRec.city.names && cityRec.city.names.en) {
        cityName = cityRec.city.names.en;
      }
    }

    // Extract ASN and organization information
    if (asnRec) {
      if (typeof asnRec.autonomous_system_number === 'number') {
        asn = asnRec.autonomous_system_number;
      }
      if (asnRec.autonomous_system_organization) {
        org = asnRec.autonomous_system_organization;
      }
    }

    // Construct result object
    const result = {
      country_iso: countryIso,
      city: cityName,
      asn: asn,
      org: org,
    };

    // Cache the result for future lookups
    geoCache.set(ip, result);
    return result;
  } catch (err) {
    console.error(`GeoIP lookup error for ${ip}:`, err.message);
    return null;
  }
}

// ============================================================================
// Authentication Middleware Helper
// ============================================================================

/**
 * Validates the Bearer token from the Authorization header.
 *
 * @param {Object} req - Express request object
 * @returns {boolean} True if authentication is valid, false otherwise
 */
function isAuthenticated(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return token === API_KEY;
}

// ============================================================================
// Protected Endpoints - File Metadata Ingestion
// ============================================================================

/**
 * POST /api/cowrie/files
 *
 * Ingests file metadata from honeypot downloads.
 * Requires Bearer token authentication.
 *
 * Request body: { files: Array<FileMetadata> }
 * Response: { status: 'ok', inserted: number }
 */
app.post('/api/cowrie/files', async (req, res) => {
  // Authenticate request
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate request body
  const files = req.body.files || [];
  if (!Array.isArray(files) || files.length === 0) {
    return res.json({ status: 'ok', inserted: 0 });
  }

  // Use a transaction to ensure all-or-nothing insertion
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bulk insert using array aggregation for better performance
    const values = [];
    const placeholders = [];

    files.forEach((f, idx) => {
      const offset = idx * 8;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      );
      values.push(
        f.timestamp || new Date().toISOString(),
        f.sha256 || f.filename,
        f.size_bytes,
        f.mtime,
        f.mode || null,
        f.uid ?? null,
        f.gid ?? null,
        f.full_path || null
      );
    });

    if (placeholders.length > 0) {
      await client.query(
        `INSERT INTO cowrie_files
          (timestamp, sha256, size_bytes, mtime, mode, uid, gid, full_path)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    await client.query('COMMIT');
    res.json({ status: 'ok', inserted: files.length });
  } catch (err) {
    console.error('Error in /api/cowrie/files:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database operation failed' });
  } finally {
    client.release();
  }
});

// ============================================================================
// Protected Endpoints - Event Ingestion with GeoIP Enrichment
// ============================================================================

/**
 * POST /api/cowrie/events
 *
 * Ingests honeypot events from Raspberry Pi or other sources.
 * Enriches events with GeoIP/ASN data using MaxMind databases and LRU cache.
 * Requires Bearer token authentication.
 *
 * Request body: { events: Array<EventData> }
 * Response: { status: 'ok', inserted: number }
 */
app.post('/api/cowrie/events', async (req, res) => {
  // Authenticate request
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate request body
  const events = req.body.events || [];
  if (!Array.isArray(events) || events.length === 0) {
    return res.json({ status: 'ok', inserted: 0 });
  }

  // Use a transaction to ensure atomicity
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bulk insert for better performance
    const values = [];
    const placeholders = [];
    const commandRows = [];
    const credsRows = [];

    events.forEach((ev, idx) => {
      const geo = lookupGeo(ev.src_ip) || {};
      const offset = idx * 11;
      const eventTimestamp = ev.timestamp || new Date().toISOString();

      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
      );

      values.push(
        eventTimestamp,
        ev.src_ip,
        ev.dest_port || 22,
        ev.username || null,
        ev.password || null,
        ev.command || null,
        ev.session_id || null,
        geo.country_iso || null,
        geo.asn || null,
        geo.org || null,
        geo.city || null
      );

      if (ev.command && ev.command !== '') {
        commandRows.push({ command: ev.command, timestamp: eventTimestamp });
      }

      if (ev.username && ev.username !== '' && ev.password && ev.password !== '') {
        credsRows.push({
          username: ev.username,
          password: ev.password,
          timestamp: eventTimestamp,
        });
      }
    });

    if (placeholders.length > 0) {
      await client.query(
        `INSERT INTO cowrie_events
         (timestamp, src_ip, dest_port, username, password, command, session_id,
          country_iso, asn, org, city)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    if (commandRows.length > 0) {
      // Dedupe within the batch: ON CONFLICT DO UPDATE rejects duplicate
      // conflict keys in a single statement (Postgres error 21000).
      const byCommand = new Map();
      for (const row of commandRows) {
        const existing = byCommand.get(row.command);
        if (existing) {
          if (row.timestamp < existing.first) existing.first = row.timestamp;
          if (row.timestamp > existing.last) existing.last = row.timestamp;
        } else {
          byCommand.set(row.command, { first: row.timestamp, last: row.timestamp });
        }
      }

      const commandValues = [];
      const commandPlaceholders = [];
      let cIdx = 0;
      for (const [command, ts] of byCommand) {
        const offset = cIdx * 3;
        commandPlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
        commandValues.push(command, ts.first, ts.last);
        cIdx++;
      }

      await client.query(
        `INSERT INTO cowrie_unique_commands (command, first_seen, last_seen)
         VALUES ${commandPlaceholders.join(', ')}
         ON CONFLICT (command) DO UPDATE
         SET first_seen = LEAST(cowrie_unique_commands.first_seen, EXCLUDED.first_seen),
             last_seen = GREATEST(cowrie_unique_commands.last_seen, EXCLUDED.last_seen)`,
        commandValues
      );
    }

    if (credsRows.length > 0) {
      // Dedupe within the batch on the (username, password) conflict key.
      const byCred = new Map();
      for (const row of credsRows) {
        const key = `${row.username}\u0000${row.password}`;
        const existing = byCred.get(key);
        if (existing) {
          if (row.timestamp < existing.first) existing.first = row.timestamp;
          if (row.timestamp > existing.last) existing.last = row.timestamp;
        } else {
          byCred.set(key, { username: row.username, password: row.password, first: row.timestamp, last: row.timestamp });
        }
      }

      const credsValues = [];
      const credsPlaceholders = [];
      // 4 target columns (username, password, first_seen, last_seen) -> 4 values per row.
      let crIdx = 0;
      for (const [, c] of byCred) {
        const offset = crIdx * 4;
        credsPlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        credsValues.push(c.username, c.password, c.first, c.last);
        crIdx++;
      }

      await client.query(
        `INSERT INTO cowrie_unique_creds (username, password, first_seen, last_seen)
         VALUES ${credsPlaceholders.join(', ')}
         ON CONFLICT (username, password) DO UPDATE
         SET first_seen = LEAST(cowrie_unique_creds.first_seen, EXCLUDED.first_seen),
             last_seen = GREATEST(cowrie_unique_creds.last_seen, EXCLUDED.last_seen)`,
        credsValues
      );
    }

    await client.query('COMMIT');
    res.json({ status: 'ok', inserted: events.length });
  } catch (err) {
    console.error('Error in /api/cowrie/events:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database operation failed' });
  } finally {
    client.release();
  }
});

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /health
 *
 * Simple health check endpoint to verify server and database connectivity.
 * Useful for monitoring and alerting.
 *
 * Response: { status: 'ok'|'error', db: 'connected'|'disconnected' }
 */
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// Public Endpoints - Time Series Data
// ============================================================================

/**
 * GET /api/public/cowrie/events-per-hour
 *
 * Returns event counts aggregated by hour for trend analysis.
 *
 * Query parameters:
 *   - hours: number of hours to look back (default: 24, min: 1, max: 168)
 *
 * Response: Array<{ hour: ISO timestamp, events: number }>
 */
app.get('/api/public/cowrie/events-per-hour', async (req, res) => {
  // Parse and clamp the hours parameter
  const rawHours = parseInt(req.query.hours, 10);
  const hours = Number.isFinite(rawHours) ? rawHours : LIMITS.DEFAULT_HOURS_LOOKBACK;
  const clampedHours = Math.min(Math.max(hours, 1), LIMITS.MAX_HOURS_LOOKBACK);

  // Calculate the "since" timestamp
  const now = Date.now();
  const since = new Date(now - clampedHours * 60 * 60 * 1000);

  try {
    const { rows } = await pool.query(
      `SELECT
         date_trunc('hour', timestamp) AS hour,
         COUNT(*) AS events
       FROM cowrie_events
       WHERE timestamp >= $1
       GROUP BY hour
       ORDER BY hour ASC`,
      [since]
    );

    // Convert Date objects to ISO strings for JSON serialization
    const result = rows.map((r) => ({
      hour: r.hour.toISOString(),
      events: Number(r.events),
    }));

    res.json(result);
  } catch (err) {
    console.error('Error in /api/public/cowrie/events-per-hour:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - Latest Events
// ============================================================================

/**
 * GET /api/public/cowrie/latest
 *
 * Returns the most recent events regardless of whether optional fields are empty.
 *
 * Query parameters:
 *   - limit: maximum number of events to return (default: 50, max: 200)
 *
 * Response: Array<Event> with all fields including geo data
 */
app.get('/api/public/cowrie/latest', async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? rawLimit : LIMITS.DEFAULT_LATEST_EVENTS;
    const clampedLimit = Math.min(Math.max(limit, 1), LIMITS.MAX_LATEST_EVENTS);

    const { rows } = await pool.query(
      `SELECT
         timestamp,
         src_ip,
         dest_port,
         username,
         password,
         command,
         session_id,
         country_iso,
         asn,
         org,
         city
       FROM cowrie_events
       ORDER BY timestamp DESC
       LIMIT $1`,
      [clampedLimit]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error in /api/public/cowrie/latest:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - Command Statistics
// ============================================================================

/**
 * GET /api/public/cowrie/commands
 *
 * Returns aggregated statistics for commands executed in the honeypot.
 * Useful for understanding attacker behavior and common attack patterns.
 *
 * Query parameters:
 *   - limit: maximum number of commands to return (default: 50, max: 500)
 *
 * Response: Array<{
 *   command: string,
 *   total: number,
 *   unique_ips: number,
 *   first_seen: timestamp,
 *   last_seen: timestamp
 * }>
 */
app.get('/api/public/cowrie/commands', async (req, res) => {
  const limit = Math.min(
    parseInt(req.query.limit, 10) || LIMITS.DEFAULT_COMMANDS,
    LIMITS.MAX_COMMANDS
  );

  const cacheKey = `commands:${limit}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         command,
         first_seen,
         last_seen,
         COALESCE(total_events, 0) AS total,
         COALESCE(unique_ips, 0) AS unique_ips
       FROM cowrie_unique_commands
       ORDER BY COALESCE(total_events, 0) DESC
       LIMIT $1`,
      [limit]
    );

    setCachedLeaderboard(cacheKey, rows);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/public/cowrie/commands:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - Credential Statistics
// ============================================================================

/**
 * GET /api/public/cowrie/creds
 *
 * Returns the most commonly attempted username/password combinations.
 * Useful for understanding credential stuffing patterns and weak passwords.
 *
 * Query parameters:
 *   - limit: maximum number of combos to return (default: 50, max: 500)
 *
 * Response: Array<{
 *   username: string,
 *   password: string,
 *   total: number,
 *   unique_ips: number,
 *   first_seen: timestamp,
 *   last_seen: timestamp
 * }>
 */
app.get('/api/public/cowrie/creds', async (req, res) => {
  const limit = Math.min(
    parseInt(req.query.limit, 10) || LIMITS.DEFAULT_CREDS,
    LIMITS.MAX_CREDS
  );

  const cacheKey = `creds:${limit}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         username,
         password,
         COUNT(*) AS total,
         COUNT(DISTINCT src_ip) AS unique_ips
       FROM cowrie_events
       WHERE username IS NOT NULL
         AND username <> ''
         AND password IS NOT NULL
         AND password <> ''
       GROUP BY username, password
       ORDER BY total DESC
       LIMIT $1`,
      [limit]
    );

    setCachedLeaderboard(cacheKey, rows);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/public/cowrie/creds:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

/**
 * GET /api/public/cowrie/creds/unique-count
 *
 * Returns the count of unique username/password combinations observed.
 * Helps summarize credential spraying diversity.
 *
 * Response: { unique_creds: number }
 */
app.get('/api/public/cowrie/creds/unique-count', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS unique_creds FROM cowrie_unique_creds');

    const uniqueCreds = rows[0] ? Number(rows[0].unique_creds) : 0;
    res.json({ unique_creds: uniqueCreds });
  } catch (err) {
    console.error('Error in /api/public/cowrie/creds/unique-count:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - File Download Statistics
// ============================================================================

/**
 * GET /api/public/cowrie/files
 *
 * Returns aggregated statistics for files downloaded through the honeypot.
 * Useful for malware analysis and understanding attacker toolkits.
 *
 * Query parameters:
 *   - limit: maximum number of files to return (default: 50, max: 500)
 *
 * Response: Array<{
 *   sha256: string,
 *   size_bytes: number,
 *   first_seen: timestamp,
 *   vt_last_fetched: timestamp | null,
 *   vt_found: boolean | null,
 *   vt_malicious: number | null,
 *   vt_suspicious: number | null,
 *   vt_harmless: number | null,
 *   vt_undetected: number | null,
 *   vt_timeout: number | null,
 *   vt_reputation: number | null,
 *   vt_type: string | null,
 *   vt_magic: string | null,
 *   vt_first_submission_date: timestamp | null,
 *   vt_last_analysis_date: timestamp | null,
 *   vt_tags: string[] | null
 * }>
 */
app.get('/api/public/cowrie/files', async (req, res) => {
  const limit = Math.min(
    parseInt(req.query.limit, 10) || LIMITS.DEFAULT_FILES,
    LIMITS.MAX_FILES
  );

  const cacheKey = `files:${limit}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    // cowrie_files_agg is a pre-aggregated, trigger-maintained mirror of
    // cowrie_files (see db/migrations/004_add_cowrie_files_agg.sql), so this
    // is an indexed LIMIT instead of a GROUP BY/DISTINCT ON over every
    // download ever recorded.
    const { rows } = await pool.query(
      `SELECT
         sha256,
         size_bytes,
         first_seen,
         vt_last_fetched,
         vt_found,
         vt_malicious,
         vt_suspicious,
         vt_harmless,
         vt_undetected,
         vt_timeout,
         vt_reputation,
         vt_type,
         vt_magic,
         vt_first_submission_date,
         vt_last_analysis_date,
         vt_tags
       FROM cowrie_files_agg
       ORDER BY first_seen DESC
       LIMIT $1`,
      [limit]
    );

    setCachedLeaderboard(cacheKey, rows);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/public/cowrie/files:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - Network Statistics (ASN)
// ============================================================================

/**
 * GET /api/public/cowrie/top-asn
 *
 * Returns top autonomous systems (ASNs) by event count.
 * Useful for identifying networks with high attack activity.
 *
 * Query parameters:
 *   - limit: maximum number of ASNs to return (default: 20, max: 200)
 *
 * Response: Array<{
 *   asn: number,
 *   org: string,
 *   total: number,
 *   unique_ips: number,
 *   first_seen: timestamp,
 *   last_seen: timestamp
 * }>
 */
app.get('/api/public/cowrie/top-asn', async (req, res) => {
  const limit = Math.min(
    parseInt(req.query.limit, 10) || LIMITS.DEFAULT_ASN,
    LIMITS.MAX_ASN
  );

  const cacheKey = `top-asn:${limit}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         asn,
         org,
         COUNT(*) AS total,
         COUNT(DISTINCT src_ip) AS unique_ips
       FROM cowrie_events
       WHERE asn IS NOT NULL
       GROUP BY asn, org
       ORDER BY total DESC
       LIMIT $1`,
      [limit]
    );

    setCachedLeaderboard(cacheKey, rows);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/public/cowrie/top-asn:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - Geographic Statistics
// ============================================================================

/**
 * GET /api/public/cowrie/top-countries
 *
 * Returns top countries by event count based on GeoIP data.
 * Useful for geographic distribution analysis of attacks.
 *
 * Query parameters:
 *   - limit: maximum number of countries to return (default: 20, max: 200)
 *
 * Response: Array<{
 *   country_iso: string (ISO 3166-1 alpha-2 code),
 *   total: number,
 *   unique_ips: number,
 *   first_seen: timestamp,
 *   last_seen: timestamp
 * }>
 */
app.get('/api/public/cowrie/top-countries', async (req, res) => {
  const limit = Math.min(
    parseInt(req.query.limit, 10) || LIMITS.DEFAULT_COUNTRIES,
    LIMITS.MAX_COUNTRIES
  );

  const cacheKey = `top-countries:${limit}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         country_iso,
         COUNT(*) AS total,
         COUNT(DISTINCT src_ip) AS unique_ips
       FROM cowrie_events
       WHERE country_iso IS NOT NULL
         AND country_iso <> ''
       GROUP BY country_iso
       ORDER BY total DESC
       LIMIT $1`,
      [limit]
    );

    setCachedLeaderboard(cacheKey, rows);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/public/cowrie/top-countries:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Public Endpoints - IP Diversity Statistics
// ============================================================================

/**
 * GET /api/public/cowrie/ip-stats
 *
 * Returns the percentage of unique source IPs in the last 24 hours.
 * High percentage indicates distributed attacks; low indicates concentrated attacks.
 *
 * Response: Array<{ percent_unique: number }>
 * Note: Returns an array for consistency with other endpoints
 */
app.get('/api/public/cowrie/ip-stats', async (req, res) => {
  // Fixed 24-hour lookback window
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) AS total_events,
         COUNT(DISTINCT src_ip) AS unique_ips
       FROM cowrie_events
       WHERE timestamp >= $1`,
      [since]
    );

    const row = rows[0] || { total_events: 0, unique_ips: 0 };
    const totalEvents = Number(row.total_events) || 0;
    const uniqueIps = Number(row.unique_ips) || 0;

    // Calculate percentage of unique IPs
    const percentUnique = totalEvents > 0
      ? (uniqueIps / totalEvents) * 100
      : 0;

    // Return as array for consistency with frontend fetch factory
    res.json([{ percent_unique: percentUnique }]);
  } catch (err) {
    console.error('Error in /api/public/cowrie/ip-stats:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/api/public/cowrie/summary', async (_req, res) => {
  try {
    const summary = await getSummaryStats();
    res.json(summary);
  } catch (err) {
    console.error('Error in /api/public/cowrie/summary:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Handles graceful shutdown on SIGTERM and SIGINT signals.
 * Ensures database connections are properly closed.
 */
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    await pool.end();
    console.log('Database connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================================
// Server Startup
// ============================================================================

const PORT = process.env.PORT || 3001;

/**
 * Initializes the server by loading GeoIP databases and starting Express.
 * If GeoIP initialization fails, the server continues without geo enrichment.
 */
(async () => {
  // Initialize GeoIP databases (non-blocking if it fails)
  await initGeoIP();

  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Cowrie API server listening on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
  });
})();
