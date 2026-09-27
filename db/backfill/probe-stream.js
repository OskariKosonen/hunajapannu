#!/usr/bin/env node
/**
 * Streaming honeypot-probe scorer: COPY text in, COPY text out.
 *
 *   stdin   id \t command
 *   stdout  id \t score \t {rule,rule}
 *
 * Same shape as the template, indicator and peer streams, and for the same
 * reason: the rules are used by the ingest path too, so there is one scorer
 * rather than a plpgsql copy that drifts away from it.
 */
const readline = require('node:readline');
const { scoreCommand } = require('../../backend/lib/honeypot-probe');

const UNESCAPE = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
const unescape = (s) => s.replace(/\\(.)/g, (m, c) => (c in UNESCAPE ? UNESCAPE[c] : m));

/** Rule ids are [a-z-] by convention, so the array literal needs no quoting. */
function transformLine(line) {
  if (line === '' || line === '\\.') return null;
  const tab = line.indexOf('\t');
  if (tab < 0) return null;
  const id = line.slice(0, tab);
  const raw = line.slice(tab + 1);
  if (raw === '\\N') return null;
  const { score, matched } = scoreCommand(unescape(raw));
  // Only rows that scored are written. The column defaults to 0, so sending
  // 1.7M zeroes would be 1.7M pointless row rewrites.
  if (score === 0) return null;
  return `${id}\t${score}\t{${matched.join(',')}}`;
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let n = 0;
  rl.on('line', (l) => { const o = transformLine(l); if (o !== null) { process.stdout.write(o + '\n'); n++; } });
  rl.on('close', () => process.stderr.write(`${n} scored\n`));
}
module.exports = { transformLine, unescape };
