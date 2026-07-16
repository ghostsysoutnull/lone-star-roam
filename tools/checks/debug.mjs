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

  await t.check('every tour spot is valid: in-world coords, unique labels, known modes/acts', async () => {
    const r = await t.ev(`(() => {
      const seen = new Set(), errs = [];
      const modes = ['DRIVE', 'FLY', 'WALK'];
      const weathers = ['clear', 'clouds', 'rain', 'storm', 'dust'];
      for (const tr of g.debug.tours) for (const w of tr.waves) for (const s of w.spots) {
        const k = tr.track + ' / ' + w.wave + ' / ' + s.label;
        if (seen.has(k)) errs.push('duplicate: ' + k);
        seen.add(k);
        if (!Number.isFinite(s.x) || !Number.isFinite(s.z) || Math.abs(s.x) > 7000 || Math.abs(s.z) > 6600) errs.push('coords: ' + k);
        if (s.mode && !modes.includes(s.mode)) errs.push('mode: ' + k);
        if (s.act && typeof g.debug.actions[s.act] !== 'function') errs.push('act: ' + k);
        if (s.time != null && !(s.time >= 0 && s.time <= 1)) errs.push('time: ' + k);
        if (s.weather && !weathers.includes(s.weather)) errs.push('weather: ' + k);
        if (s.heading != null && !Number.isFinite(s.heading)) errs.push('heading: ' + k);
      }
      return { n: seen.size, errs };
    })()`);
    t.ok(r.errs.length === 0, `bad tour spots: ${r.errs.join(', ')}`);
    t.ok(r.n >= 25, `tour list unexpectedly small (${r.n} spots) — backfill missing?`);
  });

  await t.check('visit() teleports and stages mode, heading and time', async () => {
    const r = await t.ev(`(() => {
      g.debug.visit({ label: 'test', x: 1558, z: 3870.1, heading: Math.PI / 2, mode: 'WALK', time: 0.98 });
      return { x: g.player.pos.x, z: g.player.pos.z, h: g.player.heading, mode: g.player.mode, t: g.sky.t };
    })()`);
    t.ok(Math.abs(r.x - 1558) < 0.01 && Math.abs(r.z - 3870.1) < 0.01, `teleport landed at ${r.x},${r.z}`);
    t.ok(Math.abs(r.h - Math.PI / 2) < 0.01, `heading ${r.h}`);
    t.ok(r.mode === 'WALK', `mode ${r.mode}`);
    t.ok(Math.abs(r.t - 0.98) < 0.001, `sky.t ${r.t}`);
    await t.ev(`(g.player.setMode('DRIVE'), g.debug.actions.day())`);
  });

  await t.check('visit() with an act chains it after the teleport', async () => {
    const r = await t.ev(`(() => {
      const spot = g.debug.tours.flatMap((tr) => tr.waves).flatMap((w) => w.spots).find((s) => s.act === 'saucer');
      g.debug.visit(spot);
      return { state: g.ufo.state, visible: g.ufo.saucer.visible };
    })()`);
    t.ok(r.state !== 'idle' && r.visible, `saucer tour spot did not start the encounter (state ${r.state})`);
    await t.ev(`(g.ufo.despawnAll?.() , g.debug.actions.day())`);
  });

  await t.check('turtleMorning jumps to a real release dawn through the real loop', async () => {
    await t.tp(2102, 3971); // Malaquite — inside the nest's 600-unit gate
    const before = await t.ev('g.sky.days');
    await t.ev('g.debug.actions.turtleMorning()');
    const r = await t.ev('({ days: g.sky.days, t: g.sky.t })');
    t.ok(r.days > before && Number.isInteger(r.days), `days ${before} → ${r.days} — not a forward integer jump`);
    t.ok(r.t > 0.235 && r.t < 0.32, `sky.t ${r.t} outside the release window`);
    await t.until('g.turtles.releaseToday && g.turtles.mesh.visible', 10000);
    await t.ev('g.debug.actions.day()');
  });

  await t.check('treasureNight forces the 1554 light regardless of moon phase', async () => {
    await t.tp(2130, 4942.6); // the Padre shore spot, ~98 units from the light
    await t.ev('g.debug.actions.treasureNight()');
    await t.until('g.haunts.treasure.visible && g.haunts.tMat.opacity > 0.1', 15000);
    await t.ev('(g.haunts.force = false, g.debug.actions.day())');
  });

  await t.check('bear conjures a blackbear near the player through the real machinery', async () => {
    await t.tp(5343, -334); // the Sabine pines tour spot
    await t.ev('g.debug.actions.bear()');
    // nearest, not first — the pines legitimately roll natural bears in
    // neighboring chunks, and the forced one must be the close one
    const r = await t.ev(`(() => {
      let best = null;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) {
          if (a.species !== 'blackbear') continue;
          const d = Math.hypot(a.g.position.x - g.player.pos.x, a.g.position.z - g.player.pos.z);
          if (!best || d < best.d) best = { d };
        }
      return best;
    })()`);
    t.ok(r, 'no blackbear in any live chunk after bear()');
    t.ok(r.d > 20 && r.d < 45, `nearest bear ${r?.d} units out — expected the forced one at ~30`);
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
