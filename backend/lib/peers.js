/**
 * Bootstrap peers handed to the Panchan SSH worm.
 *
 * The honeypot captures the worm being installed and started:
 *
 *   chmod +x ./.5187238377254817649/sshd;nohup ./.5187238377254817649/sshd \
 *     177.10.201.11 170.150.255.26 ... 185.228.81.251 &
 *
 * The addresses are the malware's argv. They are *peers*, not victims: Panchan
 * is a peer-to-peer botnet and these are known-good nodes it contacts to join
 * the mesh on port 1919. An earlier reading of this data in the project called
 * them targets, which inverted the meaning of every number derived from it —
 * a recurring address is a long-lived node, not a host being attacked
 * repeatedly. Akamai documented the family in 2022, Nozomi tracked it in 2024,
 * and the exact sample this deploys is in cowrie_files with 39 VT detections.
 *
 * Both published enumerations are point-in-time crawls of the live mesh, 209
 * and 96 nodes. The value here is different in kind: ten months of passive
 * observation, collected without touching the botnet.
 *
 * Anchored to the launch command rather than matching addresses loosely. A
 * bare "IPv4 in a command" rule would sweep up C2 servers, download hosts and
 * resolv.conf entries and file them all as mesh members.
 */

// ./.<digits>/sshd <argv> &
//
// The directory name is a long random number, which is what makes the anchor
// specific: nothing else in the corpus has that shape.
//
// The argv is captured wholesale and validated in JavaScript rather than
// matched address-by-address in the pattern. An earlier version required
// every token to be a well-formed IPv4, which meant one malformed entry made
// the whole expression fail and silently discarded all fifty peers in that
// list. Validation belongs where a bad token can be skipped individually.
const LAUNCH = /\.\/\.\d{6,}\/sshd([^&]*)&/;

/** Reject anything that is not a routable unicast address. */
const NON_ROUTABLE = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./, /^22[4-9]\./, /^2[34]\d\./, /^255\./,
];

function isRoutableIpv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  if (parts.some((p) => p.length > 3 || p === '' || Number(p) > 255)) return false;
  return !NON_ROUTABLE.some((re) => re.test(ip));
}

/**
 * @returns {{isSpreader: boolean, peers: string[]}}
 *
 * isSpreader is reported separately from the peer list because the two differ
 * and the difference is data. 45 of the 160 captured launches pass no
 * addresses at all — `nohup ./.<digits>/sshd  &` — and those are not parse
 * failures: the binary falls back to its own embedded list. Dropping them
 * would silently overstate how often the operator ships a fresh bootstrap set.
 */
function extractPeers(command) {
  if (typeof command !== 'string' || command === '') return { isSpreader: false, peers: [] };
  const m = LAUNCH.exec(command);
  if (!m) return { isSpreader: false, peers: [] };

  const seen = new Set();
  for (const ip of (m[1] || '').trim().split(/\s+/)) {
    if (ip && isRoutableIpv4(ip)) seen.add(ip);
  }
  return { isSpreader: true, peers: [...seen] };
}

module.exports = { extractPeers, isRoutableIpv4 };
