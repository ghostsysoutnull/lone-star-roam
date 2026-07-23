// Runner self-test fixture — deterministic solo-green flake, no timing
// dependence. Reads a marker path from SELFTEST_FLAKYONCE_MARKER: absent on
// the pool attempt (creates it, fails a check), present on the solo rerun
// (passes). Confirms the flake-confirm path: totals.flakes, the suite
// 'flake' flag, and that the pool attempt's failure record survives after
// the solo attempt goes green.
import { existsSync, writeFileSync } from 'node:fs';

export default async function flakyonce(t) {
  const marker = process.env.SELFTEST_FLAKYONCE_MARKER;
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
  await t.check('flaky probe', async () => {
    if (!existsSync(marker)) {
      writeFileSync(marker, '1');
      t.ok(false, 'flakyonce: marker absent — deterministic first-attempt fail');
    }
  });
}
