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
// six times the story of a 20-line one.
const READABLE_CAP = 25;
const MIN_READABLE = 3;

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

  return (
    4 * techniques.size +
    Math.min(readable, READABLE_CAP) +
    // Fetching a payload is the turning point of most sessions worth watching.
    (techniques.has('T1105') ? 5 : 0) -
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

module.exports = { scoreSession, pickFeatured, READABLE_MAX };
