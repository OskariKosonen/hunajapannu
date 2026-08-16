/**
 * The authenticated write path: the forwarder posting captured events and
 * file metadata. The only non-read-only routes in the API.
 */

const { pool } = require('../db');
const { lookupGeo } = require('../geo');
const { LIMITS, API_KEY } = require('../config');

module.exports = function registerIngestRoutes(app) {
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
};
