const test = require('node:test');
const assert = require('node:assert');
const { scoreCommand, THRESHOLD, RULES, COMPILED } = require('../lib/honeypot-probe');

test('every rule in the file is well formed', () => {
  // The file is the interface. A typo here is a silent scoring change, so it
  // should fail a test rather than quietly stop matching.
  const ids = new Set();
  for (const r of RULES.rules) {
    assert.ok(r.id && !ids.has(r.id), `duplicate or missing id: ${r.id}`);
    ids.add(r.id);
    assert.ok(Number.isInteger(r.weight) && r.weight > 0, `${r.id}: weight must be a positive integer`);
    assert.ok(r.category, `${r.id}: needs a category`);
    assert.ok(r.why, `${r.id}: needs a reason a reader can evaluate`);
    assert.doesNotThrow(() => new RegExp(r.pattern, 'i'), `${r.id}: pattern must compile`);
  }
  assert.ok(THRESHOLD > 0);
});

test('naming a hypervisor is decisive on its own', () => {
  const r = scoreCommand('systemd-detect-virt || dmidecode -s system-product-name');
  assert.strictEqual(r.isProbe, true);
  assert.ok(r.categories.includes('virtualisation'));
});

test('a hypervisor name inside a password is not a hypervisor check', () => {
  // The rule that caught this was matching "kvm" as a bare substring, and the
  // corpus contains `openssl passwd -1 3HKvmnWk`. Word boundaries are the fix
  // and this is the regression test for them.
  const r = scoreCommand('openssl passwd -1 3HKvmnWk');
  assert.strictEqual(r.matched.includes('hypervisor-by-name'), false);
  assert.strictEqual(r.isProbe, false);
});

test('ordinary recon is scored but not accused', () => {
  // Reading cpuinfo or uname is how nearly every botnet opens. Treating that
  // as honeypot detection would flag most of the corpus and mean nothing.
  for (const c of ['uname -a', 'cat /proc/cpuinfo', 'free -m', 'w', 'crontab -l']) {
    const r = scoreCommand(c);
    assert.strictEqual(r.isProbe, false, `should not be a probe: ${c}`);
  }
});

test('weak signals accumulate into suspicion', () => {
  // Any one of these is recon. A sweep of all of them is a fingerprint of the
  // platform, which is why weight 1 rules still count for something.
  const r = scoreCommand('uname -a; cat /proc/cpuinfo; free -m; uptime; ps aux');
  assert.ok(r.score >= THRESHOLD);
  assert.deepStrictEqual(r.categories, ['fingerprint']);
});

test('the categories say which kind of evidence was found', () => {
  // A caller can tell a deliberate check from an accumulation of weak ones,
  // which a single boolean could not express.
  const deliberate = scoreCommand('virt-what; which curl');
  assert.ok(deliberate.categories.includes('virtualisation'));
  assert.ok(deliberate.categories.includes('capability'));
});

test('naming the honeypot software outright is the strongest signal', () => {
  const r = scoreCommand("echo 'test_honeypot_check'");
  assert.ok(r.matched.includes('explicit-honeypot-string'));
  assert.strictEqual(r.isProbe, true);
});

test('a cowrie path in a log line is not an attacker probe', () => {
  // Cowrie logs "Downloaded URL (...) to var/lib/cowrie/downloads/...", which
  // contains the word and would score 5. Those rows are record_class
  // log_artifact and must never reach this scorer; this documents why the
  // caller filters rather than the rule.
  const logLine = 'Downloaded URL (http://1.2.3.4/x) with SHA-256 abc to var/lib/cowrie/downloads/';
  assert.strictEqual(scoreCommand(logLine).isProbe, true,
    'the scorer cannot tell — filtering by record_class is the caller\'s job');
});

test('degenerate input scores zero and never throws', () => {
  for (const c of [null, undefined, '', 42, {}]) {
    assert.doesNotThrow(() => scoreCommand(c));
    assert.deepStrictEqual(scoreCommand(c), { score: 0, isProbe: false, matched: [], categories: [] });
  }
});

test('an unmatched command scores exactly zero', () => {
  const r = scoreCommand('ls -la /var/www');
  assert.strictEqual(r.score, 0);
  assert.deepStrictEqual(r.matched, []);
});

test('the compiled rules match the file, one for one', () => {
  assert.strictEqual(COMPILED.length, RULES.rules.length);
});
