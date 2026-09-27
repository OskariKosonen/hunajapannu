/**
 * Liveness plus ingest freshness.
 *
 * "The service is up" was not enough: on 2026-08-11 the API, the database and
 * both sensor services all looked healthy for four days while no events were
 * arriving at all.
 */

const fs = require('node:fs/promises');

const { pool } = require('../db');
const { assessIngest } = require('../lib/health');
const { assessDisk } = require('../lib/disk');
const {
  INGEST_STALE_AFTER_SECONDS,
  CLOCK_SKEW_TOLERANCE_SECONDS,
  DISK_PATH,
  DISK_LOW_FREE_MB,
} = require('../config');

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

      // statfs is cheap (one syscall, no I/O) so there is no reason to cache
      // it. Wrapped because a health endpoint that throws on an unrelated
      // filesystem problem is worse than one that reports the disk as
      // unknown — the ingest verdict above is the part that must always work.
      let statfs = null;
      try {
        statfs = await fs.statfs(DISK_PATH);
      } catch (err) {
        console.error('statfs failed for', DISK_PATH, err.message);
      }
      const disk = assessDisk(statfs, { lowFreeMb: DISK_LOW_FREE_MB });

      // Still HTTP 200 when only ingestion is stale: the service itself is
      // healthy, and failing this would make deploys fail for an unrelated
      // reason. Alerting keys on the ingestStale flag instead.
      res.json({
        ...ingest,
        ...disk,
        // Low disk degrades the verdict for the same reason stale ingest
        // does: the service answers requests while heading for an outage.
        status: ingest.status === 'ok' && disk.diskLow ? 'degraded' : ingest.status,
        db: 'connected',
        staleAfterSeconds: INGEST_STALE_AFTER_SECONDS,
        diskLowFreeMb: DISK_LOW_FREE_MB,
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
