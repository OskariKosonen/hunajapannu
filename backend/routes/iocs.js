/**
 * Indicator export. Every other endpoint answers "what does the dashboard
 * render?"; this one answers "what can I take away and use?".
 */

const { pool } = require('../db');
const { LIMITS } = require('../config');
const { getCachedLeaderboard, setCachedLeaderboard } = require('../cache');
const { extractUrls, hostOf } = require('../lib/urls');

module.exports = function registerIocRoutes(app) {
  const IOC_MAX_ROWS = 5000;

  const defangIp = (ip) => String(ip).replace(/\.(?=[^.]*$)/, '[.]');

  // hxxp://1.2.3[.]4/bins.sh — the convention analysts expect, so a delivery
  // URL can go in a ticket without becoming a live link or tripping a link
  // scanner. Only the host is defanged: mangling the path as well makes the
  // indicator harder to read and harder to re-fang for use.
  // hxxp://1.2.3[.]4/bins.sh — the convention analysts expect, so a delivery
  // URL can go in a ticket without becoming a live link or tripping a link
  // scanner. Only the host is bracketed: mangling the path as well makes the
  // indicator harder to read and harder to re-fang for use.
  const defangUrl = (value) => {
    const str = String(value);
    const m = str.match(/^([a-z]+):\/\/([^/?#]*)(.*)$/i);
    const host = m ? m[2] : str;
    // An address defangs like defangIp does — last dot only — so the same IP
    // reads identically whether it came out of ?type=ips or ?type=urls.
    // A name defangs every dot, which is the usual convention for domains.
    const bracketed = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
      ? host.replace(/\.(?=[^.]*$)/, '[.]')
      : host.replace(/\./g, '[.]');
    if (!m) return bracketed;
    return `${m[1].replace(/^http/i, 'hxxp')}://${bracketed}${m[3]}`;
  };


  app.get('/api/public/cowrie/iocs', async (req, res) => {
    const rawHours = parseInt(req.query.hours, 10);
    const hours = Math.min(
      Math.max(Number.isFinite(rawHours) ? rawHours : LIMITS.DEFAULT_HOURS_LOOKBACK, 1),
      LIMITS.MAX_HOURS_LOOKBACK
    );
    const type = ['hashes', 'urls'].includes(req.query.type) ? req.query.type : 'ips';
    const format = ['txt', 'csv', 'json'].includes(req.query.format) ? req.query.format : 'json';
    const defang = req.query.defang === '1' || req.query.defang === 'true';

    const cacheKey = `iocs:${hours}:${type}:${format}:${defang}`;
    const cached = getCachedLeaderboard(cacheKey);
    if (cached) return sendIocs(res, cached, { type, format, hours, defang });

    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      let rows;

      if (type === 'hashes') {
        // Malware seen in the window, newest first.
        // cowrie_files_agg records first_seen only — one row per sha256, and a
        // sample's interest is when it first appeared here, not when it recurred.
        const result = await pool.query(
          `SELECT sha256, size_bytes, first_seen, vt_type, vt_malicious
           FROM cowrie_files_agg
           WHERE first_seen >= $1
           ORDER BY first_seen DESC
           LIMIT $2`,
          [since, IOC_MAX_ROWS]
        );
        rows = result.rows;
      } else if (type === 'urls') {
        // Payload delivery URLs, pulled out of the captured commands. Not
        // windowed by `hours`: cowrie_unique_commands records when a command
        // was first and last seen, not one row per use, and a delivery host
        // stays an indicator well after the last fetch from it.
        const result = await pool.query(
          `SELECT command, first_seen, last_seen
             FROM cowrie_unique_commands
            WHERE command ~* '(https?|ftp|tftp)://'
               OR command ~* '(wget|curl|tftp|fetch)\\s+(-[^ ]+ )*([0-9]{1,3}\\.){3}[0-9]{1,3}'
            LIMIT $1`,
          [IOC_MAX_ROWS]
        );
        const seen = new Map();
        for (const r of result.rows) {
          for (const url of extractUrls(r.command)) {
            if (!seen.has(url)) {
              seen.set(url, { url, host: hostOf(url), first_seen: r.first_seen, last_seen: r.last_seen });
            }
          }
        }
        rows = [...seen.values()];
      } else {
        // Bounded by idx_events_timestamp; a day is a few thousand rows.
        const result = await pool.query(
          `SELECT host(src_ip)                                                   AS ip,
                  COUNT(*)                                                       AS events,
                  COUNT(*) FILTER (WHERE command IS NOT NULL AND command <> '')  AS commands,
                  MIN(country_iso)                                               AS country,
                  MIN(asn)                                                       AS asn,
                  MIN(org)                                                       AS org,
                  MIN(timestamp)                                                 AS first_seen,
                  MAX(timestamp)                                                 AS last_seen
           FROM cowrie_events
           WHERE timestamp >= $1
           GROUP BY src_ip
           ORDER BY events DESC
           LIMIT $2`,
          [since, IOC_MAX_ROWS]
        );
        rows = result.rows.map((r) => ({
          ...r,
          events: Number(r.events),
          commands: Number(r.commands),
        }));
      }

      setCachedLeaderboard(cacheKey, rows);
      sendIocs(res, rows, { type, format, hours, defang });
    } catch (err) {
      console.error('Error in /api/public/cowrie/iocs:', err);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

  function sendIocs(res, rows, { type, format, hours, defang }) {
    const generatedAt = new Date().toISOString();
    const stamp = generatedAt.slice(0, 10);

    if (format === 'json') {
      return res.json({
        source: 'hunajapannu.fi',
        type,
        windowHours: hours,
        generatedAt,
        total: rows.length,
        rows: !defang
          ? rows
          : type === 'ips'
            ? rows.map((r) => ({ ...r, ip: defangIp(r.ip) }))
            : type === 'urls'
              ? rows.map((r) => ({ ...r, url: defangUrl(r.url), host: defangUrl(r.host) }))
              : rows,
      });
    }

    // A comment header travels with the data: an indicator list with no
    // provenance or timestamp is close to useless a week later.
    const header = [
      `# hunajapannu.fi — ${
      type === 'ips' ? 'attacker IPs' : type === 'urls' ? 'payload delivery URLs' : 'malware hashes'
    }`,
      `# window: last ${hours}h   generated: ${generatedAt}`,
      `# source: SSH/Telnet honeypot, Finland (Telia consumer broadband)`,
      `# ${rows.length} indicators${defang ? ' (defanged)' : ''}`,
      '#',
    ].join('\n');

    if (format === 'txt') {
      const body =
        type === 'ips'
          ? rows.map((r) => (defang ? defangIp(r.ip) : r.ip)).join('\n')
          : type === 'urls'
            ? rows.map((r) => (defang ? defangUrl(r.url) : r.url)).join('\n')
            : rows.map((r) => r.sha256).join('\n');
      res.type('text/plain; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="hunajapannu-${type}-${stamp}.txt"`);
      return res.send(`${header}\n${body}\n`);
    }

    // CSV
    const esc = (v) => {
      const str = v == null ? '' : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const columns = type === 'ips'
      ? ['ip', 'events', 'commands', 'country', 'asn', 'org', 'first_seen', 'last_seen']
      : type === 'urls'
        ? ['url', 'host', 'first_seen', 'last_seen']
        : ['sha256', 'size_bytes', 'vt_type', 'vt_malicious', 'first_seen'];
    const lines = rows.map((r) =>
      columns
        .map((c) => {
          if (defang && c === 'ip') return esc(defangIp(r[c]));
          if (defang && (c === 'url' || c === 'host')) return esc(defangUrl(r[c]));
          return esc(r[c]);
        })
        .join(',')
    );
    res.type('text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="hunajapannu-${type}-${stamp}.csv"`);
    res.send(`${header}\n${columns.join(',')}\n${lines.join('\n')}\n`);
  }

};
