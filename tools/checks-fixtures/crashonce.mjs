// Runner self-test fixture — marker-file pattern: the first attempt closes
// its own browser mid-body, then touches the page again (browser.close()
// itself resolves cleanly, so a browser-touching op AFTER the close is what
// actually throws and reaches the runner's isConnected() discriminator).
// Confirms the infra-casualty path: first attempt outcome:'infra' with zero
// failure signatures, pool-level requeue, and a passing retry.
import { existsSync, writeFileSync } from 'node:fs';

export default async function crashonce(t) {
  const marker = process.env.SELFTEST_CRASHONCE_MARKER;
  if (!existsSync(marker)) {
    writeFileSync(marker, '1');
    await t.page.context().browser().close();
    await t.ev('1'); // browser now dead — this throw reaches the infra discriminator
    return;
  }
  await t.check('game booted', async () => {
    const ok = await t.ev('!!g.player');
    t.ok(ok, 'window.__game.player missing');
  });
}
