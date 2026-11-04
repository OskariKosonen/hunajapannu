/**
 * Findings, as opposed to leaderboards: each endpoint answers one question a
 * visitor would ask, and returns the denominators that make the answer
 * checkable.
 *
 * /creds/anatomy          what the bots guess, across every captured pair
 * /origins/concentration  how few networks carry most of the traffic
 * /clients                the SSH software that connects, and how many
 *                         addresses one client fingerprint spans
 * /tunnels                where attackers tried to relay traffic through the box
 *
 * Every one aggregates a whole table or a window of one, so they are cached
 * for ten minutes rather than the leaderboards' one: the answers move slowly,
 * and none of them is worth a scan a minute.
 */

const { pool } = require('../db');
const { cached } = require('../cache');
const { concentration, parseDays } = require('../lib/insights');

const TTL = 10 * 60 * 1000;

const fail = (res, path, err) => {
  console.error(`Error in ${path}:`, err);
  res.status(500).json({ error: 'Database query failed' });
};

module.exports = function registerInsightRoutes(app) {
  /**
   * GET /api/public/cowrie/creds/anatomy
   *
   * Every attempt falls in exactly one category, checked in this order: empty,
   * the username again, digits only, letters only, anything else. Weighted by
   * attempts, not distinct pairs, because the question is what bots try, and
   * one pair tried 85,000 times says more about that than 85,000 pairs tried
   * once.
   */
  app.get('/api/public/cowrie/creds/anatomy', async (_req, res) => {
    try {
      const payload = await cached(
        'creds-anatomy',
        async () => {
          const [kinds, lengths, users] = await Promise.all([
            pool.query(
              `WITH c AS (
                 SELECT username, password, COALESCE(total_events, 0) AS n FROM cowrie_unique_creds
               )
               SELECT
                 SUM(n)                                                         AS attempts,
                 COUNT(*)                                                       AS pairs,
                 COUNT(DISTINCT password)                                       AS passwords,
                 COUNT(DISTINCT username)                                       AS usernames,
                 COALESCE(SUM(n) FILTER (WHERE password = ''), 0)               AS empty,
                 COALESCE(SUM(n) FILTER (WHERE password <> '' AND password = username), 0) AS same,
                 COALESCE(SUM(n) FILTER (WHERE password <> '' AND password <> username
                                           AND password ~ '^[0-9]+$'), 0)      AS digits,
                 COALESCE(SUM(n) FILTER (WHERE password <> '' AND password <> username
                                           AND password ~ '^[A-Za-z]+$'), 0)   AS letters
               FROM c`
            ),
            pool.query(
              `SELECT LEAST(length(password), 20) AS len, SUM(COALESCE(total_events, 0)) AS n
                 FROM cowrie_unique_creds
                GROUP BY 1
                ORDER BY 1`
            ),
            pool.query(
              `SELECT username, SUM(COALESCE(total_events, 0)) AS total
                 FROM cowrie_unique_creds
                GROUP BY username
                ORDER BY total DESC
                LIMIT 6`
            ),
          ]);

          const k = kinds.rows[0] || {};
          const attempts = Number(k.attempts || 0);
          const empty = Number(k.empty || 0);
          const same = Number(k.same || 0);
          const digits = Number(k.digits || 0);
          const letters = Number(k.letters || 0);
          return {
            attempts,
            pairs: Number(k.pairs || 0),
            passwords: Number(k.passwords || 0),
            usernames: Number(k.usernames || 0),
            kinds: {
              same,
              digits,
              letters,
              mixed: Math.max(attempts - empty - same - digits - letters, 0),
              empty,
            },
            // 20 means "20 or longer".
            lengths: lengths.rows.map((r) => ({ length: Number(r.len), attempts: Number(r.n) })),
            topUsernames: users.rows.map((r) => ({ username: r.username, total: Number(r.total) })),
          };
        },
        { ttl: TTL }
      );
      res.json(payload);
    } catch (err) {
      fail(res, '/api/public/cowrie/creds/anatomy', err);
    }
  });

  /**
   * GET /api/public/cowrie/origins/concentration
   *
   * "How many networks would you have to block to stop half of this?" The
   * per-network totals already live in cowrie_asn_agg, a few thousand rows, so
   * the cumulative shares are computed here rather than in SQL.
   */
  app.get('/api/public/cowrie/origins/concentration', async (_req, res) => {
    try {
      const payload = await cached(
        'origins-concentration',
        async () => {
          const { rows } = await pool.query(
            `SELECT asn, org, total FROM cowrie_asn_agg WHERE total > 0 ORDER BY total DESC`
          );
          const result = concentration(
            rows.map((r) => r.total),
            [0.5, 0.8, 0.9]
          );
          let running = 0;
          const top = rows.slice(0, 8).map((r) => {
            running += Number(r.total);
            return {
              asn: r.asn == null ? null : Number(r.asn),
              org: r.org,
              total: Number(r.total),
              cumulative: result.events ? running / result.events : 0,
            };
          });
          return { ...result, top };
        },
        { ttl: TTL }
      );
      res.json(payload);
    } catch (err) {
      fail(res, '/api/public/cowrie/origins/concentration', err);
    }
  });

  /**
   * GET /api/public/cowrie/clients?days=30
   *
   * Source addresses rotate; client software does not. The SSH banner says
   * what connected (a Go bot, libssh2, a person's OpenSSH), and the HASSH, a
   * hash of the key-exchange offer, groups sessions by the exact client build
   * across however many addresses it used.
   */
  app.get('/api/public/cowrie/clients', async (req, res) => {
    const days = parseDays(req.query.days);
    try {
      const payload = await cached(
        `clients:${days}`,
        async () => {
          const since = `now() - make_interval(days => $1)`;
          const [totals, versions, hassh] = await Promise.all([
            pool.query(
              `SELECT COUNT(*)                                        AS sessions,
                      COUNT(DISTINCT src_ip)                          AS ips,
                      COUNT(DISTINCT hassh)                           AS fingerprints,
                      COUNT(client_version)                           AS versioned,
                      COUNT(DISTINCT client_version)                  AS versions
                 FROM cowrie_client_fingerprints
                WHERE first_seen >= ${since}`,
              [days]
            ),
            pool.query(
              `SELECT client_version, COUNT(*) AS sessions, COUNT(DISTINCT src_ip) AS ips
                 FROM cowrie_client_fingerprints
                WHERE first_seen >= ${since} AND client_version IS NOT NULL
                GROUP BY client_version
                ORDER BY sessions DESC
                LIMIT 40`,
              [days]
            ),
            pool.query(
              `SELECT hassh,
                      COUNT(*)                                        AS sessions,
                      COUNT(DISTINCT src_ip)                          AS ips,
                      COUNT(DISTINCT country_iso)                     AS countries,
                      COUNT(DISTINCT asn)                             AS networks,
                      MODE() WITHIN GROUP (ORDER BY client_version)   AS client_version
                 FROM cowrie_client_fingerprints
                WHERE first_seen >= ${since} AND hassh IS NOT NULL
                GROUP BY hassh
                ORDER BY ips DESC, sessions DESC
                LIMIT 8`,
              [days]
            ),
          ]);
          const t = totals.rows[0] || {};
          return {
            days,
            sessions: Number(t.sessions || 0),
            ips: Number(t.ips || 0),
            fingerprints: Number(t.fingerprints || 0),
            // Sessions that sent a banner at all; the denominator for the
            // version list, which only holds the top 40.
            versioned: Number(t.versioned || 0),
            versionCount: Number(t.versions || 0),
            versions: versions.rows.map((r) => ({
              client_version: r.client_version,
              sessions: Number(r.sessions),
              ips: Number(r.ips),
            })),
            hassh: hassh.rows.map((r) => ({
              hassh: r.hassh,
              sessions: Number(r.sessions),
              ips: Number(r.ips),
              countries: Number(r.countries),
              networks: Number(r.networks),
              client_version: r.client_version,
            })),
          };
        },
        { ttl: TTL }
      );
      res.json(payload);
    } catch (err) {
      fail(res, '/api/public/cowrie/clients', err);
    }
  });

  /**
   * GET /api/public/cowrie/tunnels?days=30
   *
   * direct-tcpip requests: the attacker asking the box to open a connection to
   * somewhere else. Cowrie refuses, but the destination says what the box was
   * wanted for, and it is a kind of abuse command analysis never sees.
   */
  app.get('/api/public/cowrie/tunnels', async (req, res) => {
    const days = parseDays(req.query.days);
    try {
      const payload = await cached(
        `tunnels:${days}`,
        async () => {
          const since = `now() - make_interval(days => $1)`;
          const [totals, ports, hosts] = await Promise.all([
            pool.query(
              `SELECT COUNT(*) AS requests, COUNT(DISTINCT src_ip) AS sources,
                      COUNT(DISTINCT dst_host) AS destinations
                 FROM cowrie_tunnel_requests
                WHERE timestamp >= ${since}`,
              [days]
            ),
            pool.query(
              `SELECT dst_port, COUNT(*) AS requests, COUNT(DISTINCT src_ip) AS sources
                 FROM cowrie_tunnel_requests
                WHERE timestamp >= ${since}
                GROUP BY dst_port
                ORDER BY requests DESC
                LIMIT 8`,
              [days]
            ),
            pool.query(
              `SELECT dst_host, dst_port, COUNT(*) AS requests, COUNT(DISTINCT src_ip) AS sources
                 FROM cowrie_tunnel_requests
                WHERE timestamp >= ${since}
                GROUP BY dst_host, dst_port
                ORDER BY requests DESC
                LIMIT 10`,
              [days]
            ),
          ]);
          const t = totals.rows[0] || {};
          const num = (r) => ({
            ...r,
            dst_port: r.dst_port == null ? null : Number(r.dst_port),
            requests: Number(r.requests),
            sources: Number(r.sources),
          });
          return {
            days,
            requests: Number(t.requests || 0),
            sources: Number(t.sources || 0),
            destinations: Number(t.destinations || 0),
            ports: ports.rows.map(num),
            hosts: hosts.rows.map(num),
          };
        },
        { ttl: TTL }
      );
      res.json(payload);
    } catch (err) {
      fail(res, '/api/public/cowrie/tunnels', err);
    }
  });
};
