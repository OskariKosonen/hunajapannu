/**
 * Not everything in cowrie_events.command is a command.
 *
 * Cowrie writes several of its own log messages into the same field, and they
 * have been accumulating there for the life of the project. Measured
 * 2026-09-13 over the full 7.69M command events:
 *
 *   Connection lost                  1,612 rows   1,479,102 events
 *   Remote SSH version:              1,057 rows   1,407,894 events
 *   SSH client hassh fingerprint:      164 rows   1,390,723 events
 *   login attempt [...]            202,066 rows   1,386,353 events
 *   ------------------------------------------------------------
 *   artifacts                                     5,663,072 events  (74%)
 *
 * This was invisible until Phase 0, because cowrie_unique_commands was
 * populated only by the modern ingest path, which maps cowrie.command.input
 * alone. That accident made the old 3,833-row rollup a clean — but tiny —
 * sample. Replaying the full history put the artifacts in for the first time
 * and pushed "Remote SSH version: SSH-2.0-Go" to the top of the leaderboard
 * with 756,238 hits.
 *
 * The rows stay. They are genuine evidence of sessions and client identity,
 * and the hassh values duplicate cowrie_client_fingerprints. They are simply
 * not commands, and nothing that reports on attacker behaviour should count
 * them.
 *
 * Phase 2 promotes this to a record_class column with a backfill. Until then
 * one predicate, shared by every caller, so the definition cannot drift
 * between endpoints.
 */

/** Prefixes that identify a Cowrie log message rather than a typed command. */
const ARTIFACT_PREFIXES = [
  'Remote SSH version:',
  'SSH client hassh fingerprint:',
  'Connection lost',
  'Terminal Size:',
  'login attempt [',
  'CMD: ',
  'INPUT (',
  // Found by re-checking the leaderboard after the first pass: the four above
  // were simply the loudest. A prefix list is inherently incomplete, which is
  // the argument for Phase 2 deriving record_class from the ingest event type
  // rather than from the text.
  // 1,443,250 rows on its own — 85% of the table. It embeds source IP, source
  // port and session id, so every connection mints a unique "command". This is
  // what was inflating the unique-command headline to 1.5M, and it also put the
  // sensor's LAN address (192.168.50.10:22) into a public endpoint.
  'New connection:',
  'SFTP Uploaded file',
  'Closing TTY Log:',
  'Saved redir contents with SHA-256',
  'Saved stdin contents with SHA-256',
  'public key login attempt for',
  // Distinct from the line above — no "login" — and 31,790 rows, 89% of what
  // survived the previous pass. One per key fingerprint, so it is singleton by
  // construction. Found by grouping kept rows on their first four words rather
  // than by eyeballing the leaderboard again; that sweep is what should have
  // been done at the start.
  'public key attempt for',
  'direct-tcp connection request to',
  'Enter new UNIX password:',
  'Could not read',
  'File download',
  'Command not found',
];

/** Exact strings, not prefixes: bare JSON fragments logged into the field. */
const ARTIFACT_EXACT = ['{}', '[]', '', '?'];

/**
 * SQL predicate keeping only real commands.
 *
 * @param {string} col - column reference, e.g. 'command' or 'u.command'
 * @returns {string} a SQL boolean expression
 */
function realCommandSql(col = 'command') {
  const pre = ARTIFACT_PREFIXES.map((p) => `${col} NOT LIKE '${p.replace(/'/g, "''")}%'`);
  const exact = ARTIFACT_EXACT.map((v) => `${col} <> '${v.replace(/'/g, "''")}'`);
  return [...pre, ...exact].join('\n         AND ');
}

/** Same test in JS, for snapshots already held in memory. */
function isRealCommand(command) {
  if (!command) return false;
  if (ARTIFACT_EXACT.includes(command)) return false;
  return !ARTIFACT_PREFIXES.some((p) => command.startsWith(p));
}

module.exports = { ARTIFACT_PREFIXES, ARTIFACT_EXACT, realCommandSql, isRealCommand };
