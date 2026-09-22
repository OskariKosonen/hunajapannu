/**
 * Not everything in cowrie_events.command is a command.
 *
 * Cowrie writes several of its own log messages into the same field, and they
 * have been accumulating there for the life of the project. Measured
 * 2026-09-22 over all 1,688,768 rollup rows:
 *
 *   log_artifact      1,684,736 rows   5,164,... events   (99.76% of rows)
 *   command               4,025 rows     298,467 events
 *   prompt_echo               2 rows       1,116 events
 *   binary_fragment           5 rows          34 events
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
 * Phase 2 turns the predicate into a stored record_class column (migration
 * 013). This module stays the single definition of how a row is classified:
 * classifyCommand() for the ingest path, recordClassSql() for the backfill.
 * Two implementations of the same rules drift, and a drifted classifier hides
 * real commands from every endpoint without erroring.
 */

/** The value set of the cowrie_record_class enum, in migration order. */
const RECORD_CLASSES = ['unknown', 'command', 'log_artifact', 'binary_fragment', 'prompt_echo'];

/**
 * Binary that landed in the command field, matched as an explicit list of
 * sha256 hashes rather than by signature.
 *
 * This is not laziness, it is the only correct option at this size. The
 * obvious heuristic — does the text contain "ELF" or "UPX!" — matches 12 rows,
 * and 6 of them are the /dev/tcp C2 loader commands, whose payload text
 * mentions UPX. Those six are the single most valuable family in the corpus
 * and Phase 4 exists to mine them; a substring rule would classify them as
 * garbage and the default filter would then hide them from every endpoint.
 *
 * There are no control bytes among real commands at all (measured: 0 of
 * 4,025), so there is no cheap byte-level test either. Five rows, five
 * hashes. Revisit if this ever needs a sixth.
 */
const BINARY_FRAGMENT_SHA256 = [
  // '>ELF'                                            1 event
  'c0c42bf6869232095a1470c917375b34310a541bbc6d565fc8612b5168c2fe20',
  // '>EA@/ \'8ELF~'                                    2 events
  '23f76381806a0f7225441e50442022a1710b7f4971dd8ff970407c7e074dadc2',
  // '>A@/1\'8ELF7}'                                    3 events
  'ac0c967b43a1c7823b97cea37ef5d54622ee4ae696c1b56bcd5290b913327299',
  // '>yoA@/;\'8ELFP;i2'                               14 events
  'bd45ca7d32548e2927e3f41c458da25369191e69a01b8a47ce01661423a0fdfc',
  // 'cat /bin/echoQtd#UPX!' — the file's own bytes    14 events
  'e8d735e884c2cdb7388d32264434e3c5e73529d51ae27a1c8275953ee9546756',
];

/**
 * The honeypot's own prompt, echoed back into the command field. Two rows,
 * differing only by a trailing space, 1,116 events between them.
 */
const PROMPT_ECHO_PREFIXES = ['Enter new UNIX password:'];

/** Prefixes that identify a Cowrie log message rather than a typed command. */
const LOG_ARTIFACT_PREFIXES = [
  'Remote SSH version:',
  'SSH client hassh fingerprint:',
  'Connection lost',
  'Terminal Size:',
  'login attempt [',
  'CMD: ',
  'INPUT (',
  // Found by re-checking the leaderboard after the first pass: the four above
  // were simply the loudest. A prefix list is inherently incomplete, which is
  // why an unmatched row falls to 'command' and is therefore visible: the
  // failure mode is a stray artifact on the leaderboard, which someone
  // notices, rather than a silently hidden command, which nobody does.
  //
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
  'reversedns:',
  'Attempt to download file(s) from URL',
];

/** Exact strings, not prefixes: bare JSON fragments logged into the field. */
const LOG_ARTIFACT_EXACT = ['{}', '[]', '', '?'];

// Dropped in Phase 2: 'Could not read', 'File download' and 'Command not
// found' were added defensively during the Phase 0 firefight and match zero
// rows in the full history. An explicit match list should describe observed
// data; carrying three predicates that have never fired only suggests the
// list was derived from guesswork rather than from the corpus.

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * The original text predicate, kept alive on purpose.
 *
 * record_class is populated by a backfill that rewrites 1.6M rows, and on
 * 2026-09-22 doing that inside the migration filled the disk and took
 * PostgreSQL down. The schema change and the behaviour change are therefore
 * separated: this deploy adds the column and classifies new rows as they
 * arrive, the backfill runs afterwards at its own pace, and only once it has
 * finished does a second deploy switch the endpoints to classFilterSql.
 *
 * Until then the endpoints keep asking the question this way, which is slower
 * but correct against a half-classified table. Delete it in that second
 * deploy, not before.
 */
function realCommandSql(col = 'command') {
  const pre = [...LOG_ARTIFACT_PREFIXES, ...PROMPT_ECHO_PREFIXES]
    .map((p) => `${col} NOT LIKE ${quote(`${p}%`)}`);
  const exact = LOG_ARTIFACT_EXACT.map((v) => `${col} <> ${quote(v)}`);
  return [...pre, ...exact].join('\n         AND ');
}

/**
 * The CASE expression that assigns a class, generated from the lists above so
 * the backfill and the ingest path cannot disagree.
 *
 * @param {string} col  - the command column, e.g. 'command'
 * @param {string} hash - the sha256 column, e.g. 'command_sha256'
 */
function recordClassSql(col = 'command', hash = 'command_sha256') {
  const binary = BINARY_FRAGMENT_SHA256.map(quote).join(', ');
  const prompt = PROMPT_ECHO_PREFIXES.map((p) => `${col} LIKE ${quote(`${p}%`)}`).join('\n         OR ');
  const artifact = [
    ...LOG_ARTIFACT_PREFIXES.map((p) => `${col} LIKE ${quote(`${p}%`)}`),
    ...LOG_ARTIFACT_EXACT.map((v) => `${col} = ${quote(v)}`),
  ].join('\n         OR ');

  // Most specific first. The three tests are in fact disjoint over the current
  // corpus — no binary-fragment row carries an artifact prefix — but ordering
  // them anyway means a future addition cannot silently change an existing
  // row's class depending on which branch happens to be written first.
  return `CASE
    WHEN encode(${hash}, 'hex') IN (${binary}) THEN 'binary_fragment'
    WHEN ${prompt} THEN 'prompt_echo'
    WHEN ${artifact} THEN 'log_artifact'
    ELSE 'command'
  END::cowrie_record_class`;
}

/**
 * The same decision in JS, for the ingest path.
 *
 * @param {string} command
 * @param {string} [sha256Hex] - lowercase hex sha256 of the command, if known
 */
function classifyCommand(command, sha256Hex) {
  if (typeof command !== 'string') return 'unknown';
  if (sha256Hex && BINARY_FRAGMENT_SHA256.includes(sha256Hex)) return 'binary_fragment';
  if (PROMPT_ECHO_PREFIXES.some((p) => command.startsWith(p))) return 'prompt_echo';
  if (LOG_ARTIFACT_EXACT.includes(command)) return 'log_artifact';
  if (LOG_ARTIFACT_PREFIXES.some((p) => command.startsWith(p))) return 'log_artifact';
  return 'command';
}

/**
 * The WHERE clause every behavioural endpoint applies.
 *
 * Default is 'command' alone. `?class=all` opts out, and a named class opts
 * into exactly that one — which is how you look at the artifacts deliberately
 * rather than by accident.
 */
function classFilterSql(requested, col = 'record_class') {
  if (requested === 'all') return 'TRUE';
  const cls = RECORD_CLASSES.includes(requested) ? requested : 'command';
  return `${col} = ${quote(cls)}`;
}

/** Parses ?class= into a value classFilterSql accepts. */
function parseClassParam(raw) {
  if (raw === 'all') return 'all';
  return RECORD_CLASSES.includes(raw) ? raw : 'command';
}

module.exports = {
  realCommandSql,
  RECORD_CLASSES,
  BINARY_FRAGMENT_SHA256,
  PROMPT_ECHO_PREFIXES,
  LOG_ARTIFACT_PREFIXES,
  LOG_ARTIFACT_EXACT,
  recordClassSql,
  classifyCommand,
  classFilterSql,
  parseClassParam,
};
