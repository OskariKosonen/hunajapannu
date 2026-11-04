/**
 * Choosing the session the front page replays.
 *
 * The replay is the first thing a visitor reads closely, so the session should
 * tell a story: someone logs in, looks around, pulls something down. Ranking by
 * distinct commands picked the opposite. Script-driven droppers run a hundred
 * near-identical lines and push binaries through `echo` as 100,000-character
 * base64 blobs, so the "busiest" session was mostly noise.
 *
 * The SQL shortlists sessions with enough readable commands; this scores the
 * shortlist. Pure, so the ranking can be tested without a database.
 */

const { tagCommand } = require('./mitre');

// A line a visitor can read in the replay without it wrapping into a wall.
const READABLE_MAX = 200;
// Past this it is a payload pushed through the shell, not a command.
const BLOB_MIN = 400;
// More readable commands than this stop counting: a 120-line script is not
// ten times the story of a 12-line one.
const READABLE_CAP = 12;
const MIN_READABLE = 3;
// Distinct programs run, up to this many, are worth more than raw lines.
const VERB_CAP = 8;

/**
 * The programs a command runs: the first word of each piece between ; && ||
 * and |, without wrappers like sudo or sh -c and without a path.
 *
 * Variety is what separates an attack worth watching (uname, cat, wget,
 * chmod, ./x) from a probe script that runs printf forty times with
 * different arguments. Distinct command strings could not tell them apart.
 */
function verbsOf(command) {
  return command
    .split(/;|&&|\|\||\|/)
    .map((part) =>
      part
        .trim()
        .replace(/^(?:(?:\S*\/)?(?:sudo|nohup|busybox|exec|command)\s+|(?:\S*\/)?(?:ba)?sh\s+-c\s+['"]?)+/, "")
        .match(/^[\w./-]+/)?.[0]
        ?.split("/")
        .pop()
    )
    // Program-shaped names only: "f_check_53245978362c..." is a function a
    // probe script defined, and forty of them are not forty programs.
    .filter((v) => v && /^[a-z][\w.+-]{0,19}$/i.test(v));
}

/**
 * @param {string[]} commands every command the session ran, in any order
 * @returns {number|null} higher is better; null when there is no story to tell
 */
function scoreSession(commands) {
  const distinct = [...new Set(commands.filter((c) => typeof c === 'string' && c.trim()))];
  const readable = distinct.filter((c) => c.length <= READABLE_MAX).length;
  if (readable < MIN_READABLE) return null;

  const blobs = distinct.filter((c) => c.length > BLOB_MIN).length;
  const techniques = new Set(distinct.flatMap((c) => tagCommand(c)));
  const verbs = new Set(distinct.flatMap(verbsOf));

  return (
    4 * techniques.size +
    2 * Math.min(verbs.size, VERB_CAP) +
    // At most three readable lines per program count, so forty variations of
    // one printf earn little over four of them.
    Math.min(readable, 3 * verbs.size, READABLE_CAP) +
    // Fetching a payload is the turning point of most sessions worth watching.
    (techniques.has('T1105') ? 6 : 0) -
    6 * blobs
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
