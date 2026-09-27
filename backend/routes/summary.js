/**
 * The hero figures: 24-hour activity plus lifetime totals.
 *
 * Lifetime numbers come from cowrie_country_agg (roughly 150 rows) rather
 * than an aggregate over 7.7M events.
 */

const { pool } = require('../db');
const { classFilterSql } = require('../lib/record-class');
const { SUMMARY_CACHE_TTL_MS } = require('../config');

module.exports = function registerSummaryRoutes(app) {
  let summaryCache = { data: null, expiresAt: 0 };
  // Single-flight. Without it, every request arriving while the cache is cold
  // starts its own copy of the seven queries below, so the moment the entry
  // expires the database gets a burst of identical work instead of one query.
  // Callers that arrive mid-flight wait on the same promise.
  let inFlight = null;

  function getSummaryStats() {
    if (summaryCache.data && summaryCache.expiresAt > Date.now()) {
      return Promise.resolve(summaryCache.data);
    }
    if (inFlight) return inFlight;

    inFlight = computeSummary()
      .then((data) => {
        // Dated from completion, not from when the request arrived. These
        // queries take a second or two, and dating the entry from before them
        // shortened every TTL by however long the database happened to take.
        summaryCache = { data, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS };
        return data;
      })
      .finally(() => { inFlight = null; });

    return inFlight;
  }

  async function computeSummary() {
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

    // pool.query (not a single checked-out client) so the five queries actually
    // run in parallel — node-postgres serializes queries issued on one client.
    const [eventsAgg, filesAgg, commandsAgg, credsAgg, ipStatsAgg, lifetimeAgg, firstEventAgg] =
      await Promise.all([
      pool.query(
        `SELECT SUM(events_per_hour.events) AS total, MAX(events_per_hour.hour) AS peak_hour, MAX(events_per_hour.events) AS peak_events
         FROM (
           SELECT date_trunc('hour', timestamp) AS hour, COUNT(*) AS events
           FROM cowrie_events
           WHERE timestamp >= $1
           GROUP BY hour
         ) events_per_hour`,
        [twentyFourHoursAgo]
      ),
      // cowrie_files_agg is one row per sha256, so a plain COUNT(*) replaces
      // the COUNT(DISTINCT sha256) scan over every download ever recorded.
      pool.query('SELECT COUNT(*) AS malware_samples FROM cowrie_files_agg'),
      // Index-only count over the partial index: ~4k entries rather than a
      // 1.7M-row scan.
      pool.query(`SELECT COUNT(*) AS unique_commands FROM cowrie_unique_commands
                  WHERE ${classFilterSql('command')}`),
      pool.query(
        'SELECT COUNT(*) AS unique_creds FROM cowrie_unique_creds'
      ),
      pool.query(
        `SELECT COUNT(*) AS total_events, COUNT(DISTINCT src_ip) AS unique_ips
         FROM cowrie_events
         WHERE timestamp >= $1`,
        [twentyFourHoursAgo]
      ),
      // Lifetime totals. The 24h figure alone undersells the sensor: it has
      // been collecting since March. Read from cowrie_country_agg, which the
      // trigger keeps current — one row per country, so this is a 150-row scan
      // rather than an aggregate over 7.7M events. Every event with geo data
      // belongs to exactly one country, so SUM(unique_ips) is the global
      // distinct-IP count.
      pool.query(
        `SELECT COALESCE(SUM(total), 0)      AS lifetime_events,
                COALESCE(SUM(unique_ips), 0) AS lifetime_unique_ips,
                COUNT(*)                     AS lifetime_countries
         FROM cowrie_country_agg`
      ),
      pool.query('SELECT MIN(timestamp) AS first_event FROM cowrie_events'),
    ]);

    const totalTrendEvents = Number(eventsAgg.rows[0]?.total || 0);
    const peakEvents = Number(eventsAgg.rows[0]?.peak_events || 0);
    const peakHour = eventsAgg.rows[0]?.peak_hour;
    const summary = {
      attacks24h: totalTrendEvents,
      peakEvents,
      peakHour,
      malwareSamples: Number(filesAgg.rows[0]?.malware_samples || 0),
      uniqueCommands: Number(commandsAgg.rows[0]?.unique_commands || 0),
      uniqueCredCount: Number(credsAgg.rows[0]?.unique_creds || 0),
      uniqueIpPercent:
        Number(ipStatsAgg.rows[0]?.total_events || 0) > 0
          ? (Number(ipStatsAgg.rows[0].unique_ips || 0) / Number(ipStatsAgg.rows[0].total_events)) * 100
          : 0,
      lifetimeEvents: Number(lifetimeAgg.rows[0]?.lifetime_events || 0),
      lifetimeUniqueIps: Number(lifetimeAgg.rows[0]?.lifetime_unique_ips || 0),
      lifetimeCountries: Number(lifetimeAgg.rows[0]?.lifetime_countries || 0),
      firstEventAt: firstEventAgg.rows[0]?.first_event || null,
    };

    return summary;
  }

  app.get('/api/public/cowrie/summary', async (_req, res) => {
    try {
      const summary = await getSummaryStats();
      res.json(summary);
    } catch (err) {
      console.error('Error in /api/public/cowrie/summary:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

};
