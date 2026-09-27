/**
 * The ranked slices: techniques, commands, credentials, malware samples and
 * origin networks/countries.
 *
 * Every one of these reads a trigger-maintained aggregate rather than
 * grouping over cowrie_events. Before that, two of these queries could
 * saturate the connection pool and take the whole API down with them.
 */

const { pool } = require('../db');
const { LIMITS } = require('../config');
const { parseListParams } = require('../lib/params');
const { MITRE_SIGNATURES, MITRE_IDS, tagCommand } = require('../lib/mitre');
const { cached } = require('../cache');
const { classFilterSql, parseClassParam } = require('../lib/record-class');

module.exports = function registerLeaderboardRoutes(app) {
  app.get('/api/public/cowrie/mitre', (_req, res) => {
    res.json(MITRE_SIGNATURES.map(({ id, name, description }) => ({ id, name, description })));
  });

  /**
   * One row per unique command (3.7k after nine months), so the whole tagged set
   * fits comfortably in memory. Caching it here means search, technique filter,
   * pagination and the global technique counts are all served without a query,
   * and the browser receives only the page it renders instead of every row.
   */
  // Keyed by record class, because ?class=all and ?class=log_artifact are
  // different result sets and must not share one cached snapshot.
  const getCommandsSnapshot = (recordClass) =>
    cached(`commands:${recordClass}`, () => buildCommandsSnapshot(recordClass));

  async function buildCommandsSnapshot(recordClass) {
    // idx_cowrie_unique_commands_cmd_total is partial on record_class =
    // 'command', so this reads ~4k index entries instead of scanning 1.7M
    // rows through a 21-clause NOT LIKE predicate.
    const { rows } = await pool.query(
      `SELECT
         command,
         command_template,
         record_class,
         first_seen,
         last_seen,
         COALESCE(total_events, 0) AS total,
         COALESCE(unique_ips, 0) AS unique_ips
       FROM cowrie_unique_commands
       WHERE ${classFilterSql(recordClass)}
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

    return { rows: tagged, counts };
  }

  app.get('/api/public/cowrie/commands', async (req, res) => {
    const { limit, offset, search } = parseListParams(req, {
      defaultLimit: LIMITS.DEFAULT_COMMANDS,
      maxLimit: LIMITS.MAX_COMMANDS,
    });
    const tag = typeof req.query.tag === 'string' && MITRE_IDS.has(req.query.tag) ? req.query.tag : null;
    // Defaults to real commands. ?class=all or a named class opts in to the
    // Cowrie log messages, which are 99.76% of the table and were what the
    // leaderboard accidentally served for 25 minutes after the Phase 0
    // backfill — "Remote SSH version: SSH-2.0-Go", 756,238 hits, top of the
    // chart. Deliberate is fine; default is not.
    const recordClass = parseClassParam(req.query.class);

    try {
      const snapshot = await getCommandsSnapshot(recordClass);

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
        recordClass,
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

    try {
      const payload = await cached(cacheKey, async () => {
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

        return { rows: list.rows, total: Number(count.rows[0]?.total || 0) };
      });
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

  /**
   * GET /api/public/cowrie/passwords/range/:prefix
   *
   * k-anonymous password lookup, the model Have I Been Pwned uses.
   *
   * The caller hashes a password with SHA-256 and sends only the first three hex
   * characters. This returns every stored hash sharing that prefix, as suffixes,
   * and the caller finds its own match locally. The password itself never
   * reaches this server and is never logged.
   *
   * Three characters, not HIBP's five: the prefix has to be sized to the corpus.
   * HIBP holds ~850M hashes so 5 chars hides a caller among ~800 candidates;
   * this corpus holds ~262k, where 5 chars returned exactly one hash — the
   * caller's own — and the anonymity set was a single entry. 3 chars gives 4,096
   * buckets and ~64 candidates, so the server cannot tell which was asked for.
   *
   * Response: { prefix, results: [{ suffix, pairs, attempts, usernames }] }
   */

  app.get('/api/public/cowrie/files', async (req, res) => {
    const { limit, offset, search, like } = parseListParams(req, {
      defaultLimit: LIMITS.DEFAULT_FILES,
      maxLimit: LIMITS.MAX_FILES,
    });

    const cacheKey = `files:${limit}:${offset}:${search}`;

    try {
      const payload = await cached(cacheKey, async () => {
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

        return { rows: list.rows, total: Number(count.rows[0]?.total || 0) };
      });
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

    try {
      const payload = await cached(cacheKey, async () => {
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

        return { rows: list.rows, total: Number(count.rows[0]?.total || 0) };
      });
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
  /**
   * GET /api/public/cowrie/iocs
   *
   * Indicators of compromise for the recent window, in the shapes an analyst
   * actually pastes somewhere: plain text one-per-line, CSV, or JSON.
   *
   * Every other endpoint here answers "what does the dashboard render?". This
   * one answers "what can I take away and use?" — which is the only question a
   * SOC analyst looking at someone else's honeypot actually has.
   *
   * Query: ?hours=24&type=ips|hashes&format=json|txt|csv&defang=1
   *
   * defang rewrites 1.2.3.4 as 1.2.3[.]4. That is not decoration: indicators
   * get pasted into tickets, chat and email, and a live-looking IP invites an
   * accidental click or gets rewritten by a link scanner.
   */

  app.get('/api/public/cowrie/top-countries', async (req, res) => {
    const limit = Math.min(
      parseInt(req.query.limit, 10) || LIMITS.DEFAULT_COUNTRIES,
      LIMITS.MAX_COUNTRIES
    );

    const cacheKey = `top-countries:${limit}`;

    try {
      const rows = await cached(cacheKey, async () => {
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

        return rows;
      });
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

};
