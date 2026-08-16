/**
 * k-anonymous password lookup: the caller sends three hex characters of a
 * SHA-256 and matches the returned suffixes locally, so the password itself
 * never reaches this server.
 */

const { pool } = require('../db');

module.exports = function registerPasswordRoutes(app) {
  app.get('/api/public/cowrie/passwords/range/:prefix', async (req, res) => {
    const raw = typeof req.params.prefix === 'string' ? req.params.prefix.toLowerCase() : '';
    // Exactly three hex characters. Anything else is a client bug or a probe;
    // rejecting keeps the query bounded to one index lookup. A longer prefix is
    // refused rather than accepted: it would shrink the anonymity set, which is
    // the one property this endpoint exists to provide.
    if (!/^[0-9a-f]{3}$/.test(raw)) {
      return res.status(400).json({ error: 'prefix must be 3 hexadecimal characters' });
    }

    try {
      // Index scan on idx_cowrie_unique_creds_pwhash_prefix3 (migration 009).
      // Deliberately uncached: the key space is a million prefixes, so caching
      // it would grow without bound for no benefit over an index lookup.
      const { rows } = await pool.query(
        `SELECT
           password_sha256                                            AS hash,
           COUNT(*)                                                   AS pairs,
           COALESCE(SUM(total_events), 0)                             AS attempts,
           (array_agg(DISTINCT username))[1:5]                        AS usernames
         FROM cowrie_unique_creds
         WHERE left(password_sha256, 3) = $1
         GROUP BY password_sha256
         ORDER BY attempts DESC
         LIMIT 2000`,
        [raw]
      );

      res.json({
        prefix: raw,
        results: rows.map((r) => ({
          suffix: String(r.hash).slice(3),
          pairs: Number(r.pairs),
          attempts: Number(r.attempts),
          usernames: r.usernames || [],
        })),
      });
    } catch (err) {
      // Never echo the prefix into logs alongside an error payload.
      console.error('Error in /api/public/cowrie/passwords/range:', err.message);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

  // ============================================================================
  // Public Endpoints - File Download Statistics
  // ============================================================================

  /**
   * GET /api/public/cowrie/files
   *
   * Returns aggregated statistics for files downloaded through the honeypot.
   * Useful for malware analysis and understanding attacker toolkits.
   *
   * Query parameters:
   *   - limit: maximum number of files to return (default: 50, max: 500)
   *
   * Response: Array<{
   *   sha256: string,
   *   size_bytes: number,
   *   first_seen: timestamp,
   *   vt_last_fetched: timestamp | null,
   *   vt_found: boolean | null,
   *   vt_malicious: number | null,
   *   vt_suspicious: number | null,
   *   vt_harmless: number | null,
   *   vt_undetected: number | null,
   *   vt_timeout: number | null,
   *   vt_reputation: number | null,
   *   vt_type: string | null,
   *   vt_magic: string | null,
   *   vt_first_submission_date: timestamp | null,
   *   vt_last_analysis_date: timestamp | null,
   *   vt_tags: string[] | null
   * }>
   */

};
