const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.INGEST_API_KEY = process.env.INGEST_API_KEY || 'test';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'test';

const { cached, leaderboardCache, inFlight } = require('../cache');

// Every test drives the cache the way the routes do, through cached(), rather
// than poking values in directly.
const put = (key, value) => cached(key, async () => value);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('leaderboardCache is bounded', () => {
  test('user-controlled keys cannot grow it forever', async () => {
    // The reason this file exists. Cache keys embed the `search` query
    // parameter, so anything issuing varying searches used to grow a plain Map
    // with no eviction for the lifetime of the process.
    leaderboardCache.clear();
    for (let i = 0; i < 5000; i++) {
      await put(`creds:50:0:term-${i}`, { rows: [] });
    }
    assert.ok(
      leaderboardCache.size <= 500,
      `expected the cache to stay bounded, held ${leaderboardCache.size}`
    );
  });

  test('keeps the most recent entries when it evicts', async () => {
    leaderboardCache.clear();
    for (let i = 0; i < 600; i++) await put(`k${i}`, i);

    let recomputed = false;
    assert.equal(await cached('k599', async () => { recomputed = true; return -1; }), 599);
    assert.equal(recomputed, false, 'newest should have survived');

    assert.equal(await cached('k0', async () => 'rebuilt'), 'rebuilt', 'oldest should be evicted');
  });
});

describe('cached', () => {
  test('produces once, then serves from the cache', async () => {
    leaderboardCache.clear();
    let calls = 0;
    const produce = async () => { calls += 1; return { rows: [calls] }; };

    assert.deepEqual(await cached('c1', produce), { rows: [1] });
    assert.deepEqual(await cached('c1', produce), { rows: [1] });
    assert.equal(calls, 1, 'second call should have been a cache hit');
  });

  test('concurrent callers share one production', async () => {
    // The reason cached() exists. Without the single-flight, every request
    // arriving while an entry is cold starts its own copy of the query, so the
    // moment the TTL expires the database gets a burst of identical work.
    leaderboardCache.clear();
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const produce = async () => { calls += 1; await gate; return 'value'; };

    const all = Promise.all([cached('c2', produce), cached('c2', produce), cached('c2', produce)]);
    release();

    assert.deepEqual(await all, ['value', 'value', 'value']);
    assert.equal(calls, 1, `expected one production, got ${calls}`);
  });

  test('different keys are produced independently', async () => {
    leaderboardCache.clear();
    const [a, b] = await Promise.all([put('c3:a', 'a'), put('c3:b', 'b')]);
    assert.equal(a, 'a');
    assert.equal(b, 'b');
  });

  test('does not cache null, so "no answer yet" is re-checked', async () => {
    // /sessions/featured returns null for a window with no sessions in it. That
    // is not an answer worth remembering for a minute.
    leaderboardCache.clear();
    let calls = 0;
    const produce = async () => { calls += 1; return null; };

    assert.equal(await cached('c4', produce), null);
    assert.equal(await cached('c4', produce), null);
    assert.equal(calls, 2, 'null should not have been cached');
  });

  test('caches an empty array, which is a real answer', async () => {
    leaderboardCache.clear();
    let calls = 0;
    const produce = async () => { calls += 1; return []; };

    assert.deepEqual(await cached('c5', produce), []);
    assert.deepEqual(await cached('c5', produce), []);
    assert.equal(calls, 1, 'an empty result set is still a result');
  });

  test('does not cache failures, and clears the in-flight entry', async () => {
    leaderboardCache.clear();
    let calls = 0;
    const produce = async () => { calls += 1; throw new Error('database query failed'); };

    await assert.rejects(cached('c6', produce), /database query failed/);
    await assert.rejects(cached('c6', produce), /database query failed/);
    assert.equal(calls, 2, 'a failure should be retried, not served for a minute');
    assert.equal(inFlight.has('c6'), false, 'in-flight entry leaked after a rejection');
  });

  test('a producer that throws synchronously rejects rather than blowing up', async () => {
    leaderboardCache.clear();
    await assert.rejects(cached('c7', () => { throw new Error('sync boom'); }), /sync boom/);
    assert.equal(inFlight.has('c7'), false);
  });

  test('a cached falsy value is a hit, not a miss', async () => {
    // The old call sites read the cache as `if (cached)`, which would have
    // re-queried for a legitimately cached 0.
    leaderboardCache.clear();
    let calls = 0;
    const produce = async () => { calls += 1; return 0; };

    assert.equal(await cached('c8', produce), 0);
    assert.equal(await cached('c8', produce), 0);
    assert.equal(calls, 1);
  });

  test('honours a per-key ttl override', async () => {
    // /summary keeps its own knob because it is on the critical path of every
    // page load. The default TTL is a minute, so if the override were ignored
    // the second call below would still be a hit.
    leaderboardCache.clear();
    assert.equal(await cached('c9', async () => 'first', { ttl: 20 }), 'first');
    await sleep(40);
    assert.equal(await cached('c9', async () => 'second'), 'second');
  });
});
