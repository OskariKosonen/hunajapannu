const test = require('node:test');
const assert = require('node:assert');
const { assessDisk } = require('../lib/disk');

// A 20 GB volume in 4 KiB blocks, which is the shape of the real one.
const BS = 4096;
const GB = (n) => Math.round((n * 1024 * 1024 * 1024) / BS);

/** blocks/bfree/bavail in the units statfs reports. */
const fs = ({ totalGb, freeGb, reservedGb = 0 }) => ({
  bsize: BS,
  blocks: GB(totalGb),
  bfree: GB(freeGb + reservedGb),
  bavail: GB(freeGb),
});

test('reports free and total space in megabytes', () => {
  const d = assessDisk(fs({ totalGb: 20, freeGb: 2 }), { lowFreeMb: 1024 });
  assert.strictEqual(d.diskTotalMb, 20480);
  assert.strictEqual(d.diskFreeMb, 2048);
  assert.strictEqual(d.diskChecked, true);
});

test('counts only space an ordinary process can actually write', () => {
  // ext4 reserves 5% for root by default. bfree includes it, bavail does not,
  // and postgres runs as postgres — so bfree would promise a gigabyte that
  // does not exist for the process that needs it.
  const d = assessDisk(fs({ totalGb: 20, freeGb: 0.5, reservedGb: 1 }), { lowFreeMb: 1024 });
  assert.strictEqual(d.diskFreeMb, 512);
  assert.strictEqual(d.diskLow, true, 'reserved blocks must not mask a full disk');
});

test('the used percentage matches what df prints, rounding included', () => {
  // df: used / (used + available), not used / total, and rounded up.
  const d = assessDisk(fs({ totalGb: 20, freeGb: 2, reservedGb: 1 }), { lowFreeMb: 1024 });
  // used = 20 - 3 = 17, avail = 2  ->  17 / 19 = 89.47  ->  90
  assert.strictEqual(d.diskUsedPercent, 90);
});

test('trips exactly at the configured floor, not around it', () => {
  assert.strictEqual(assessDisk(fs({ totalGb: 20, freeGb: 1 }), { lowFreeMb: 1024 }).diskLow, false);
  const justUnder = { bsize: BS, blocks: GB(20), bfree: GB(1), bavail: GB(1) - 1 };
  assert.strictEqual(assessDisk(justUnder, { lowFreeMb: 1024 }).diskLow, true);
});

test('the state at the 2026-09-22 crash reads as low', () => {
  // 8.4 MB free on the 20 GB volume. If this does not trip, nothing would.
  const d = assessDisk({ bsize: BS, blocks: GB(20), bfree: 2150, bavail: 2150 }, { lowFreeMb: 1024 });
  assert.strictEqual(d.diskLow, true);
  assert.strictEqual(d.diskFreeMb, 8);
});

test('a failed statfs reports unknown rather than a reassuring zero', () => {
  // Zero free would be indistinguishable from a real full disk, and false
  // would claim everything is fine. Neither is honest about not knowing.
  for (const bad of [null, undefined, {}, { bsize: 0, blocks: 0 }]) {
    const d = assessDisk(bad, { lowFreeMb: 1024 });
    assert.strictEqual(d.diskChecked, false);
    assert.strictEqual(d.diskFreeMb, null);
    assert.strictEqual(d.diskLow, false, 'unknown must not page anyone at 3am');
  }
});

test('rounds free space down, never up', () => {
  // Reporting more room than exists is the one direction that matters.
  const d = assessDisk({ bsize: BS, blocks: GB(20), bfree: 262399, bavail: 262399 }, { lowFreeMb: 1 });
  assert.ok(d.diskFreeMb <= (262399 * BS) / (1024 * 1024));
});
