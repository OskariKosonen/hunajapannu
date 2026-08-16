/**
 * Pulling payload URLs out of captured shell commands.
 *
 * Shared by the infrastructure panel and the IOC export, and kept here rather
 * than in either of them because it is pure string work and the only part of
 * this worth testing exhaustively — attackers write fetches in a lot of
 * shapes, and a missed one is a delivery host nobody sees.
 */

// Two shapes, because attackers write both:
//   wget http://1.2.3.4/bins.sh     — a real URL
//   wget 1.2.3.4/bins.sh            — scheme omitted, still a fetch
const URL_RE = /\b(?:https?|ftp|tftp):\/\/[^\s"'`;|)&<>\\]+/gi;
const BARE_RE =
  /\b(?:wget|curl|tftp|fetch)\s+(?:-[^\s]+\s+)*((?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\/[^\s"'`;|)&<>\\]*)/gi;

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Host portion of a URL, without scheme, port, credentials or path. */
function hostOf(url) {
  const stripped = String(url).replace(/^[a-z]+:\/\//i, '');
  const hostPort = stripped.split(/[/?#]/)[0];
  const host = hostPort.split('@').pop().split(':')[0];
  return host.toLowerCase() || null;
}

function extractUrls(command) {
  if (!command) return [];
  const found = new Set();
  for (const m of String(command).matchAll(URL_RE)) found.add(m[0]);
  for (const m of String(command).matchAll(BARE_RE)) found.add(`http://${m[1]}`);
  return [...found];
}

const isIp = (host) => IPV4.test(String(host));

/** 1.2.3.4 -> 1.2.3[.]4 — last dot only, the usual convention for addresses. */
const defangIp = (ip) => String(ip).replace(/\.(?=[^.]*$)/, '[.]');

/**
 * hxxp://1.2.3[.]4:8080/bins.sh — safe to paste into a ticket.
 *
 * Only the host is bracketed. Mangling the path as well ("bins[.]sh") makes the
 * indicator harder to read and harder to re-fang for use.
 *
 * The port is split off before deciding address-or-name, because it lives in
 * the same capture group as the host. Leaving it attached made "1.2.3.4:6819"
 * fail the address test and fall through to the name branch, so a host that
 * happened to carry a port defanged every dot while the same address without
 * one defanged only the last. The point of matching defangIp here is that one
 * address reads identically whether it arrived via ?type=ips or ?type=urls.
 */
function defangUrl(value) {
  const str = String(value);
  const m = str.match(/^([a-z]+):\/\/([^/?#]*)(.*)$/i);
  const hostPort = m ? m[2] : str;
  const portAt = hostPort.lastIndexOf(':');
  const host = portAt === -1 ? hostPort : hostPort.slice(0, portAt);
  const port = portAt === -1 ? '' : hostPort.slice(portAt);
  const bracketed = isIp(host) ? defangIp(host) : host.replace(/\./g, '[.]');
  if (!m) return `${bracketed}${port}`;
  return `${m[1].replace(/^http/i, 'hxxp')}://${bracketed}${port}${m[3]}`;
}

module.exports = { extractUrls, hostOf, isIp, defangIp, defangUrl };
