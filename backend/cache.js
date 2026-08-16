const { LEADERBOARD_CACHE_TTL_MS } = require('./config');

const leaderboardCache = new Map();

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
