/**
 * The authenticated write path: the forwarder posting captured events and
 * file metadata. The only non-read-only routes in the API.
 */

const { createHash } = require('node:crypto');

const { pool } = require('../db');
const { lookupGeo } = require('../geo');
const { LIMITS, API_KEY } = require('../config');
const { normalizeCommand } = require('../lib/normalize');
const { classifyCommand } = require('../lib/record-class');
const { extractIocs } = require('../lib/iocs');
const { extractPeers } = require('../lib/peers');

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
      const credsRows = [];
      // command -> template, deduped across the batch. Keyed on the command
      // text rather than its hash so a batch of a thousand events repeating
      // one command hashes it once, not a thousand times — commands here run
      // to tens of kilobytes.
      const templateRows = new Map();

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


        if (ev.command && !templateRows.has(ev.command)) {
          templateRows.set(ev.command, normalizeCommand(ev.command));
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

      // cowrie_unique_commands rows are created by trg_sync_cowrie_event_aggs
      // (migration 011), not from here. They used to be upserted in this
      // transaction keyed on the command text, which capped it at the 2704-byte
      // btree limit and silently dropped the longest commands — 44 of the 45
      // over 2000 bytes, including 33 /dev/tcp loader lines. The trigger keys on
      // sha256(command) instead, so length no longer decides what gets recorded.
      //
      // The two things the trigger cannot fill in are command_template
      // (migration 012) and record_class (migration 013). Both are defined in
      // JavaScript, and reimplementing either in plpgsql would put the same
      // rules in two places, where they drift — a drifted normalizer splits
      // one campaign across two templates, a drifted classifier hides real
      // commands from every endpoint, and neither errors. So the rows arrive
      // from the trigger with a NULL template and record_class 'unknown', and
      // are completed here in the same transaction. Doing it only in the batch
      // backfills would leave every newly seen command untemplated and
      // unclassified — and 'unknown' is filtered out by default, so a new
      // command would be invisible until someone remembered to re-run them.
      if (templateRows.size > 0) {
        const hashes = [];
        const templates = [];
        const classes = [];
        for (const [command, template] of templateRows) {
          // Must match sha256(convert_to(command, 'UTF8')) as computed by the
          // trigger in migration 011, or the join finds nothing.
          const hash = createHash('sha256').update(command, 'utf8').digest('hex');
          hashes.push(hash);
          templates.push(template);
          classes.push(classifyCommand(command, hash));
        }
        // Hex text rather than an array of Buffers: bytea[] serialisation
        // depends on driver internals, decode() does not.
        //
        // IS DISTINCT FROM matters more here than it looks. Batches repeat the
        // same handful of commands endlessly, so without it nearly every row
        // touched would be rewritten to the value it already holds — dead
        // tuples on the busiest table in the schema, forever.
        await client.query(
          `UPDATE cowrie_unique_commands u
              SET command_template = v.tpl,
                  record_class     = v.cls::cowrie_record_class
             FROM unnest($1::text[], $2::text[], $3::text[]) AS v(h, tpl, cls)
            WHERE u.command_sha256 = decode(v.h, 'hex')
              AND (u.command_template IS DISTINCT FROM v.tpl
                OR u.record_class   IS DISTINCT FROM v.cls::cowrie_record_class)`,
          [hashes, templates, classes]
        );

        // Indicators, extracted from the same batch. Doing this only in the
        // backfill would mean a newly seen C2 address is absent from the
        // public feed until someone remembers to run a script, which for a
        // live indicator feed is the whole value gone.
        //
        // Extracted from the raw command, never the template: templatization
        // replaces exactly the fields that are indicators.
        //
        // Deduplicated across the batch on (type, value). Two commands in one
        // batch can carry the same C2 address, and feeding both to
        // INSERT ... ON CONFLICT DO UPDATE raises "cannot affect row a second
        // time" — a hard error on the write path, which is the last place
        // this project wants one.
        const byIoc = new Map();
        const pairs = [];
        for (const [command] of templateRows) {
          const hash = createHash('sha256').update(command, 'utf8').digest('hex');
          for (const ioc of extractIocs(command)) {
            const key = `${ioc.type}\u0000${ioc.value}`;
            if (!byIoc.has(key)) byIoc.set(key, { type: ioc.type, value: ioc.value, meta: ioc.meta || {} });
            pairs.push({ hash, type: ioc.type, value: ioc.value });
          }
        }

        if (byIoc.size > 0) {
          const rows = [...byIoc.values()];
          // Two statements, not one CTE. Every branch of a data-modifying CTE
          // sees the same snapshot, so an UPDATE in the same statement cannot
          // see rows its own INSERT just created — the first version of this
          // left every newly seen indicator on occurrence_count 0 and looked
          // like it worked.
          await client.query(
            `INSERT INTO cowrie_iocs (ioc_type, value, meta, first_seen, last_seen, occurrence_count)
             SELECT v.t::cowrie_ioc_type, v.val, v.meta::jsonb, now(), now(), 0
               FROM unnest($1::text[], $2::text[], $3::text[]) AS v(t, val, meta)
             ON CONFLICT (ioc_type, value_sha256) DO UPDATE SET
               last_seen = GREATEST(cowrie_iocs.last_seen, EXCLUDED.last_seen)`,
            [
              rows.map((r) => r.type),
              rows.map((r) => r.value),
              rows.map((r) => JSON.stringify(r.meta)),
            ]
          );

          // Now the indicators exist, so this statement can see them. The
          // count rises only when the (indicator, command) pair is new, which
          // is what makes it "distinct commands" rather than "sightings" —
          // the same device migration 011 uses for unique_ips.
          await client.query(
            `WITH paired AS (
               INSERT INTO cowrie_ioc_commands (ioc_id, command_id)
               SELECT i.id, u.id
                 FROM unnest($1::text[], $2::text[], $3::text[]) AS v(h, t, val)
                 JOIN cowrie_unique_commands u ON u.command_sha256 = decode(v.h, 'hex')
                 JOIN cowrie_iocs i
                   ON i.ioc_type = v.t::cowrie_ioc_type
                  AND i.value_sha256 = sha256(convert_to(v.val, 'UTF8'))
               ON CONFLICT DO NOTHING
               RETURNING ioc_id
             )
             UPDATE cowrie_iocs c
                SET occurrence_count = c.occurrence_count + n.added
               FROM (SELECT ioc_id, count(*) AS added FROM paired GROUP BY ioc_id) n
              WHERE c.id = n.ioc_id`,
            [
              pairs.map((r) => r.hash),
              pairs.map((r) => r.type),
              pairs.map((r) => r.value),
            ]
          );
        }

        // Panchan bootstrap peers (migration 015). Same reasoning as the
        // indicators above: a mesh node first seen today should appear today,
        // not whenever someone next runs a backfill.
        const peerByIp = new Map();
        const peerPairs = [];
        const launches = [];
        for (const [command] of templateRows) {
          const { isSpreader, peers } = extractPeers(command);
          if (!isSpreader) continue;
          const hash = createHash('sha256').update(command, 'utf8').digest('hex');
          // Launches with no peers are recorded too. 46 of 163 pass none and
          // fall back to the binary's embedded list; keeping only the
          // populated ones would overstate how often a fresh set is shipped.
          launches.push({ hash, count: peers.length });
          for (const ip of peers) {
            if (!peerByIp.has(ip)) peerByIp.set(ip, lookupGeo(ip) || {});
            peerPairs.push({ hash, ip });
          }
        }

        if (peerByIp.size > 0) {
          const ips = [...peerByIp.keys()];
          await client.query(
            `INSERT INTO cowrie_botnet_peers
                    (peer_ip, first_seen, last_seen, country_iso, asn, org, city, list_count)
             SELECT v.ip::inet, now(), now(), v.cc, NULLIF(v.asn, '')::int, v.org, v.city, 0
               FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
                 AS v(ip, cc, asn, org, city)
             ON CONFLICT (peer_ip) DO UPDATE SET
               last_seen   = GREATEST(cowrie_botnet_peers.last_seen, EXCLUDED.last_seen),
               country_iso = COALESCE(EXCLUDED.country_iso, cowrie_botnet_peers.country_iso),
               asn         = COALESCE(EXCLUDED.asn, cowrie_botnet_peers.asn),
               org         = COALESCE(EXCLUDED.org, cowrie_botnet_peers.org),
               city        = COALESCE(EXCLUDED.city, cowrie_botnet_peers.city)`,
            [
              ips,
              ips.map((ip) => peerByIp.get(ip).country_iso || null),
              ips.map((ip) => (peerByIp.get(ip).asn != null ? String(peerByIp.get(ip).asn) : '')),
              ips.map((ip) => peerByIp.get(ip).org || null),
              ips.map((ip) => peerByIp.get(ip).city || null),
            ]
          );

          // Separate statement, for the reason the indicator path is two: a
          // data-modifying CTE cannot see rows its own INSERT just created.
          await client.query(
            `WITH paired AS (
               INSERT INTO cowrie_peer_commands (peer_id, command_id)
               SELECT p.id, u.id
                 FROM unnest($1::text[], $2::text[]) AS v(h, ip)
                 JOIN cowrie_unique_commands u ON u.command_sha256 = decode(v.h, 'hex')
                 JOIN cowrie_botnet_peers p ON p.peer_ip = v.ip::inet
               ON CONFLICT DO NOTHING
               RETURNING peer_id
             )
             UPDATE cowrie_botnet_peers p
                SET list_count = p.list_count + n.added
               FROM (SELECT peer_id, count(*) AS added FROM paired GROUP BY peer_id) n
              WHERE p.id = n.peer_id`,
            [peerPairs.map((r) => r.hash), peerPairs.map((r) => r.ip)]
          );
        }

        if (launches.length > 0) {
          await client.query(
            `INSERT INTO cowrie_peer_lists (command_id, peer_count, first_seen, last_seen)
             SELECT u.id, v.n::int, now(), now()
               FROM unnest($1::text[], $2::text[]) AS v(h, n)
               JOIN cowrie_unique_commands u ON u.command_sha256 = decode(v.h, 'hex')
             ON CONFLICT (command_id) DO UPDATE SET
               peer_count = EXCLUDED.peer_count,
               last_seen  = GREATEST(cowrie_peer_lists.last_seen, EXCLUDED.last_seen)`,
            [launches.map((l) => l.hash), launches.map((l) => String(l.count))]
          );
        }
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
