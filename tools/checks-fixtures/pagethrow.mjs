// Runner self-test fixture — throws inside the page (not inside a t.check),
// so it must come out failed via the synthetic "FAIL pageerror" line, not
// via a normal check FAIL.
//
// queueMicrotask, NOT setTimeout: verify.mjs installs page.clock (fake timers)
// before any suite runs, and sinon's fake-timer tick loop catches an
// exception thrown inside a fake setTimeout callback and only logs it to the
// page console — it never reaches the browser's real uncaught-exception path,
// so no 'pageerror' event fires. A microtask throw is untouched by the fake
// clock and does surface as a real pageerror (verified against a live probe).
export default async function pagethrow(t) {
  await t.page.evaluate(() => queueMicrotask(() => { throw new Error('selftest-pageerror'); }));
  await t.wait(0.2);
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
  // real wall-clock pause (not t.wait, which drives the FAKE clock and costs
  // ~0 real time) so this suite's telemetry body duration reads nonzero
  await t.page.waitForTimeout(120);
}
