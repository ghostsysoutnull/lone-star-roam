// Runner self-test fixture — always passes. Confirms the harness reports a
// clean suite correctly (no solo rerun, no FLAKE/FAIL labels).
export default async function green(t) {
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
}
