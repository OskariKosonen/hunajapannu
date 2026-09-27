#!/usr/bin/env node
/**
 * Streaming IOC extractor: PostgreSQL COPY text format in and out.
 *
 *   stdin   id \t first_seen \t last_seen \t command
 *   stdout  ioc_type \t value \t meta \t first_seen \t last_seen \t 1 \t id
 *
 * Same shape, and the same reasoning, as db/backfill/template-stream.js: the
 * rules live in backend/lib/iocs.js and are used by the ingest path too, so a
 * plpgsql reimplementation would be a second copy that drifts.
 *
 * COPY's text format rather than CSV because it is strictly line-oriented —
 * a newline inside a command is written as the two characters \ and n, so one
 * input line is always exactly one row.
 */

const readline = require('node:readline');
const { extractIocs } = require('../../backend/lib/iocs');

const UNESCAPE = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };

function unescape(s) {
  return s.replace(/\\(.)/g, (m, c) => (c in UNESCAPE ? UNESCAPE[c] : m));
}

function escape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** One input row in, zero or more output rows out. */
function transformLine(line) {
  if (line === '' || line === '\\.') return [];
  const parts = line.split('\t');
  if (parts.length < 4) return [];
  const [id, firstSeen, lastSeen] = parts;
  // The command may itself contain escaped tabs, so rejoin everything after
  // the third separator rather than assuming exactly four fields.
  const command = unescape(parts.slice(3).join('\t'));
  if (command === '\\N') return [];

  return extractIocs(command).map((i) =>
    [
      i.type,
      escape(i.value),
      escape(JSON.stringify(i.meta || {})),
      firstSeen,
      lastSeen,
      '1',
      id,
    ].join('\t')
  );
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let rows = 0;
  rl.on('line', (line) => {
    for (const out of transformLine(line)) {
      process.stdout.write(`${out}\n`);
      rows++;
    }
  });
  rl.on('close', () => process.stderr.write(`${rows} indicators extracted\n`));
}

module.exports = { unescape, escape, transformLine };
