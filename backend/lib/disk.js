/**
 * Free space on the volume the database lives on.
 *
 * On 2026-09-22 a migration rewrote 1.6M rows, the volume filled, PostgreSQL
 * crashed and the API served 503 until the cluster was started by hand. The
 * first signal anyone had was the crash: /health reported ingest freshness and
 * clock skew, and the watchdog polled it, but nothing looked at disk at all.
 *
 * Reported as a number rather than only a boolean so the trend is visible in
 * watchdog output. The database grows about 10 MB a day on a 20 GB volume, so
 * "how fast is it filling" is the question, and a flag alone cannot answer it.
 *
 * Kept as a pure function over a statfs result for the usual reason: the
 * arithmetic is where the mistakes are, and it needs no filesystem to test.
 */

const BYTES_PER_MB = 1024 * 1024;

/**
 * @param {import('fs').StatsFs|null} stats - result of fs.statfs, or null if
 *   the call failed. A failed check must never fail the health endpoint.
 * @param {{lowFreeMb: number}} opts
 */
function assessDisk(stats, { lowFreeMb }) {
  if (!stats || !stats.bsize || !stats.blocks) {
    // Unknown is not the same as fine, but it is also not an outage. Say so
    // and let the operator notice, rather than reporting a reassuring zero.
    return { diskFreeMb: null, diskTotalMb: null, diskUsedPercent: null, diskLow: false, diskChecked: false };
  }

  // bavail, not bfree: bfree counts the root-reserved blocks that an ordinary
  // process — postgres included — cannot actually write into. Using bfree
  // would report space that does not exist for the user who needs it.
  const freeMb = Math.floor((stats.bavail * stats.bsize) / BYTES_PER_MB);
  const totalMb = Math.floor((stats.blocks * stats.bsize) / BYTES_PER_MB);
  const usedBlocks = stats.blocks - stats.bfree;
  const denom = usedBlocks + stats.bavail;

  return {
    diskFreeMb: freeMb,
    diskTotalMb: totalMb,
    // df's definition and df's rounding: used / (used + available), rounded
    // up. Matching the shell exactly matters because this number ends up in an
    // alert that someone will check against df, and a disagreement of one
    // point is the kind of thing that makes people distrust the monitor.
    diskUsedPercent: denom > 0 ? Math.ceil((100 * usedBlocks) / denom) : null,
    diskLow: freeMb < lowFreeMb,
    diskChecked: true,
  };
}

module.exports = { assessDisk };
