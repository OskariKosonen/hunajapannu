/**
 * Pure helpers behind the insight endpoints, kept out of the routes so they
 * can be tested without a database.
 */

/**
 * How few networks carry how much of the traffic.
 *
 * @param {number[]} totals  Event counts per network, any order.
 * @param {number[]} shares  Fractions to answer for, e.g. [0.5, 0.8].
 * @returns {{ events: number, networks: number,
 *             thresholds: Array<{ share: number, networks: number }> }}
 *   For each share, the smallest number of networks (busiest first) whose
 *   events reach it.
 */
function concentration(totals, shares) {
  const sorted = totals.map(Number).filter((n) => n > 0).sort((a, b) => b - a);
  const events = sorted.reduce((sum, n) => sum + n, 0);
  const thresholds = shares.map((share) => {
    if (events === 0) return { share, networks: 0 };
    let running = 0;
    for (let i = 0; i < sorted.length; i++) {
      running += sorted[i];
      if (running >= share * events) return { share, networks: i + 1 };
    }
    return { share, networks: sorted.length };
  });
  return { events, networks: sorted.length, thresholds };
}

/** ?days= for the windowed insights: 1–365, 30 when absent or nonsense. */
function parseDays(raw, fallback = 30) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 365) : fallback;
}

module.exports = { concentration, parseDays };
