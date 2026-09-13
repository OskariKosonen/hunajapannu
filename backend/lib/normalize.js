/**
 * Command templatization.
 *
 * Attackers randomise a handful of fields — dropped binary names, temp file
 * names, generated passwords, the hidden directory the spreader runs from —
 * which turns one campaign into thousands of "unique" commands. Replacing
 * those fields with placeholders collapses a family back to the one command
 * it really is, while the raw text is kept untouched alongside it.
 *
 * Two rules govern everything here:
 *
 * 1. Only replace what is demonstrably random. A fixed password is a
 *    fingerprint of the actor, not noise: `modzmodz` identifies the meow
 *    loader and `kitty911+++` is somebody's one-off. Tokenising those would
 *    merge distinct actors into one template and destroy the signal. Hence
 *    looksRandom(), which every substitution is gated on.
 *
 * 2. Preserve the first credential field in the passwd/chpasswd families.
 *    In `echo -e "support\nAbc123def\nAbc123def"|passwd` the first field is
 *    the account whose password is being changed — the credential that
 *    actually worked — and the repeated field after it is the new random
 *    password. The first survives; the repeats are tokenised.
 *
 * Order matters. Wallets and SSH keys are matched before the generic base64
 * rule, or the generic rule eats them; the credential rules run before the
 * generic random-token rules, or the first credential is lost.
 */

const TOKENS = {
  RAND8: '<RAND8>',
  RAND10: '<RAND10>',
  RAND12: '<RAND12>',
  RANDNUM: '<RANDNUM>',
  SIZE: '<SIZE>',
  IP: '<IP>',
  XMR: '<XMR_WALLET>',
  B64: '<B64CONFIG>',
  SSHKEY: '<SSHKEY>',
};

/**
 * Does this string look machine-generated rather than chosen by a human?
 *
 * The guard that stops `./iptables` becoming `./<RAND8>` and `root:123456`
 * becoming `root:<RAND12>`. Requires both letters and digits, and either
 * mixed case or real length — which `123456`, `qwerty`, `modzmodz`,
 * `raspberry` and `P@ssw0rd` all fail, and `V62vtXQH`, `NDJLWZSP90` and
 * `6ePLHArr17wr` all pass.
 */
function looksRandom(s) {
  if (!s || s.length < 8) return false;
  // Punctuation is a tell that a person chose it: P@ssw0rd, kitty911+++.
  // Every generated token in this corpus is pure alphanumeric.
  if (!/^[A-Za-z0-9]+$/.test(s)) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  const digits = (s.match(/[0-9]/g) || []).length;
  const mixedCase = /[a-z]/.test(s) && /[A-Z]/.test(s);
  // At ten-plus, either digits or mixed case is enough: QJBNafTBhy carries no
  // digit at all and is plainly generated, while raspberry is neither.
  if (s.length >= 10) return digits > 0 || mixedCase;
  // Below that the bar is higher, or Passw0rd, admin123 and iptables slip in.
  return mixedCase && digits >= 2;
}

/**
 * Looser test for positions where the surrounding text already establishes
 * that the field is a generated name: `openssl passwd -1 X`, `/tmp/X`,
 * `chmod +x X`. Nothing legitimate sits there, so mixed case OR a digit is
 * enough, which catches uh8MVfGN and NVfJHFOt (one digit and none) while
 * still rejecting iptables, slowhttp and busybox.
 */
function looksRandomInContext(s) {
  if (!s || s.length < 8) return false;
  if (!/^[A-Za-z0-9]+$/.test(s)) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  const mixedCase = /[a-z]/.test(s) && /[A-Z]/.test(s);
  return mixedCase || /[0-9]/.test(s);
}

/** Replace only when the captured group looks random; otherwise leave as-is. */
function replaceIfRandom(text, re, build, guard = looksRandom) {
  return text.replace(re, (match, ...groups) => {
    const captured = groups.find((g) => typeof g === 'string');
    return guard(captured) ? build(match, captured) : match;
  });
}

function normalizeCommand(command) {
  if (typeof command !== 'string' || command === '') return command;
  let t = command;

  // --- high-entropy blobs, before the generic base64 rule can swallow them ---

  // Monero: 95 chars of base58 starting 4. Length-anchored, so it cannot
  // match a shorter accidental run.
  t = t.replace(/\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g, TOKENS.XMR);

  // An SSH public key body always starts AAAA once base64-encoded. Tokenised
  // so authorized_keys injections share one template; the raw command still
  // carries the key for IOC extraction.
  t = t.replace(/\bAAAA[A-Za-z0-9+/]{40,}={0,3}/g, TOKENS.SSHKEY);

  // --- structural numbers ---

  // The spreader's hidden directory: ./.4293177954799656937/sshd
  t = t.replace(/(\.\/\.)\d{6,}(\/)/g, `$1${TOKENS.RANDNUM}$2`);

  // Byte counts. Both forms carry the payload size, which clusters better as
  // a dimension than as part of the command identity.
  t = t.replace(/\bhead -c \d+/g, `head -c ${TOKENS.SIZE}`);
  t = t.replace(/\bcount=\d+/g, `count=${TOKENS.SIZE}`);

  // --- credentials: first field preserved, repeated new password tokenised ---

  // echo -e "acct\nPASS\nPASS"  /  echo "acct\nPASS\nPASS\n"
  // The backreference is what identifies the new password: it is the field
  // that appears twice. The account before it is never touched.
  t = t.replace(/(\\n)([A-Za-z0-9]{8,20})\1\2/g, (m, sep, pw) =>
    looksRandom(pw) ? `${sep}${TOKENS.RAND12}${sep}${TOKENS.RAND12}` : m
  );

  // openssl passwd -1 <generated>
  t = replaceIfRandom(t, /(?<=openssl passwd -1 )([A-Za-z0-9]{8,20})/g, () => TOKENS.RAND12,
    looksRandomInContext);

  // echo user:PASS | chpasswd — only when PASS is generated. root:123456,
  // ubnt:ubnt and admin1:modzmodz are left intact on purpose: they are how
  // the meow loader and its relatives are told apart.
  t = replaceIfRandom(t, /(?<=echo (?:-n )?[A-Za-z0-9_.$()-]{1,32}:)([A-Za-z0-9]{8,20})(?= *\|)/g,
    () => TOKENS.RAND12);

  // --- dropped binaries and temp files ---

  t = replaceIfRandom(t, /(?<=\/tmp\/)([A-Za-z0-9]{10})\b/g, () => TOKENS.RAND10, looksRandomInContext);
  t = replaceIfRandom(t, /(?<=\/tmp\/)([A-Za-z0-9]{8})\b/g, () => TOKENS.RAND8, looksRandomInContext);
  t = replaceIfRandom(t, /(?<=chmod \+x )([A-Za-z0-9]{8})\b/g, () => TOKENS.RAND8, looksRandomInContext);
  t = replaceIfRandom(t, /(?<=\.\/)([A-Za-z0-9]{8})\b/g, () => TOKENS.RAND8, looksRandomInContext);
  t = replaceIfRandom(t, /(?<=bash -c \.\/)([A-Za-z0-9]{8})\b/g, () => TOKENS.RAND8, looksRandomInContext);

  // --- addresses last: URLs and bare args alike ---
  // Kept out of the template but still present in the raw command, which is
  // what Phase 4 extracts C2 indicators from.
  t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, TOKENS.IP);

  // --- anything else long and base64-shaped: config blobs passed as argv ---
  t = t.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, TOKENS.B64);

  return t;
}

module.exports = { normalizeCommand, looksRandom, looksRandomInContext, TOKENS };
