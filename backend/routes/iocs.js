/**
 * Indicator export. Every other endpoint answers "what does the dashboard
 * render?"; this one answers "what can I take away and use?".
 */

const { pool } = require('../db');
const { LIMITS } = require('../config');
const { getCachedLeaderboard, setCachedLeaderboard } = require('../cache');
// Defanging lives in lib/urls.js with the extraction it belongs to, so it can
// be unit tested and so the URL and IP forms cannot drift apart.
const { extractUrls, hostOf, defangIp, defangUrl } = require('../lib/urls');
const { realCommandSql } = require('../lib/record-class');

module.exports = function registerIocRoutes(app) {
  const IOC_MAX_ROWS = 5000;

  app.get('/api/public/cowrie/iocs', async (req, res) => {
    const rawHours = parseInt(req.query.hours, 10);
    const hours = Math.min(
      Math.max(Number.isFinite(rawHours) ? rawHours : LIMITS.DEFAULT_HOURS_LOOKBACK, 1),
      LIMITS.MAX_HOURS_LOOKBACK
    );
    const type = ['hashes', 'urls', 'commands'].includes(req.query.type) ? req.query.type : 'ips';
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
      } else if (type === 'commands') {
        // What the attackers actually typed. Behavioural rather than atomic —
        // you grep for these, you do not block them — but it is the material
        // people most often want to take away, and the leaderboard panel only
        // ever shows a page of it.
        //
        // Unlike urls this *is* windowed, on last_seen: cowrie_unique_commands
        // holds one row per distinct command with the range it was seen over,
        // so "last used inside the window" is both meaningful and honest, and
        // it makes the 24h/7d toggle actually do something for this type.
        const result = await pool.query(
          `SELECT command,
                  COALESCE(total_events, 0) AS total_events,
                  COALESCE(unique_ips, 0)   AS unique_ips,
                  first_seen,
                  last_seen
             FROM cowrie_unique_commands
            WHERE last_seen >= $1
              AND ${realCommandSql('command')}
            ORDER BY COALESCE(total_events, 0) DESC
            LIMIT $2`,
          [since, IOC_MAX_ROWS]
        );
        rows = result.rows.map((r) => ({
          ...r,
          total_events: Number(r.total_events),
          unique_ips: Number(r.unique_ips),
        }));
      } else if (type === 'urls') {
        // Payload delivery URLs, pulled out of the captured commands. Not
        // windowed by `hours`: cowrie_unique_commands records when a command
        // was first and last seen, not one row per use, and a delivery host
        // stays an indicator well after the last fetch from it.
        const result = await pool.query(
          // Constrained to real commands as well (migration 013). Cowrie's own
          // "Attempt to download file(s) from URL ..." log lines carry URLs and
          // would otherwise be mined for indicators as if an attacker had typed
          // them — the honeypot's own log text, exported as threat intel.
          `SELECT command, first_seen, last_seen
             FROM cowrie_unique_commands
            WHERE ${realCommandSql('command')}
              AND (command ~* '(https?|ftp|tftp)://'
               OR command ~* '(wget|curl|tftp|fetch)\\s+(-[^ ]+ )*([0-9]{1,3}\\.){3}[0-9]{1,3}')
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

  // A command is not an atomic indicator, but it routinely *contains* one — a
  // wget of a live payload URL. Defanging those in place makes a pasted
  // command as safe to hand around as a defanged URL list. split/join rather
  // than a regex so a URL containing regex metacharacters cannot misfire.
  const defangCommand = (command) => {
    let out = String(command);
    for (const url of new Set(extractUrls(command))) out = out.split(url).join(defangUrl(url));
    return out;
  };

  function sendIocs(res, rows, { type, format, hours, defang }) {
    const generatedAt = new Date().toISOString();
    const stamp = generatedAt.slice(0, 10);

    // One place that knows how each type defangs, instead of the same decision
    // spelled out again in each of the three format branches.
    const defanged = (r) => {
      if (!defang) return r;
      if (type === 'ips') return { ...r, ip: defangIp(r.ip) };
      if (type === 'urls') return { ...r, url: defangUrl(r.url), host: defangUrl(r.host) };
      if (type === 'commands') return { ...r, command: defangCommand(r.command) };
      return r;
    };
    const out = rows.map(defanged);

    if (format === 'json') {
      return res.json({
        source: 'hunajapannu.fi',
        type,
        windowHours: hours,
        generatedAt,
        total: rows.length,
        rows: out,
      });
    }

    // A comment header travels with the data: an indicator list with no
    // provenance or timestamp is close to useless a week later.
    //
    // URLs are the one type that is not windowed — cowrie_unique_commands
    // records first/last seen rather than one row per use, and a delivery host
    // stays an indicator after the last fetch from it. Printing "last 24h" over
    // that list would be a plain lie about the data's coverage.
    const LABELS = {
      ips: 'attacker IPs',
      urls: 'payload delivery URLs',
      commands: 'attacker commands',
      hashes: 'malware hashes',
    };
    const header = [
      `# hunajapannu.fi — ${LABELS[type]}`,
      type === 'urls'
        ? `# window: all captured commands   generated: ${generatedAt}`
        : `# window: last ${hours}h   generated: ${generatedAt}`,
      `# source: SSH/Telnet honeypot, Finland (Telia consumer broadband)`,
      `# ${rows.length} indicators${defang ? ' (defanged)' : ''}`,
      '#',
    ].join('\n');

    if (format === 'txt') {
      const body =
        type === 'ips'
          ? out.map((r) => r.ip).join('\n')
          : type === 'urls'
            ? out.map((r) => r.url).join('\n')
            : type === 'commands'
              // One indicator per line is the whole contract of this format, and
              // a captured command can legitimately contain a newline — which
              // would silently split it into two bogus entries. Flatten first.
              ? out.map((r) => String(r.command).replace(/\s*[\r\n]+\s*/g, ' ')).join('\n')
              : out.map((r) => r.sha256).join('\n');
      res.type('text/plain; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="hunajapannu-${type}-${stamp}.txt"`);
      return res.send(`${header}\n${body}\n`);
    }

    // CSV
    //
    // Dates go out as ISO 8601. String(Date) yields the runtime's locale form —
    // "Sat Jul 25 2026 19:34:58 GMT+0300 (Eastern European Summer Time)" — which
    // is what this shipped, and which no consumer of an indicator feed can parse
    // or sort. The JSON path never had the problem because JSON.stringify
    // serialises Dates as ISO already.
    const esc = (v) => {
      if (v == null) return '';
      const str = v instanceof Date ? v.toISOString() : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const columns = type === 'ips'
      ? ['ip', 'events', 'commands', 'country', 'asn', 'org', 'first_seen', 'last_seen']
      : type === 'urls'
        ? ['url', 'host', 'first_seen', 'last_seen']
        : type === 'commands'
          ? ['command', 'total_events', 'unique_ips', 'first_seen', 'last_seen']
          : ['sha256', 'size_bytes', 'vt_type', 'vt_malicious', 'first_seen'];
    // esc() already quotes embedded commas, quotes and newlines, so a command
    // needs no flattening here the way the txt body does.
    const lines = out.map((r) => columns.map((c) => esc(r[c])).join(','));
    res.type('text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="hunajapannu-${type}-${stamp}.csv"`);
    res.send(`${header}\n${columns.join(',')}\n${lines.join('\n')}\n`);
  }

};
