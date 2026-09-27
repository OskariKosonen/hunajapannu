/**
 * Scores a command for signs the attacker is checking whether the box is real.
 *
 * The rules live in rules/honeypot-probes.json, so adding one is an edit to a
 * data file and a deploy rather than a code change. That was a deliberate
 * requirement and it is worth being honest about its limit: the *rules* are
 * data, the *matching* is not. A rule that needs anything other than a
 * case-insensitive regex over the command text still needs code here.
 *
 * Scored rather than classified. Reading /proc/cpuinfo is both ordinary recon
 * and a core-count check; naming a hypervisor has no innocent reading. A
 * boolean would have to pretend those are the same kind of evidence. The
 * weights keep the difference visible, and `threshold` is where the file
 * decides how much accumulated suspicion counts as a probe.
 */

const RULES = require('./rules/honeypot-probes.json');

// Compiled once. Patterns come from a file in the repository, not from user
// input, so the only failure mode is a typo by whoever edited it — which
// should be loud at startup rather than silent at match time.
const COMPILED = RULES.rules.map((rule) => {
  try {
    return { ...rule, re: new RegExp(rule.pattern, 'i') };
  } catch (err) {
    throw new Error(`honeypot-probes.json: rule "${rule.id}" has an invalid pattern: ${err.message}`);
  }
});

const THRESHOLD = RULES.threshold;

/**
 * @param {string} command
 * @returns {{score: number, isProbe: boolean, matched: string[], categories: string[]}}
 */
function scoreCommand(command) {
  if (typeof command !== 'string' || command === '') {
    return { score: 0, isProbe: false, matched: [], categories: [] };
  }

  let score = 0;
  const matched = [];
  const categories = new Set();
  for (const rule of COMPILED) {
    if (!rule.re.test(command)) continue;
    score += rule.weight;
    matched.push(rule.id);
    categories.add(rule.category);
  }

  return { score, isProbe: score >= THRESHOLD, matched, categories: [...categories] };
}

module.exports = { scoreCommand, THRESHOLD, RULES, COMPILED };
