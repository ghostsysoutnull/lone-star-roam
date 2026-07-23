// Runner self-test fixture — green suite that also calls t.shot() once.
// Confirms shot instrumentation: the attempt's shots/renderTicks counters
// increment from the call site (never inferred from env vars).
export default async function shotfix(t) {
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
  await t.shot('selftest-shot');
}
