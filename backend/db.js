const { Pool } = require('pg');

/**
 * PostgreSQL connection pool for the Cowrie honeypot database.
 * Uses connection pooling to efficiently manage database connections.
 */
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'cowrie_user',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'cowrie_db',
  max: 20,                     // Maximum pool size
  idleTimeoutMillis: 30000,    // Close idle clients after 30s
  connectionTimeoutMillis: 5000,
  // A runaway query must not hold a pool connection for a minute while every
  // other request starves waiting for a client (observed in production: two
  // slow leaderboard queries 504'd and took the whole API down with them).
  statement_timeout: 15000,
});

// A dropped idle client would otherwise crash the process; log and move on.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = { pool };
