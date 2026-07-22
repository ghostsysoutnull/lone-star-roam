// Runner self-test fixture — deterministically fails an assertion. Confirms
// the harness solo-reruns a pool failure and, since this always fails, keeps
// it a "FAIL (confirmed on rerun)" rather than mislabeling it a flake.
export default async function assertfail(t) {
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
  await t.check('intentional failure', async () => {
    t.ok(false, 'intentional selftest failure');
  });
  // real wall-clock pause (not t.wait, which drives the FAKE clock and costs
  // ~0 real time) so this suite's telemetry body duration reads nonzero
  await t.page.waitForTimeout(120);
}
