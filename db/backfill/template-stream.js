#!/usr/bin/env node
/**
 * Streaming normalizer: PostgreSQL COPY text format in, COPY text format out.
 *
 *   stdin   id \t command      (COPY ... TO STDOUT)
 *   stdout  id \t template     (COPY ... FROM STDIN)
 *
 * This exists so the backfill can use the same backend/lib/normalize.js that
 * the ingest path uses. A plpgsql reimplementation would be a second copy of
 * the rules, and when two copies drift they produce two templates for one
 * campaign without anything erroring.
 *
 * COPY's *text* format is used rather than CSV because it is strictly
 * line-oriented: a newline inside a command is written as the two characters
 * \ and n, so one input line is always exactly one row. CSV would quote the
 * newline instead and require a real CSV parser on this side, which is a lot
 * of surface area to get subtly wrong on data that includes deliberately
 * malformed shell.
 */

const readline = require('node:readline');
const { normalizeCommand } = require('../../backend/lib/normalize');

// The escapes COPY TEXT emits. Backslash is handled by the alternation, not
// separately, so `\\n` (a literal backslash followed by n, which is what the
// passwd family actually contains) round-trips as a backslash and an n rather
// than becoming a newline.
const UNESCAPE = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };

function unescape(s) {
  return s.replace(/\\(.)/g, (m, c) => (c in UNESCAPE ? UNESCAPE[c] : m));
}

function escape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\x08/g, '\\b')
    .replace(/\f/g, '\\f')
    .replace(/\v/g, '\\v');
}

/** One COPY TEXT line in, one out. Returns null for a line to drop. */
function transformLine(line) {
  if (line === '' || line === '\\.') return null;
  const tab = line.indexOf('\t');
  if (tab < 0) return null;
  const id = line.slice(0, tab);
  const raw = line.slice(tab + 1);
  // command is NOT NULL, so \N should never appear; skip rather than write a
  // template for a row we cannot reconstruct.
  if (raw === '\\N') return null;
  return `${id}\t${escape(normalizeCommand(unescape(raw)))}`;
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let rows = 0;
  rl.on('line', (line) => {
    const out = transformLine(line);
    if (out === null) return;
    process.stdout.write(`${out}\n`);
    rows++;
  });
  rl.on('close', () => process.stderr.write(`${rows} rows normalized\n`));
}

module.exports = { unescape, escape, transformLine };
