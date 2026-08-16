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

    // Client fingerprints and tunnel requests ride the same endpoint, tagged
    // with `kind`, rather than getting routes of their own. A new route would
    // 404 for any forwarder that reached it before the backend was updated,
    // and post_batch only parks 400/413/422 — a 404 retries forever, which
    // would stall the forwarder's single loop and stop ingestion entirely.
    // An unknown field, by contrast, is simply ignored by an older backend.
    const clientRows = events.filter((ev) => ev.kind === 'client');
    const tunnelRows = events.filter((ev) => ev.kind === 'tunnel');
    const plainEvents = events.filter((ev) => !ev.kind);

    // Use a transaction to ensure atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Bulk insert for better performance
      const values = [];
      const placeholders = [];
      const commandRows = [];
      const credsRows = [];

      plainEvents.forEach((ev, idx) => {
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

      if (clientRows.length > 0) {
        // cowrie.client.version and cowrie.client.kex are two log lines for one
        // session and arrive in either order, so upsert and COALESCE: whichever
        // lands second must not null out what the first recorded. EXCLUDED
        // first, so a genuine later correction still wins over a stale value.
        const bySession = new Map();
        for (const ev of clientRows) {
          if (!ev.session_id) continue;
          const prev = bySession.get(ev.session_id) || {
            session_id: ev.session_id,
            first_seen: ev.timestamp,
            src_ip: ev.src_ip,
            client_version: null,
            hassh: null,
          };
          if (ev.client_version) prev.client_version = ev.client_version;
          if (ev.hassh) prev.hassh = ev.hassh;
          if (ev.timestamp && ev.timestamp < prev.first_seen) prev.first_seen = ev.timestamp;
          if (!prev.src_ip && ev.src_ip) prev.src_ip = ev.src_ip;
          bySession.set(ev.session_id, prev);
        }

        const fpValues = [];
        const fpPlaceholders = [];
        let fIdx = 0;
        for (const [, c] of bySession) {
          const geo = lookupGeo(c.src_ip) || {};
          const offset = fIdx * 8;
          fpPlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
          );
          fpValues.push(
            c.session_id,
            c.first_seen || new Date().toISOString(),
            c.src_ip || null,
            c.client_version,
            c.hassh,
            geo.country_iso || null,
            geo.asn || null,
            geo.org || null
          );
          fIdx++;
        }

        if (fpPlaceholders.length > 0) {
          await client.query(
            `INSERT INTO cowrie_client_fingerprints
               (session_id, first_seen, src_ip, client_version, hassh, country_iso, asn, org)
             VALUES ${fpPlaceholders.join(', ')}
             ON CONFLICT (session_id) DO UPDATE
             SET client_version = COALESCE(EXCLUDED.client_version, cowrie_client_fingerprints.client_version),
                 hassh          = COALESCE(EXCLUDED.hassh, cowrie_client_fingerprints.hassh),
                 src_ip         = COALESCE(cowrie_client_fingerprints.src_ip, EXCLUDED.src_ip),
                 first_seen     = LEAST(cowrie_client_fingerprints.first_seen, EXCLUDED.first_seen)`,
            fpValues
          );
        }
      }

      if (tunnelRows.length > 0) {
        const tValues = [];
        const tPlaceholders = [];
        let tIdx = 0;
        for (const ev of tunnelRows) {
          if (!ev.dst_host) continue;   // the destination is the whole point
          const geo = lookupGeo(ev.src_ip) || {};
          const offset = tIdx * 8;
          tPlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
          );
          tValues.push(
            ev.timestamp || new Date().toISOString(),
            ev.session_id || null,
            ev.src_ip || null,
            String(ev.dst_host).slice(0, 255),
            Number.isFinite(Number(ev.dst_port)) ? Number(ev.dst_port) : null,
            geo.country_iso || null,
            geo.asn || null,
            geo.org || null
          );
          tIdx++;
        }

        if (tPlaceholders.length > 0) {
          await client.query(
            `INSERT INTO cowrie_tunnel_requests
               (timestamp, session_id, src_ip, dst_host, dst_port, country_iso, asn, org)
             VALUES ${tPlaceholders.join(', ')}`,
            tValues
          );
        }
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
