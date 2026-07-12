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

  await t.check('nasa debug action teleports near Ellington and launches the pair through the real loop', async () => {
    await t.ev('(g.military.despawnAll(), g.aviation.despawnAll(), g.debug.actions.nasa())');
    await t.until(`g.military.candidates.find((x) => x.kind === 'nasa').flying`, 5000);
    const d = await t.ev(`(() => {
      const c = g.military.candidates.find((x) => x.kind === 'nasa');
      return Math.hypot(g.player.pos.x - c.baseX, g.player.pos.z - c.baseZ);
    })()`);
    t.ok(d < 60, `player wasn't teleported near Ellington (dist ${d})`);
    await t.ev('g.military.despawnAll()');
  });

  await t.check('lowlevel debug action rolls the flyby around the new teleport spot, not a stale pre-teleport one', async () => {
    // start the player far east so a stale g.military.px/pz (only refreshed
    // inside update()) would roll the pass around the wrong place entirely —
    // a same-position check wouldn't have caught that class of bug
    await t.ev('(g.military.despawnAll(), g.aviation.despawnAll(), g.player.pos.set(2000, 0, 2000))');
    await t.wait(0.2); // let a real frame latch military.px/pz to the far-east spot
    const r = await t.ev(`(() => {
      g.debug.actions.lowlevel();
      const c = g.military.candidates.find((x) => x.kind === 'lowlevel');
      const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
      return { flying: c.flying, px: g.player.pos.x, dist: Math.hypot(mx - g.player.pos.x, mz - g.player.pos.z) };
    })()`);
    t.ok(r.flying, 'lowlevel debug action did not launch the pair');
    t.ok(r.px < -2200, `player wasn't teleported into the Trans-Pecos (x=${r.px})`);
    t.ok(r.dist < 40, `flyby rolled ${r.dist} units from the teleport spot — looks stale`);
    await t.ev('g.military.despawnAll()');
  });

  await t.check('heli debug action cycles kinds instead of picking randomly', async () => {
    const kinds = await t.ev(`(() => {
      g.heli.despawnAll();
      const seen = [];
      for (let i = 0; i < 4; i++) {
        g.heli.despawnAll(); // one at a time so the cap never blocks a forced kind
        g.debug.actions.heli();
        const c = g.heli.candidates.find((x) => x.flying);
        seen.push(c.kind);
      }
      return seen;
    })()`);
    t.ok(kinds.length === 4 && new Set(kinds).size === 4, `expected 4 distinct kinds in order, got ${kinds.join(',')}`);
    t.ok(kinds[0] === 'medical' && kinds[1] === 'news' && kinds[2] === 'coastguard' && kinds[3] === 'army',
      `expected medical,news,coastguard,army in that order, got ${kinds.join(',')}`);
    await t.ev('g.heli.despawnAll()');
  });

  await t.check('charter debug action forces a real charter job through missions.js', async () => {
    await t.ev('g.debug.actions.charter()');
    t.ok((await t.ev('g.missions.job?.kind')) === 'charter', 'charter debug action did not start a charter job');
    t.ok((await t.ev("g.missions.job?.fromId === 'MRF' && g.missions.job?.toId === 'DFW'")), 'wrong airport pair');
    await t.ev('g.missions.abandon()');
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
