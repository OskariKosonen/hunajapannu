/**
 * Short-lived cache for the read-only public endpoints.
 *
 * Two problems, one module.
 *
 * Boundedness. This was a plain Map with no eviction and no size limit. Its
 * keys embed user-controlled input — `creds:${limit}:${offset}:${search}` and
 * the same shape for files and top-asn — so anything issuing searches with
 * varying terms grew it for the lifetime of the process. A crawler, a scanner,
 * or one person holding a key down in the search box is enough; nothing ever
 * removed an entry. An LRU with a hard ceiling fixes that. 500 entries is
 * comfortably more than the distinct queries the dashboard itself issues, so
 * normal use never evicts.
 *
 * Stampedes. A cache miss used to mean every request that arrived during the
 * query started its own copy of it, so the moment an entry expired the database
 * got a burst of identical work. /summary grew its own single-flight for this
 * reason and the expensive endpoints did not have one — which was backwards,
 * since /commands tags 20k rows through the MITRE regexes and /payload-hosts
 * regex-scans every unique command. `cached()` below is that single-flight,
 * shared, so a new endpoint gets it by default instead of by remembering.
 *
 * One trade-off worth knowing about: the /commands snapshot used to live in its
 * own Map, keyed only by record class, so it could never be evicted. It shares
 * this cache now, which means 500 distinct search keys inside one TTL window
 * could push it out and force a rebuild. That is a re-query, not an outage, and
 * the single-flight means only one request pays for it — but if the snapshot
 * ever starts rebuilding under ordinary traffic, this is why.
 */

const { LRUCache } = require('lru-cache');
const { LEADERBOARD_CACHE_TTL_MS } = require('./config');

const leaderboardCache = new LRUCache({
  max: 500,
  // Expiry is the cache's job, not the caller's. An earlier version stored its
  // own expiresAt alongside each value and checked it on read, which meant the
  // TTL was defined twice and expired entries were retained until someone
  // happened to ask for that exact key again.
  ttl: LEADERBOARD_CACHE_TTL_MS,
});

// Key -> the promise currently producing that key's value.
const inFlight = new Map();

/**
 * Read `key` from the cache, or produce it.
 *
 * Concurrent callers for the same key share one `produce()` call. Resolving to
 * null or undefined caches nothing, which is how a producer says "no answer
 * right now" — a week with no sessions in it, say — without poisoning the entry
 * for the next minute.
 *
 * `ttl` overrides the default for this key; /summary is a minute either way but
 * keeps its own knob because it is the one endpoint on the critical path of
 * every page load.
 */
function cached(key, produce, { ttl } = {}) {
  const hit = leaderboardCache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);

  const pending = inFlight.get(key);
  if (pending) return pending;

  // Promise.resolve().then() rather than calling produce() bare, so a producer
  // that throws synchronously rejects like one that throws asynchronously and
  // still clears the in-flight entry.
  const flight = Promise.resolve()
    .then(produce)
    .then((data) => {
      // Dated from completion, not from when the request arrived. These queries
      // take a second or two, and dating the entry from before them shortened
      // every TTL by however long the database happened to take.
      if (data != null) leaderboardCache.set(key, data, ttl ? { ttl } : undefined);
      return data;
    })
    .finally(() => {
      // Failures are not cached, so the next request retries rather than
      // serving a minute of stale errors.
      inFlight.delete(key);
    });

  inFlight.set(key, flight);
  return flight;
}

// leaderboardCache and inFlight are exported for the tests, which assert the
// bound holds and that a rejected production does not leak an entry.
module.exports = { cached, leaderboardCache, inFlight };
