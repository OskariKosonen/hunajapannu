/**
 * Liveness plus ingest freshness.
 *
 * "The service is up" was not enough: on 2026-08-11 the API, the database and
 * both sensor services all looked healthy for four days while no events were
 * arriving at all.
 */

const { pool } = require('../db');
const { assessIngest } = require('../lib/health');
const { INGEST_STALE_AFTER_SECONDS, CLOCK_SKEW_TOLERANCE_SECONDS } = require('../config');

module.exports = function registerHealthRoutes(app) {
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

      const ingest = assessIngest(lastEvent, Date.now(), {
        staleAfterSeconds: INGEST_STALE_AFTER_SECONDS,
        skewToleranceSeconds: CLOCK_SKEW_TOLERANCE_SECONDS,
      });

      // Still HTTP 200 when only ingestion is stale: the service itself is
      // healthy, and failing this would make deploys fail for an unrelated
      // reason. Alerting keys on the ingestStale flag instead.
      res.json({
        ...ingest,
        db: 'connected',
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
};
