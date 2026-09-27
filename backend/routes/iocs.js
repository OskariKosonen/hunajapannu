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
const { classFilterSql } = require('../lib/record-class');

// Public type name -> how it is served.
//
// 'ips', 'hashes' and 'commands' are aggregates over other tables and stay as
// they are. Everything else is a row in cowrie_iocs (migration 014), which is
// why 'urls' changed: it used to re-run a regex over every stored command on
// each request and rebuild the same list, which meant the endpoint could not
// report when a URL was first seen, only when the command carrying it was.
const IOC_BACKED = {
  urls:        'url',
  c2:          'c2_endpoint',
  keys:        'ssh_key',
  wallets:     'xmr_wallet',
  configs:     'config_blob',
  resolvers:   'nameserver',
  credentials: 'dropped_credential',
};
const TYPES = { ips: 1, hashes: 1, commands: 1, ...IOC_BACKED };

module.exports = function registerIocRoutes(app) {
  const IOC_MAX_ROWS = 5000;

  app.get('/api/public/cowrie/iocs', async (req, res) => {
    const rawHours = parseInt(req.query.hours, 10);
    const hours = Math.min(
      Math.max(Number.isFinite(rawHours) ? rawHours : LIMITS.DEFAULT_HOURS_LOOKBACK, 1),
      LIMITS.MAX_HOURS_LOOKBACK
    );
    const type = Object.prototype.hasOwnProperty.call(TYPES, req.query.type) ? req.query.type : 'ips';
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
              AND ${classFilterSql('command')}
            ORDER BY COALESCE(total_events, 0) DESC
            LIMIT $2`,
          [since, IOC_MAX_ROWS]
        );
        rows = result.rows.map((r) => ({
          ...r,
          total_events: Number(r.total_events),
          unique_ips: Number(r.unique_ips),
        }));
      } else if (IOC_BACKED[type]) {
        // Straight from cowrie_iocs. Deliberately not windowed by `hours`,
        // for the reason the URL list never was: the table records when an
        // indicator was first and last seen rather than one row per use, and
        // a delivery host or C2 address stays an indicator long after the
        // last fetch from it. The txt/csv header says so rather than claiming
        // a window it does not apply.
        const result = await pool.query(
          `SELECT value, meta, occurrence_count, first_seen, last_seen
             FROM cowrie_iocs
            WHERE ioc_type = $1::cowrie_ioc_type
            ORDER BY occurrence_count DESC, last_seen DESC
            LIMIT $2`,
          [IOC_BACKED[type], IOC_MAX_ROWS]
        );
        rows = result.rows.map((r) => ({
          // 'urls' keeps the field names it has always published. This is a
          // public feed with no versioning, so renaming url -> value would
          // break anyone consuming it for the sake of internal tidiness.
          ...(type === 'urls'
            ? { url: r.value, host: hostOf(r.value) }
            : { value: r.value }),
          ...(r.meta && Object.keys(r.meta).length ? { meta: r.meta } : {}),
          occurrences: Number(r.occurrence_count),
          first_seen: r.first_seen,
          last_seen: r.last_seen,
        }));
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
      // c2 endpoints and hijacked resolvers are addresses; defanging them is
      // the same courtesy as for an IP. Keys, wallets, blobs and credentials
      // are not clickable, so there is nothing to neuter.
      if (type === 'c2' || type === 'resolvers') return { ...r, value: defangIp(r.value) };
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
      c2: 'C2 endpoints (address:port)',
      keys: 'attacker SSH public keys',
      wallets: 'Monero wallet addresses',
      configs: 'malware config blobs',
      resolvers: 'hijacked DNS resolvers',
      credentials: 'passwords the malware sets',
    };
    const header = [
      `# hunajapannu.fi — ${LABELS[type]}`,
      // Only the windowed types may claim a window. Printing "last 24h" over
      // a list that is not windowed is a plain lie about its coverage.
      IOC_BACKED[type]
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
            : IOC_BACKED[type]
              ? out.map((r) => String(r.value).replace(/\s*[\r\n]+\s*/g, ' ')).join('\n')
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
        ? ['url', 'host', 'occurrences', 'first_seen', 'last_seen']
        : IOC_BACKED[type]
          ? ['value', 'occurrences', 'first_seen', 'last_seen']
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
