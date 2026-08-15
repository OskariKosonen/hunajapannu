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
  MAX_SESSIONS: 200,
  DEFAULT_SESSIONS: 50,
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
  // A runaway query must not hold a pool connection for a minute while every
  // other request starves waiting for a client (observed in production: two
  // slow leaderboard queries 504'd and took the whole API down with them).
  statement_timeout: 15000,
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

// ============================================================================
// MITRE ATT&CK Command Tagging
// ============================================================================

/**
 * Signatures matched against captured commands. These used to live in the
 * frontend, which meant shipping all 3000+ commands to the browser just to
 * tag and count them. Tagging here lets the API filter by technique and
 * return only the page being displayed. Display metadata (colours) stays in
 * the frontend, keyed by id.
 */
const MITRE_SIGNATURES = [
  { id: 'T1490', name: 'Impact (T1490)', description: 'Destructive cleanup',
    patterns: [/rm\s+-rf/i, /chattr\s+-i/i, /dd\s+if=/i] },
  { id: 'T1105', name: 'Ingress Tool Transfer (T1105)', description: 'wget/curl/scp drops',
    patterns: [/wget/i, /curl/i, /tftp/i, /ftp\s/i, /scp/i] },
  { id: 'T1021', name: 'Remote Services (T1021)', description: 'Pivot via SSH/Telnet',
    patterns: [/ssh\s/i, /telnet/i, /dropbear/i] },
  { id: 'T1098', name: 'Account Manipulation (T1098)', description: 'SSH key + password tampering',
    patterns: [/authorized_keys/i, /chattr/i, /lockr/i, /chpasswd/i, /mkdir\s+-p\s+~\/\.ssh/i] },
  { id: 'T1059', name: 'Cmd/Scripting (T1059)', description: 'Shells & interpreters',
    patterns: [/bash/i, /\bsh\b/i, /python/i, /perl/i, /busybox/i] },
  { id: 'T1562', name: 'Defense Evasion (T1562)', description: 'Cleanup + disabling protections',
    patterns: [/rm\s+-rf/i, /pkill/i, /echo\s+>\s+\/etc\/hosts\.deny/i, /clean\.sh/i] },
  { id: 'T1595', name: 'Reconnaissance (T1595)', description: 'Scanning & discovery',
    patterns: [/nmap/i, /masscan/i, /whois/i, /dig\s/i, /nslookup/i, /curl\s+http:\/\/\d+/i] },
  { id: 'T1082', name: 'System Info Discovery (T1082)', description: 'uname/lscpu/proc snooping',
    patterns: [/uname/i, /lscpu/i, /cat\s+\/proc\/cpuinfo/i, /cat\s+\/proc\/uptime/i,
               /df\s+-h/i, /free\s+-m/i, /nproc/i, /which\s+ls/i, /ps\s/i] },
];

const MITRE_IDS = new Set(MITRE_SIGNATURES.map((s) => s.id));

/**
 * Command strings are stable and few (one row per unique command), so the
 * regex result for a given string never changes — cache it rather than
 * re-running 40 patterns on every request.
 */
const mitreTagCache = new LRUCache({ max: 20000 });

function tagCommand(command) {
  if (!command) return [];
  const cached = mitreTagCache.get(command);
  if (cached) return cached;
  const tags = MITRE_SIGNATURES
    .filter((sig) => sig.patterns.some((p) => p.test(command)))
    .map((sig) => sig.id);
  mitreTagCache.set(command, tags);
  return tags;
}

const leaderboardCache = new Map();

function getCachedLeaderboard(key) {
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

/**
 * Parses the limit/offset/search trio shared by the paginated list endpoints.
 * Search is used as an ILIKE '%term%' argument, so escape the LIKE
 * metacharacters — otherwise a '%' typed by a user matches everything.
 */
function parseListParams(req, { defaultLimit, maxLimit }) {
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : defaultLimit, 1), maxLimit);

  const rawOffset = parseInt(req.query.offset, 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const search = rawSearch.slice(0, 200);
  const like = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  return { limit, offset, search, like };
}

function setCachedLeaderboard(key, data) {
  leaderboardCache.set(key, { data, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS });
}

async function getSummaryStats() {
  const now = Date.now();
  if (summaryCache.data && summaryCache.expiresAt > now) {
    return summaryCache.data;
  }

  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  // pool.query (not a single checked-out client) so the five queries actually
  // run in parallel — node-postgres serializes queries issued on one client.
  const [eventsAgg, filesAgg, commandsAgg, credsAgg, ipStatsAgg] = await Promise.all([
    pool.query(
      `SELECT SUM(events_per_hour.events) AS total, MAX(events_per_hour.hour) AS peak_hour, MAX(events_per_hour.events) AS peak_events
       FROM (
         SELECT date_trunc('hour', timestamp) AS hour, COUNT(*) AS events
         FROM cowrie_events
         WHERE timestamp >= $1
         GROUP BY hour
       ) events_per_hour`,
      [twentyFourHoursAgo]
    ),
    // cowrie_files_agg is one row per sha256, so a plain COUNT(*) replaces
    // the COUNT(DISTINCT sha256) scan over every download ever recorded.
    pool.query('SELECT COUNT(*) AS malware_samples FROM cowrie_files_agg'),
    pool.query('SELECT COUNT(*) AS unique_commands FROM cowrie_unique_commands'),
    pool.query(
      'SELECT COUNT(*) AS unique_creds FROM cowrie_unique_creds'
    ),
    pool.query(
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

      if (ev.username && ev.username !== '' && ev.password && ev.password !== ''
          && Buffer.byteLength(ev.username) + Buffer.byteLength(ev.password) <= LIMITS.MAX_CRED_BYTES) {
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
async function healthCheck(_req, res) {
  try {
    // MAX(timestamp) is an index scan on idx_events_timestamp. Reporting
    // ingest freshness here is the point: on 2026-08-11 the API, the database
    // and both Pi services all looked healthy for four days while no events
    // were arriving at all. "Serving requests" is not the same as "working".
    const { rows } = await pool.query('SELECT MAX(timestamp) AS last_event FROM cowrie_events');
    const lastEvent = rows[0]?.last_event ? new Date(rows[0].last_event) : null;
    const ageSeconds = lastEvent ? Math.round((Date.now() - lastEvent.getTime()) / 1000) : null;
    const ingestStale = ageSeconds == null || ageSeconds > INGEST_STALE_AFTER_SECONDS;

    // Still HTTP 200 when only ingestion is stale: the service itself is
    // healthy, and failing this would make deploys fail for an unrelated
    // reason. Alerting keys on the ingestStale flag instead.
    res.json({
      status: ingestStale ? 'degraded' : 'ok',
      db: 'connected',
      lastEventAt: lastEvent ? lastEvent.toISOString() : null,
      lastEventAgeSeconds: ageSeconds,
      ingestStale,
      staleAfterSeconds: INGEST_STALE_AFTER_SECONDS,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
}

// /health stays for the deploy's localhost probe; /api/health is the same
// check reachable from outside, since nginx only proxies /api and served the
// SPA for everything else — an external monitor pointed at /health was really
// just checking that a static file existed.
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

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
/**
 * GET /api/public/cowrie/mitre
 *
 * The technique catalogue used to tag commands, so the frontend does not have
 * to duplicate the pattern list. Patterns themselves stay server-side.
 */
app.get('/api/public/cowrie/mitre', (_req, res) => {
  res.json(MITRE_SIGNATURES.map(({ id, name, description }) => ({ id, name, description })));
});

/**
 * One row per unique command (3.7k after nine months), so the whole tagged set
 * fits comfortably in memory. Caching it here means search, technique filter,
 * pagination and the global technique counts are all served without a query,
 * and the browser receives only the page it renders instead of every row.
 */
const commandsSnapshot = { rows: null, counts: null, expiresAt: 0 };

async function getCommandsSnapshot() {
  const now = Date.now();
  if (commandsSnapshot.rows && commandsSnapshot.expiresAt > now) return commandsSnapshot;

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
    [LIMITS.MAX_COMMANDS_SNAPSHOT]
  );

  const counts = Object.fromEntries(MITRE_SIGNATURES.map((s) => [s.id, 0]));
  const tagged = rows.map((row) => {
    const tags = tagCommand(row.command);
    for (const t of tags) counts[t] += 1;
    return { ...row, tags };
  });

  commandsSnapshot.rows = tagged;
  commandsSnapshot.counts = counts;
  commandsSnapshot.expiresAt = now + LEADERBOARD_CACHE_TTL_MS;
  return commandsSnapshot;
}

app.get('/api/public/cowrie/commands', async (req, res) => {
  const { limit, offset, search } = parseListParams(req, {
    defaultLimit: LIMITS.DEFAULT_COMMANDS,
    maxLimit: LIMITS.MAX_COMMANDS,
  });
  const tag = typeof req.query.tag === 'string' && MITRE_IDS.has(req.query.tag) ? req.query.tag : null;

  try {
    const snapshot = await getCommandsSnapshot();

    let rows = snapshot.rows;
    if (tag) rows = rows.filter((r) => r.tags.includes(tag));
    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((r) => r.command && r.command.toLowerCase().includes(needle));
    }

    res.json({
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      // Always the unfiltered totals, so the filter chips keep showing what is
      // available rather than what is currently selected.
      counts: snapshot.counts,
      allTotal: snapshot.rows.length,
    });
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
  const { limit, offset, search, like } = parseListParams(req, {
    defaultLimit: LIMITS.DEFAULT_CREDS,
    maxLimit: LIMITS.MAX_CREDS,
  });

  const cacheKey = `creds:${limit}:${offset}:${search}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    // cowrie_unique_creds carries trigger-maintained counters (see
    // db/migrations/006_add_leaderboard_aggs.sql), so this is a small-table
    // sort instead of a GROUP BY over every event ever recorded. Substring
    // search is served by the trigram indexes from migration 007.
    const where = like ? `WHERE username ILIKE $1 ESCAPE '\\' OR password ILIKE $1 ESCAPE '\\'` : '';
    const params = like ? [like] : [];

    const [list, count] = await Promise.all([
      pool.query(
        `SELECT
           username,
           password,
           first_seen,
           last_seen,
           COALESCE(total_events, 0) AS total,
           COALESCE(unique_ips, 0) AS unique_ips
         FROM cowrie_unique_creds
         ${where}
         ORDER BY COALESCE(total_events, 0) DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM cowrie_unique_creds ${where}`, params),
    ]);

    const payload = { rows: list.rows, total: Number(count.rows[0]?.total || 0) };
    setCachedLeaderboard(cacheKey, payload);
    res.json(payload);
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
  const { limit, offset, search, like } = parseListParams(req, {
    defaultLimit: LIMITS.DEFAULT_FILES,
    maxLimit: LIMITS.MAX_FILES,
  });

  const cacheKey = `files:${limit}:${offset}:${search}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    // cowrie_files_agg is a pre-aggregated, trigger-maintained mirror of
    // cowrie_files (see db/migrations/004_add_cowrie_files_agg.sql), so this
    // is an indexed LIMIT instead of a GROUP BY/DISTINCT ON over every
    // download ever recorded. Search covers the hash and the VirusTotal file
    // type/magic, which is what you actually have to hand when hunting.
    const where = like
      ? `WHERE sha256 ILIKE $1 ESCAPE '\\' OR vt_type ILIKE $1 ESCAPE '\\' OR vt_magic ILIKE $1 ESCAPE '\\'`
      : '';
    const params = like ? [like] : [];

    const [list, count] = await Promise.all([
      pool.query(
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
         ${where}
         ORDER BY first_seen DESC NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM cowrie_files_agg ${where}`, params),
    ]);

    const payload = { rows: list.rows, total: Number(count.rows[0]?.total || 0) };
    setCachedLeaderboard(cacheKey, payload);
    res.json(payload);
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
  const { limit, offset, search, like } = parseListParams(req, {
    defaultLimit: LIMITS.DEFAULT_ASN,
    maxLimit: LIMITS.MAX_ASN,
  });

  const cacheKey = `top-asn:${limit}:${offset}:${search}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    // cowrie_asn_agg is a trigger-maintained aggregate (see
    // db/migrations/006_add_leaderboard_aggs.sql); the previous GROUP BY over
    // all of cowrie_events took 60s+ and starved the connection pool.
    // Search matches the network name or the AS number itself.
    const where = like ? `WHERE org ILIKE $1 ESCAPE '\\' OR asn::text ILIKE $1 ESCAPE '\\'` : '';
    const params = like ? [like] : [];

    const [list, count] = await Promise.all([
      pool.query(
        `SELECT
           asn,
           org,
           total,
           unique_ips
         FROM cowrie_asn_agg
         ${where}
         ORDER BY total DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM cowrie_asn_agg ${where}`, params),
    ]);

    const payload = { rows: list.rows, total: Number(count.rows[0]?.total || 0) };
    setCachedLeaderboard(cacheKey, payload);
    res.json(payload);
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
    // cowrie_country_agg is a trigger-maintained aggregate (see
    // db/migrations/006_add_leaderboard_aggs.sql); the previous GROUP BY over
    // all of cowrie_events took 60s+ and starved the connection pool.
    const { rows } = await pool.query(
      `SELECT
         country_iso,
         total,
         unique_ips
       FROM cowrie_country_agg
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

// ============================================================================
// Public Endpoints - Session Drill-down
// ============================================================================

/**
 * GET /api/public/cowrie/sessions
 *
 * Recent attacker sessions, one row per session_id, newest first. Every event
 * already carries a session_id; grouping by it turns the flat event stream
 * back into individual visits.
 *
 * Query parameters:
 *   - limit:  sessions to return (default: 50, max: 200)
 *   - offset: pagination offset
 *   - hours:  lookback window (default: 24, max: 168)
 *   - search: match on source IP, country or username
 *
 * Response: { rows: Array<SessionSummary>, total: number }
 */
app.get('/api/public/cowrie/sessions', async (req, res) => {
  const { limit, offset, search, like } = parseListParams(req, {
    defaultLimit: LIMITS.DEFAULT_SESSIONS,
    maxLimit: LIMITS.MAX_SESSIONS,
  });

  const rawHours = parseInt(req.query.hours, 10);
  const hours = Math.min(
    Math.max(Number.isFinite(rawHours) ? rawHours : LIMITS.DEFAULT_HOURS_LOOKBACK, 1),
    LIMITS.MAX_HOURS_LOOKBACK
  );
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const cacheKey = `sessions:${limit}:${offset}:${hours}:${search}`;
  const cached = getCachedLeaderboard(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Bounded by the timestamp index, so this stays cheap regardless of how
    // large cowrie_events grows.
    // host() strips the /32 that inet::text would add, so a search for
    // "1.2.3.4" matches and the value is displayable as-is.
    const filter = like
      ? `AND (host(src_ip) ILIKE $2 ESCAPE '\\' OR country_iso ILIKE $2 ESCAPE '\\' OR username ILIKE $2 ESCAPE '\\')`
      : '';
    const params = like ? [since, like] : [since];

    const grouped = `
      SELECT
        session_id,
        MIN(timestamp)                                        AS started_at,
        MAX(timestamp)                                        AS ended_at,
        COUNT(*)                                              AS events,
        host(MIN(src_ip))                                     AS src_ip,
        MIN(country_iso)                                      AS country_iso,
        MIN(city)                                             AS city,
        MIN(asn)                                              AS asn,
        MIN(org)                                              AS org,
        COUNT(*) FILTER (WHERE command IS NOT NULL AND command <> '')   AS commands,
        COUNT(*) FILTER (WHERE username IS NOT NULL AND username <> '') AS logins
      FROM cowrie_events
      WHERE timestamp >= $1 AND session_id IS NOT NULL ${filter}
      GROUP BY session_id`;

    const [list, count] = await Promise.all([
      pool.query(
        `${grouped} ORDER BY started_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM (${grouped}) s`, params),
    ]);

    const payload = {
      rows: list.rows.map((r) => ({
        ...r,
        events: Number(r.events),
        commands: Number(r.commands),
        logins: Number(r.logins),
        duration_ms: new Date(r.ended_at) - new Date(r.started_at),
      })),
      total: Number(count.rows[0]?.total || 0),
      hours,
    };
    setCachedLeaderboard(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('Error in /api/public/cowrie/sessions:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

/**
 * GET /api/public/cowrie/sessions/:id
 *
 * The full ordered timeline for one session: connect, credentials tried,
 * commands run. Served by idx_cowrie_events_session_id (migration 007).
 *
 * Response: { session: {...}, events: Array<Event> }
 */
app.get('/api/public/cowrie/sessions/:id', async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.slice(0, 64) : '';
  if (!id) return res.status(400).json({ error: 'Invalid session id' });

  try {
    const { rows } = await pool.query(
      `SELECT
         timestamp,
         src_ip,
         dest_port,
         username,
         password,
         command,
         country_iso,
         city,
         asn,
         org
       FROM cowrie_events
       WHERE session_id = $1
       ORDER BY timestamp ASC
       LIMIT $2`,
      [id, LIMITS.MAX_SESSION_EVENTS]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    res.json({
      session: {
        session_id: id,
        src_ip: first.src_ip,
        country_iso: first.country_iso,
        city: first.city,
        asn: first.asn,
        org: first.org,
        started_at: first.timestamp,
        ended_at: last.timestamp,
        duration_ms: new Date(last.timestamp) - new Date(first.timestamp),
        events: rows.length,
        truncated: rows.length === LIMITS.MAX_SESSION_EVENTS,
      },
      // Tag commands the same way the commands panel does, so a session
      // timeline shows which techniques the attacker actually used.
      events: rows.map((r) => ({ ...r, tags: r.command ? tagCommand(r.command) : [] })),
    });
  } catch (err) {
    console.error('Error in /api/public/cowrie/sessions/:id:', err);
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
