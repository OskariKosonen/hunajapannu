const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { assessIngest } = require('../lib/health');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const cfg = { staleAfterSeconds: 1800, skewToleranceSeconds: 120 };
const at = (iso) => new Date(iso);

describe('assessIngest', () => {
  test('reports ok for a feed that is currently delivering', () => {
    const r = assessIngest(at('2026-08-16T11:59:00Z'), NOW, cfg);
    assert.equal(r.status, 'ok');
    assert.equal(r.ingestStale, false);
    assert.equal(r.clockSkewed, false);
    assert.equal(r.lastEventAgeSeconds, 60);
    assert.equal(r.clockSkewSeconds, 0);
  });

  test('flags a feed that has gone quiet past the threshold', () => {
    const r = assessIngest(at('2026-08-16T11:00:00Z'), NOW, cfg);
    assert.equal(r.lastEventAgeSeconds, 3600);
    assert.equal(r.ingestStale, true);
    assert.equal(r.status, 'degraded');
  });

  test('treats an empty database as stale, not as healthy', () => {
    // A fresh install and a dead feed look identical here; both must alert.
    const r = assessIngest(null, NOW, cfg);
    assert.equal(r.lastEventAt, null);
    assert.equal(r.lastEventAgeSeconds, null);
    assert.equal(r.ingestStale, true);
    assert.equal(r.status, 'degraded');
  });

  test('does not flag a feed sitting just inside the stale threshold', () => {
    const r = assessIngest(new Date(NOW - 1800 * 1000), NOW, cfg);
    assert.equal(r.lastEventAgeSeconds, 1800);
    assert.equal(r.ingestStale, false, 'exactly at the threshold is not yet stale');
  });

  describe('clock skew', () => {
    test('reports future-stamped events as skew, not as fresh data', () => {
      // The 2026-08-11 failure mode: Cowrie wrote local BST times labelled
      // 'Z', putting every event an hour ahead. A naive reading of the age
      // says "-3600s old", i.e. extremely fresh, which would hide a feed
      // that had actually stopped.
      const r = assessIngest(at('2026-08-16T13:00:00Z'), NOW, cfg);
      assert.equal(r.lastEventAgeSeconds, -3600);
      assert.equal(r.clockSkewSeconds, 3600, 'skew is reported positive');
      assert.equal(r.clockSkewed, true);
      assert.equal(r.status, 'degraded');
    });

    test('a skewed feed is not also called stale', () => {
      // Both flags firing at once would make the watchdog open two issues
      // for one fault.
      const r = assessIngest(at('2026-08-16T13:00:00Z'), NOW, cfg);
      assert.equal(r.ingestStale, false);
    });

    test('tolerates small skew rather than alerting on NTP jitter', () => {
      const r = assessIngest(new Date(NOW + 60 * 1000), NOW, cfg);
      assert.equal(r.clockSkewSeconds, 60);
      assert.equal(r.clockSkewed, false);
      assert.equal(r.status, 'ok');
    });

    test('never reports negative skew for ordinary past events', () => {
      const r = assessIngest(at('2026-08-16T11:59:00Z'), NOW, cfg);
      assert.equal(r.clockSkewSeconds, 0);
    });

    test('catches a feed that is both far in the future and long dead', () => {
      // Skew draining after the forwarder fix: still ahead of us, and the
      // status must stay degraded until it clears.
      const r = assessIngest(new Date(NOW + 121 * 1000), NOW, cfg);
      assert.equal(r.clockSkewed, true);
      assert.equal(r.status, 'degraded');
    });
  });

  test('emits lastEventAt as an ISO string for the watchdog to parse', () => {
    const r = assessIngest(at('2026-08-16T11:59:00Z'), NOW, cfg);
    assert.equal(r.lastEventAt, '2026-08-16T11:59:00.000Z');
  });
});
