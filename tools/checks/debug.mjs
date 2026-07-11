// Debug menu. The panel itself only exists with ?debug=1 (the harness loads
// the plain URL, so it must be absent here); the actions are always built and
// exposed on __game.debug, and each one must put the world into the state it
// promises — through the real render loop. This suite runs first
// (alphabetical), so its last check restores an honest daylight world.

export default async function debug(t) {
  await t.check('panel is absent without ?debug=1', async () => {
    t.ok(await t.ev(`document.getElementById('debug') === null`), 'debug panel leaked into the public build');
    t.ok(await t.ev(`typeof g.debug.actions.hauntCemetery === 'function'`), 'debug actions missing from __game');
  });

  await t.check('haunt-cemetery forces wisps through the real loop', async () => {
    await t.tp(100, 550); // Hill Country ranchland — chapel odds are 0 in the far-west desert
    await t.ev('g.debug.actions.hauntCemetery()');
    await t.until('g.haunts.force && g.haunts.haunted && g.haunts.wisps.visible', 15000);
    await t.until('g.haunts.wispMat.opacity > 0.15', 5000);
  });

  await t.check('midnight rings the chapel bell we were parked at', async () => {
    await t.ev('g.debug.actions.midnight()');
    await t.until('g.haunts.lastBell > 0', 15000);
  });

  await t.check('saucer starts a real encounter', async () => {
    await t.ev('g.debug.actions.saucer()');
    t.ok(await t.ev(`g.ufo.state !== 'idle'`), 'ufo still idle');
    t.ok(await t.ev('g.ufo.saucer.visible'), 'saucer not visible');
  });

  await t.check('weather actions pin the sky', async () => {
    await t.ev('g.debug.actions.storm()');
    await t.until(`g.ATMOS.weather === 'storm'`, 10000);
  });

  await t.check('day + clear restore an honest world for the other suites', async () => {
    await t.ev('(g.debug.actions.clear(), g.debug.actions.day())');
    await t.until(`g.ATMOS.night < 0.1 && g.ATMOS.weather === 'clear'`, 10000);
    t.ok(!(await t.ev('g.haunts.force')), 'haunt force flag still set');
    await t.until('!g.haunts.wisps.visible && !g.ufo.saucer.visible', 10000); // dawn banishes everything
  });
}
