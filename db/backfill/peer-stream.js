#!/usr/bin/env node
/**
 * Streaming peer extractor with GeoIP enrichment.
 *
 *   stdin   id \t first_seen \t last_seen \t command
 *   stdout  peer_ip \t first_seen \t last_seen \t cc \t asn \t org \t city \t id
 *
 * Enrichment happens here, from the same MaxMind databases the API loads, so
 * peer geography and attacker geography are directly comparable rather than
 * "comparable if both sources happen to agree".
 *
 * Launches that pass no peers still matter — the ratio of empty to populated
 * lists says how often the operator ships a fresh bootstrap set — so they are
 * written to a second stream on fd 3 rather than dropped.
 */

const readline = require('node:readline');
const fs = require('node:fs');
const maxmind = require('../../backend/node_modules/maxmind');
const { extractPeers } = require('../../backend/lib/peers');

const CITY_DB = process.env.GEO_CITY_DB_PATH || '/var/lib/GeoIP/GeoLite2-City.mmdb';
const ASN_DB = process.env.GEO_ASN_DB_PATH || '/var/lib/GeoIP/GeoLite2-ASN.mmdb';

const UNESCAPE = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
const unescape = (s) => s.replace(/\\(.)/g, (m, c) => (c in UNESCAPE ? UNESCAPE[c] : m));
const escape = (s) =>
  s == null || s === ''
    ? '\\N' // COPY's NULL marker, so an unknown org is null and not empty string
    : String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');

async function main() {
  let city = null;
  let asn = null;
  try {
    city = await maxmind.open(CITY_DB);
    asn = await maxmind.open(ASN_DB);
  } catch (err) {
    // Geo is enrichment, not the point. Losing it must not lose the peers.
    process.stderr.write(`geo databases unavailable (${err.message}); peers will be unenriched\n`);
  }

  const lists = [];
  let peerRows = 0;

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line === '' || line === '\\.') continue;
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    const [id, firstSeen, lastSeen] = parts;
    const command = unescape(parts.slice(3).join('\t'));

    const { isSpreader, peers } = extractPeers(command);
    if (!isSpreader) continue;

    lists.push([id, String(peers.length), firstSeen, lastSeen].join('\t'));

    for (const ip of peers) {
      let c = null;
      let a = null;
      try { c = city && city.get(ip); } catch { /* an unmappable address is still a peer */ }
      try { a = asn && asn.get(ip); } catch { /* ditto */ }
      process.stdout.write([
        ip, firstSeen, lastSeen,
        escape(c?.country?.iso_code),
        a?.autonomous_system_number ? String(a.autonomous_system_number) : '\\N',
        escape(a?.autonomous_system_organization),
        escape(c?.city?.names?.en),
        id,
      ].join('\t') + '\n');
      peerRows++;
    }
  }

  // The launch records go to a file rather than stdout, which is already
  // carrying the peer stream into a COPY.
  if (process.env.PEER_LISTS_OUT) {
    fs.writeFileSync(process.env.PEER_LISTS_OUT, lists.length ? lists.join('\n') + '\n' : '');
  }
  process.stderr.write(`${peerRows} peers from ${lists.length} launches\n`);
}

if (require.main === module) main();
module.exports = { unescape, escape };
