const test = require('node:test');
const assert = require('node:assert/strict');
const { concentration, parseDays } = require('../lib/insights');

test('counts the busiest networks needed to reach each share', () => {
  // 100 events: 40 + 30 reaches half on the second network, 80% on the third.
  const r = concentration([10, 40, 5, 30, 15], [0.5, 0.8, 0.9]);
  assert.equal(r.events, 100);
  assert.equal(r.networks, 5);
  assert.deepEqual(r.thresholds, [
    { share: 0.5, networks: 2 },
    { share: 0.8, networks: 3 },
    { share: 0.9, networks: 4 },
  ]);
});

test('a share reached exactly counts the network that reached it', () => {
  assert.equal(concentration([50, 50], [0.5]).thresholds[0].networks, 1);
});

test('accepts the bigint strings pg returns and ignores empty networks', () => {
  const r = concentration(['300', '100', '0'], [0.5]);
  assert.equal(r.events, 400);
  assert.equal(r.networks, 2);
  assert.equal(r.thresholds[0].networks, 1);
});

test('an empty table answers zero rather than dividing by it', () => {
  assert.deepEqual(concentration([], [0.5]), { events: 0, networks: 0, thresholds: [{ share: 0.5, networks: 0 }] });
});

test('days is clamped to a year and defaults to thirty', () => {
  assert.equal(parseDays(undefined), 30);
  assert.equal(parseDays('abc'), 30);
  assert.equal(parseDays('0'), 1);
  assert.equal(parseDays('7'), 7);
  assert.equal(parseDays('9999'), 365);
});
