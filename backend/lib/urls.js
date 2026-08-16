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

module.exports = { extractUrls, hostOf, isIp };
