const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.INGEST_API_KEY = process.env.INGEST_API_KEY || 'test';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'test';

const { getCachedLeaderboard, setCachedLeaderboard, leaderboardCache } = require('../cache');

describe('leaderboardCache', () => {
  test('stores and returns a value', () => {
    setCachedLeaderboard('k1', { rows: [1] });
    assert.deepEqual(getCachedLeaderboard('k1'), { rows: [1] });
  });

  test('misses on an unknown key rather than throwing', () => {
    assert.equal(getCachedLeaderboard('never-set'), null);
  });

  test('is bounded, so user-controlled keys cannot grow it forever', () => {
    // The reason this file exists. Keys embed the `search` query parameter,
    // so anything issuing varying searches used to grow a plain Map with no
    // eviction for the lifetime of the process.
    leaderboardCache.clear();
    for (let i = 0; i < 5000; i++) {
      setCachedLeaderboard(`sessions:50:0:24:term-${i}`, { rows: [] });
    }
    assert.ok(
      leaderboardCache.size <= 500,
      `expected the cache to stay bounded, held ${leaderboardCache.size}`
    );
  });

  test('keeps the most recent entries when it evicts', () => {
    leaderboardCache.clear();
    for (let i = 0; i < 600; i++) setCachedLeaderboard(`k${i}`, i);
    assert.equal(getCachedLeaderboard('k599'), 599, 'newest should survive');
    assert.equal(getCachedLeaderboard('k0'), null, 'oldest should be evicted');
  });
});
