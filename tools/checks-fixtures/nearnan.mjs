// Runner self-test fixture — deterministically fails the t.near() non-finite
// guard (NaN input). Confirms the guard's diagnostic and the structured
// 'assertion'-type failure record survive both the pool and solo attempts
// (this always fails, so it's a "FAIL (confirmed on rerun)" case).
export default async function nearnan(t) {
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
  await t.check('nan probe', async () => {
    t.near(NaN, 0, 1, 'nan probe');
  });
  // real wall-clock pause (not t.wait, which drives the FAKE clock and costs
  // ~0 real time) so this suite's telemetry body duration reads nonzero
  await t.page.waitForTimeout(120);
}
