/**
 * One session's timeline, and the busiest recent session.
 *
 * The browsable session list that used to live here is gone; what remains is
 * reached from the front-page replay, which links through to the full
 * timeline of the session it is replaying.
 *
 * Registration order matters here and is the reason these live together:
 * /sessions/featured must be registered before /sessions/:id, or Express
 * matches "featured" as an id and the front page gets a 404.
 */

const { pool } = require('../db');
const { LIMITS } = require('../config');
const { tagCommand } = require('../lib/mitre');
const { cached } = require('../cache');
const { pickFeatured } = require('../lib/featured');

module.exports = function registerSessionRoutes(app) {
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

    try {
      const payload = await cached(cacheKey, async () => {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        // Bounded by idx_events_timestamp: a week is tens of thousands of rows,
        // not the 7.7M-row scan that used to starve the pool.
        //
        // Shortlist, then let pickFeatured() choose the one that tells a story
        // (lib/featured.js). Sessions that download something come first: a
        // shortlist ordered by command count alone was all scripted probes,
        // and a short real attack (log in, look around, fetch, run) never made
        // it onto the list to be scored.
        const { rows: shortlist } = await pool.query(
          `SELECT session_id
           FROM cowrie_events
           WHERE timestamp >= $1 AND session_id IS NOT NULL
             AND command IS NOT NULL AND command <> ''
           GROUP BY session_id
           ORDER BY BOOL_OR(command ~* '(wget|curl|tftp)\\s') DESC,
                    COUNT(DISTINCT command) DESC
           LIMIT 300`,
          [since]
        );

        let chosen = null;
        if (shortlist.length > 0) {
          const ids = shortlist.map((r) => r.session_id);
          const { rows: cmds } = await pool.query(
            `SELECT session_id, command
             FROM cowrie_events
             WHERE session_id = ANY($1) AND command IS NOT NULL AND command <> ''`,
            [ids]
          );
          const bySession = new Map(ids.map((id) => [id, []]));
          for (const r of cmds) bySession.get(r.session_id)?.push(r.command);
          chosen = pickFeatured(ids.map((id) => ({ session_id: id, commands: bySession.get(id) })));
        }

        if (!chosen) {
          // A quiet week with nothing readable: fall back to the session that
          // ran the most distinct commands, whatever they were. Distinct, not
          // raw count, because some sessions were ingested more than once.
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
          chosen = rows[0]?.session_id ?? null;
        }

        // Null rather than a 404 from in here: this runs inside the cache
        // producer, so returning a response object would both cache it and
        // send the reply twice. Returning null caches nothing, which is what
        // we want — a quiet week should be re-checked, not remembered for a
        // minute.
        if (!chosen) return null;
        return loadSessionTimeline(chosen);
      });

      // A quiet week is not an error; the client hides the panel.
      if (!payload) {
        return res.status(404).json({ error: 'No session with commands in this window' });
      }
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
