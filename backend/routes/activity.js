/**
 * Raw activity: the hourly histogram, the live event tail, and the
 * new-versus-returning IP split. All bounded by idx_events_timestamp.
 */

const { pool } = require('../db');
const { LIMITS } = require('../config');
const { getCachedLeaderboard, setCachedLeaderboard } = require('../cache');

module.exports = function registerActivityRoutes(app) {
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
};
