/**
 * Session list, one session's timeline, and the busiest recent session.
 *
 * Registration order matters here and is the reason these live together:
 * /sessions/featured must be registered before /sessions/:id, or Express
 * matches "featured" as an id and the front page gets a 404.
 */

const { pool } = require('../db');
const { LIMITS } = require('../config');
const { parseListParams } = require('../lib/params');
const { tagCommand } = require('../lib/mitre');
const { getCachedLeaderboard, setCachedLeaderboard } = require('../cache');

module.exports = function registerSessionRoutes(app) {
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
  async function loadSessionTimeline(id) {
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

    if (rows.length === 0) return null;

    const first = rows[0];
    const last = rows[rows.length - 1];
    return {
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
    };
  }

  /**
   * GET /api/public/cowrie/sessions/featured
   *
   * The busiest session in the recent past, with its full timeline — the same
   * shape as /sessions/:id so the client can treat them identically.
   *
   * The front page replays this. Ordering the normal session list by recency
   * is right for a log but wrong for a showcase: most sessions are a bot
   * connecting, trying one password and leaving, so the newest session is
   * almost always two lines long. This picks the one that actually did
   * something over a wider window.
   *
   * Registered before /sessions/:id, which would otherwise match "featured".
   */
  app.get('/api/public/cowrie/sessions/featured', async (req, res) => {
    const rawHours = parseInt(req.query.hours, 10);
    const hours = Math.min(
      Math.max(Number.isFinite(rawHours) ? rawHours : LIMITS.MAX_HOURS_LOOKBACK, 1),
      LIMITS.MAX_HOURS_LOOKBACK
    );

    const cacheKey = `featured:${hours}`;
    const cached = getCachedLeaderboard(cacheKey);
    if (cached) return res.json(cached);

    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      // Bounded by idx_events_timestamp: a week is tens of thousands of rows,
      // not the 7.7M-row scan that used to starve the pool.
      // Rank by DISTINCT commands, not by how many command rows exist.
      // Ranking by raw count picks whichever session is most duplicated: the
      // first version of this chose a session with 48 events that were twelve
      // exact copies of four commands, which replays as the same four lines
      // over and over. Distinct commands is what "did the most" actually means.
      const { rows } = await pool.query(
        `SELECT session_id
         FROM cowrie_events
         WHERE timestamp >= $1 AND session_id IS NOT NULL
         GROUP BY session_id
         HAVING COUNT(DISTINCT NULLIF(command, '')) > 0
         ORDER BY COUNT(DISTINCT NULLIF(command, '')) DESC,
                  COUNT(*) DESC
         LIMIT 1`,
        [since]
      );

      if (rows.length === 0) {
        // A quiet week is not an error; the client hides the panel.
        return res.status(404).json({ error: 'No session with commands in this window' });
      }

      const payload = await loadSessionTimeline(rows[0].session_id);
      if (!payload) return res.status(404).json({ error: 'Session not found' });

      setCachedLeaderboard(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/public/cowrie/sessions/featured:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

  app.get('/api/public/cowrie/sessions/:id', async (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.slice(0, 64) : '';
    if (!id) return res.status(400).json({ error: 'Invalid session id' });

    try {
      const payload = await loadSessionTimeline(id);
      if (!payload) return res.status(404).json({ error: 'Session not found' });
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/public/cowrie/sessions/:id:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

};
