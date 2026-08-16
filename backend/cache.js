const { LRUCache } = require('lru-cache');
const { LEADERBOARD_CACHE_TTL_MS } = require('./config');

/**
 * Short-lived cache for the leaderboard-shaped endpoints.
 *
 * This was a plain Map with no eviction and no size limit. Its keys embed
 * user-controlled input — `sessions:${limit}:${offset}:${hours}:${search}`
 * and the same shape for creds, files and top-asn — so anything issuing
 * searches with varying terms grew it for the lifetime of the process. A
 * crawler, a scanner, or one person holding a key down in the search box is
 * enough; nothing ever removed an entry.
 *
 * Bounded now, and the TTL is enforced by the cache itself rather than only
 * being checked on read, so expired entries are evicted rather than retained
 * until someone happens to ask for that exact key again.
 *
 * 500 entries is comfortably more than the distinct queries the dashboard
 * itself issues, so normal use never evicts.
 */
const leaderboardCache = new LRUCache({
  max: 500,
  ttl: LEADERBOARD_CACHE_TTL_MS,
});

function getCachedLeaderboard(key) {
  const cached = leaderboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

function setCachedLeaderboard(key, data) {
  leaderboardCache.set(key, { data, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS });
}

module.exports = { getCachedLeaderboard, setCachedLeaderboard, leaderboardCache };
