/**
 * Cowrie honeypot API.
 *
 * This file used to be 1,655 lines holding every route, the connection pool,
 * GeoIP, the caches and the shutdown handling in one module scope. Nothing in
 * it was badly written, but everything was welded to that scope: unit tests
 * needed logic extracted before it could be reached at all, an unbounded cache
 * sat unnoticed in the middle of it, and the one route-ordering constraint in
 * the codebase was invisible.
 *
 * What is left here is the wiring: build the app, apply middleware, mount the
 * routes in order, start, stop.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { RATE_LIMIT_CONFIG, PORT } = require('./config');
const { pool } = require('./db');
const { initGeoIP } = require('./geo');

const registerIngestRoutes = require('./routes/ingest');
const registerHealthRoutes = require('./routes/health');
const registerActivityRoutes = require('./routes/activity');
const registerLeaderboardRoutes = require('./routes/leaderboards');
const registerPasswordRoutes = require('./routes/passwords');
const registerIocRoutes = require('./routes/iocs');
const registerSessionRoutes = require('./routes/sessions');
const registerInfrastructureRoutes = require('./routes/infrastructure');
const registerSummaryRoutes = require('./routes/summary');

// ============================================================================
// Application Setup
// ============================================================================

const app = express();
app.set('trust proxy', 1);   // trust one proxy hop (Cloudflare/nginx)
app.use(express.json());

// Apply rate limiting to all public endpoints
const publicLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.WINDOW_MS,
  max: RATE_LIMIT_CONFIG.MAX_REQUESTS,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/public/', publicLimiter);

// ============================================================================
// Routes
// ============================================================================
//
// Order is not arbitrary. registerSessionRoutes puts /sessions/featured ahead
// of /sessions/:id internally, because Express would otherwise match
// "featured" as a session id. Keeping both in one module is what makes that
// constraint reviewable.

registerIngestRoutes(app);
registerHealthRoutes(app);
registerActivityRoutes(app);
registerLeaderboardRoutes(app);
registerPasswordRoutes(app);
registerIocRoutes(app);
registerSessionRoutes(app);
registerInfrastructureRoutes(app);
registerSummaryRoutes(app);

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Gracefully shuts down the server on SIGTERM/SIGINT.
 * Ensures database connections are properly closed.
 */
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    await pool.end();
    console.log('Database connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================================
// Server Startup
// ============================================================================

/**
 * Initializes the server by loading GeoIP databases and starting Express.
 * If GeoIP initialization fails, the server continues without geo enrichment.
 */
(async () => {
  // Initialize GeoIP databases (non-blocking if it fails)
  await initGeoIP();

  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Cowrie API server listening on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
  });
})();
