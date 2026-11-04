/**
 * Choosing the session the front page replays.
 *
 * The replay is the first thing a visitor reads closely, so the session should
 * show an attack: get in, look around, fetch something, run it. What real
 * attacks look like here decided the rules:
 *
 * - They are scripts. Bots send the whole attack as one line,
 *   "cd /tmp; wget ...; chmod +x ...; ./x; rm ...", often 1-3 kB long. The
 *   replay clamps long commands to their opening, so length is not a problem.
 * - What is unreadable is a payload: a binary pushed through `echo` as one
 *   unbroken run of base64 or hex, sometimes 100 kB of it.
 * - Fingerprinting probes run dozens of short commands that differ only in a
 *   hash. Many commands, almost no variety.
 *
 * So a session is scored on the variety of programs it runs, the ATT&CK
 * techniques they map to and whether it downloads anything, and loses heavily
 * for every payload blob. Pure, so the ranking can be tested without a
 * database.
 */

const { tagCommand } = require('./mitre');

// An unbroken run this long is a payload, not something a person reads.
const BLOB_RUN = /\S{200,}/;
// Fewer distinct programs than this is a probe or a one-off, not an attack.
const MIN_VERBS = 3;
const VERB_CAP = 10;
const COMMAND_CAP = 6;
// Kept for the SQL shortlist, which prefers sessions with readable lines.
const READABLE_MAX = 200;

// Shell syntax, not programs.
const KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done',
  'case', 'esac', 'in', 'function', 'select', 'time', 'true', 'false',
]);

/**
 * The programs a command runs: the first word of each piece between ; && ||
 * and |, without wrappers like sudo or sh -c and without a path. Only
 * program-shaped names count, so a probe's "f_check_53245978362c..." does not.
 */
function verbsOf(command) {
  return command
    .split(/;|&&|\|\||\||\n/)
    .map((part) =>
      part
        .trim()
        .replace(/^#!\S*\s*/, '')
        .replace(/^(?:(?:\S*\/)?(?:sudo|nohup|busybox|exec|command)\s+|(?:\S*\/)?(?:ba)?sh\s+-c\s+['"]?|\(+)+/, '')
        .match(/^[\w./-]+/)?.[0]
        ?.split('/')
        .pop()
    )
    .filter((v) => v && /^[a-z][\w.+-]{0,19}$/i.test(v) && !KEYWORDS.has(v));
}

/**
 * @param {string[]} commands every command the session ran, in any order
 * @returns {number|null} higher is better; null when it is not an attack worth replaying
 */
function scoreSession(commands) {
  const distinct = [...new Set(commands.filter((c) => typeof c === 'string' && c.trim()))];
  const verbs = new Set(distinct.flatMap(verbsOf));
  if (verbs.size < MIN_VERBS) return null;

  const blobs = distinct.filter((c) => BLOB_RUN.test(c)).length;
  const techniques = new Set(distinct.flatMap((c) => tagCommand(c)));

  return (
    4 * techniques.size +
    2 * Math.min(verbs.size, VERB_CAP) +
    // Fetching a payload is the turning point of most sessions worth watching.
    (techniques.has('T1105') ? 6 : 0) +
    Math.min(distinct.length, COMMAND_CAP) -
    8 * blobs
  );
}

/**
 * @param {Array<{ session_id: string, commands: string[] }>} candidates
 * @returns {string|null} the session to feature
 */
function pickFeatured(candidates) {
  let best = null;
  for (const c of candidates) {
    const score = scoreSession(c.commands);
    if (score == null) continue;
    if (!best || score > best.score) best = { id: c.session_id, score };
  }
  return best ? best.id : null;
}

module.exports = { scoreSession, pickFeatured, verbsOf, READABLE_MAX };
