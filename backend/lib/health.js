/**
 * Turns "when did we last see an event" into the freshness/skew verdict that
 * /health reports and the watchdog alerts on.
 *
 * Extracted from index.js because this is arithmetic with a sign convention,
 * and the sign is the whole point: a *negative* age means events are stamped
 * in the future, i.e. the sensor's clock or timezone disagrees with ours.
 * Read naively that looks like "very fresh data", which would mask a stopped
 * feed for as long as the skew lasts — exactly what happened on 2026-08-11.
 *
 * @param {Date|null} lastEvent - MAX(timestamp) from cowrie_events
 * @param {number} nowMs        - current time in ms (injectable for tests)
 */
function assessIngest(lastEvent, nowMs, { staleAfterSeconds, skewToleranceSeconds }) {
  const ageSeconds = lastEvent ? Math.round((nowMs - lastEvent.getTime()) / 1000) : null;

  const clockSkewSeconds = ageSeconds != null && ageSeconds < 0 ? -ageSeconds : 0;
  const clockSkewed = clockSkewSeconds > skewToleranceSeconds;

  // No events at all counts as stale: an empty feed is never healthy.
  const ingestStale = ageSeconds == null || ageSeconds > staleAfterSeconds;

  return {
    lastEventAt: lastEvent ? lastEvent.toISOString() : null,
    lastEventAgeSeconds: ageSeconds,
    ingestStale,
    clockSkewed,
    clockSkewSeconds,
    status: ingestStale || clockSkewed ? 'degraded' : 'ok',
  };
}

module.exports = { assessIngest };
