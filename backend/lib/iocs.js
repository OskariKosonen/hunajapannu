/**
 * Pulls structured indicators out of captured command text.
 *
 * The commands are already stored; what was missing is the ability to ask
 * "every C2 endpoint we have seen" without a regex over a text column. Each
 * extractor here returns typed values that Phase 4 stores in cowrie_iocs and
 * the public /iocs endpoint serves.
 *
 * Two rules, both learned the hard way elsewhere in this codebase:
 *
 * 1. Extract from the raw command, never the template. Templatization
 *    deliberately replaces exactly the fields that are indicators — the
 *    address, the wallet, the key — so running these over command_template
 *    would return a list of placeholder names.
 *
 * 2. Deduplicate within a command. The loader family names its C2 endpoint
 *    three times (curl, then a wget fallback, then a bash /dev/tcp fallback),
 *    so a naive extractor reports one endpoint as three sightings and inflates
 *    every count by exactly the number of fallbacks the malware happens to use.
 */

// RFC 5737/1918 and friends. An attacker telling a bot to fetch from 127.0.0.1
// or 10.x is describing the victim's own network, not infrastructure we can
// report, and 0.0.0.0/255.255.255.255 are noise from config strings.
const NON_ROUTABLE = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./, /^22[4-9]\./, /^2[34]\d\./, /^255\./,
];

function isRoutableIpv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  if (parts.some((p) => p.length > 3 || Number(p) > 255)) return false;
  return !NON_ROUTABLE.some((re) => re.test(ip));
}

/**
 * C2 endpoints, as address and port together.
 *
 * Kept as one indicator rather than two because the pair is what identifies
 * the server; the same address on a different port is a different listener,
 * and the port alone means nothing.
 *
 * Ports observed across the 56-row loader family fall in two clusters,
 * 6326-9655 and 60104-60149. An earlier note in this project claimed the band
 * was 60107-60149, which was wrong at the lower bound and missed the lower
 * cluster entirely; the band is recorded here as data, not as a rule, so
 * nothing downstream depends on a range that may move.
 */
function extractC2Endpoints(command) {
  const out = new Map();
  const re = /\b((?:\d{1,3}\.){3}\d{1,3})[:/](\d{2,5})\b/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    const [, ip, portStr] = m;
    const port = Number(portStr);
    if (!isRoutableIpv4(ip) || port < 1 || port > 65535) continue;
    const value = `${ip}:${port}`;
    if (!out.has(value)) out.set(value, { type: 'c2_endpoint', value, meta: { ip, port } });
  }
  return [...out.values()];
}

/** Payload URLs. Host kept separately so a domain can be blocked without it. */
function extractUrls(command) {
  const out = new Map();
  const re = /\b(?:https?|ftp|tftp):\/\/[^\s"'`;|)<>\\]+/gi;
  for (const raw of command.match(re) || []) {
    // Trailing punctuation belongs to the shell, not the URL.
    const value = raw.replace(/[.,;:]+$/, '');
    if (!out.has(value)) out.set(value, { type: 'url', value, meta: {} });
  }
  return [...out.values()];
}

/**
 * SSH public keys, deduplicated by key body.
 *
 * The comment field is attacker-controlled and varies — `mdrfckr` is the
 * well-known one, but the same key has been seen with others. Keying on the
 * body means one key is one indicator however it is labelled, and the comment
 * is kept as metadata because it is still a useful campaign tag.
 */
function extractSshKeys(command) {
  const out = new Map();
  const re = /\b(ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+)\s+(AAAA[A-Za-z0-9+/]{20,}={0,3})(?:\s+([^\s"'`>]+))?/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    const [, algo, body, comment] = m;
    if (!out.has(body)) out.set(body, { type: 'ssh_key', value: body, meta: { algo, comment: comment || null } });
  }
  return [...out.values()];
}

/** Monero addresses: 95 characters of base58 starting 4. Length-anchored. */
function extractWallets(command) {
  const out = new Map();
  for (const value of command.match(/\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g) || []) {
    if (!out.has(value)) out.set(value, { type: 'xmr_wallet', value, meta: {} });
  }
  return [...out.values()];
}

/**
 * The base64 blob the loader passes to the dropped binary as its only
 * argument. It is the malware's configuration, so two samples sharing one
 * blob are one campaign even when the binary hash differs.
 *
 * Anchored to "/tmp/<name> <blob>" rather than matched loose, because a bare
 * long-base64 rule also catches SSH key bodies and anything else encoded.
 */
function extractConfigBlobs(command) {
  const out = new Map();
  const re = /\/tmp\/[A-Za-z0-9._-]+\s+([A-Za-z0-9+/]{60,}={0,2})/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    const value = m[1];
    if (value.startsWith('AAAA')) continue; // an SSH key body, handled above
    if (!out.has(value)) out.set(value, { type: 'config_blob', value, meta: { bytes: value.length } });
  }
  return [...out.values()];
}

/** Nameservers the attacker writes into resolv.conf to hijack resolution. */
function extractNameservers(command) {
  const out = new Map();
  const re = /nameserver[ \t]+((?:\d{1,3}\.){3}\d{1,3})/gi;
  let m;
  while ((m = re.exec(command)) !== null) {
    const value = m[1];
    if (!isRoutableIpv4(value)) continue;
    if (!out.has(value)) out.set(value, { type: 'nameserver', value, meta: {} });
  }
  return [...out.values()];
}

/**
 * The password the bot sets and records, e.g. `echo 123456 > /tmp/.opass`.
 * Not an indicator you block — it is an indicator you recognise, because the
 * value is a fingerprint of which campaign owns the host.
 */
function extractDroppedCredentials(command) {
  const out = new Map();
  const re = /echo\s+["']?([^\s"'>|]{1,64})["']?\s*>\s*\/tmp\/\.opass/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    const value = m[1];
    if (!out.has(value)) out.set(value, { type: 'dropped_credential', value, meta: {} });
  }
  return [...out.values()];
}

/** Every extractor, in one pass, already deduplicated within the command. */
function extractIocs(command) {
  if (typeof command !== 'string' || command === '') return [];
  return [
    ...extractC2Endpoints(command),
    ...extractUrls(command),
    ...extractSshKeys(command),
    ...extractWallets(command),
    ...extractConfigBlobs(command),
    ...extractNameservers(command),
    ...extractDroppedCredentials(command),
  ];
}

const IOC_TYPES = [
  'c2_endpoint', 'url', 'ssh_key', 'xmr_wallet',
  'config_blob', 'nameserver', 'dropped_credential',
];

module.exports = {
  IOC_TYPES,
  isRoutableIpv4,
  extractC2Endpoints,
  extractUrls,
  extractSshKeys,
  extractWallets,
  extractConfigBlobs,
  extractNameservers,
  extractDroppedCredentials,
  extractIocs,
};
