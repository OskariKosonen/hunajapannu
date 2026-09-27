/**
 * The two things phases 3 and 5 produced that had no way out of the database.
 *
 * /peers   the Panchan mesh, as observed from one sensor over ten months
 * /probes  commands that look like someone checking whether the box is real
 *
 * Both read tables that are already aggregated, so these are small indexed
 * queries rather than scans, and both are cached like the other leaderboards.
 */

const { pool } = require('../db');
const { getCachedLeaderboard, setCachedLeaderboard } = require('../cache');
const { THRESHOLD } = require('../lib/honeypot-probe');

module.exports = function registerBotnetRoutes(app) {
  /**
   * GET /api/public/cowrie/peers
   *
   * Bootstrap peers the worm was handed, most persistent first. Recurrence is
   * the signal worth ranking on: most addresses appear in a single list, while
   * a small core has been handed out for the better part of a year, and those
   * are the nodes that are actually holding the mesh together.
   */
  app.get('/api/public/cowrie/peers', async (req, res) => {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 500);

    const cacheKey = `peers:${limit}`;
    const cached = getCachedLeaderboard(cacheKey);
    if (cached) return res.json(cached);

    try {
      const [peers, summary] = await Promise.all([
        pool.query(
          `SELECT host(peer_ip) AS peer_ip, list_count, country_iso, asn, org, city,
                  first_seen, last_seen
             FROM cowrie_botnet_peers
            ORDER BY list_count DESC, last_seen DESC
            LIMIT $1`,
          [limit]
        ),
        // The denominators. Without them a reader cannot tell whether "41
        // lists" is remarkable, and the empty-list count is the only place the
        // 46 launches that shipped no peers are visible at all.
        pool.query(
          `SELECT (SELECT count(*) FROM cowrie_botnet_peers)                        AS peers,
                  (SELECT count(*) FROM cowrie_peer_lists)                          AS lists,
                  (SELECT count(*) FROM cowrie_peer_lists WHERE peer_count = 0)     AS empty_lists,
                  (SELECT min(first_seen) FROM cowrie_botnet_peers)                 AS first_seen,
                  (SELECT max(last_seen) FROM cowrie_botnet_peers)                  AS last_seen,
                  -- The shape of the data is the finding, and a table of rows
                  -- cannot show it: most peers are seen once and a small core
                  -- has been handed out for most of a year.
                  (SELECT count(*) FROM cowrie_botnet_peers WHERE list_count = 1)          AS seen_once,
                  (SELECT count(*) FROM cowrie_botnet_peers WHERE list_count BETWEEN 2 AND 4)  AS seen_few,
                  (SELECT count(*) FROM cowrie_botnet_peers WHERE list_count BETWEEN 5 AND 14) AS seen_some,
                  (SELECT count(*) FROM cowrie_botnet_peers WHERE list_count >= 15)        AS seen_core`
        ),
      ]);

      const s = summary.rows[0] || {};
      const payload = {
        rows: peers.rows.map((r) => ({
          ...r,
          list_count: Number(r.list_count),
          asn: r.asn == null ? null : Number(r.asn),
        })),
        total: Number(s.peers || 0),
        lists: Number(s.lists || 0),
        emptyLists: Number(s.empty_lists || 0),
        firstSeen: s.first_seen || null,
        lastSeen: s.last_seen || null,
        distribution: {
          once: Number(s.seen_once || 0),
          few: Number(s.seen_few || 0),
          some: Number(s.seen_some || 0),
          core: Number(s.seen_core || 0),
        },
      };
      setCachedLeaderboard(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/public/cowrie/peers:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

  /**
   * GET /api/public/cowrie/probes
   *
   * Commands scoring at or above the threshold, with the rules that fired.
   *
   * The threshold is applied here rather than stored, which is what lets it be
   * retuned without re-scoring 1.7M rows, and it is returned in the response so
   * a reader can see which one produced the list.
   */
  app.get('/api/public/cowrie/probes', async (req, res) => {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 500);
    const rawMin = parseInt(req.query.min_score, 10);
    const minScore = Math.min(Math.max(Number.isFinite(rawMin) ? rawMin : THRESHOLD, 1), 100);

    const cacheKey = `probes:${limit}:${minScore}`;
    const cached = getCachedLeaderboard(cacheKey);
    if (cached) return res.json(cached);

    try {
      const { rows } = await pool.query(
        `SELECT command, probe_score, probe_rules,
                COALESCE(total_events, 0) AS total, COALESCE(unique_ips, 0) AS unique_ips,
                first_seen, last_seen
           FROM cowrie_unique_commands
          WHERE record_class = 'command' AND probe_score >= $1
          ORDER BY probe_score DESC, COALESCE(total_events, 0) DESC
          LIMIT $2`,
        [minScore, limit]
      );

      const payload = {
        threshold: THRESHOLD,
        minScore,
        rows: rows.map((r) => ({
          ...r,
          probe_score: Number(r.probe_score),
          total: Number(r.total),
          unique_ips: Number(r.unique_ips),
        })),
        total: rows.length,
      };
      setCachedLeaderboard(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/public/cowrie/probes:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });
};
