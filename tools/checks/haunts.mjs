// Haunted Texas. chapelAt placement must be deterministic and lawful (clear of
// the 4-unit road cap bubble, outside town footprints); the cemetery wisps must
// arm through the REAL render loop (wiring sentinel) and fade as you approach —
// asserted as an opacity trend over position, not a snapshot; Enchanted Rock's
// ghost fires log the second legend; the chapel bell tolls when sky.t wraps
// midnight. Legends are the visible 9th collectible (HUD row + save key).

export default async function haunts(t) {
  // --- chapel sites: pure function sweep over Hill Country ranchland ---
  const sweep = `g.chapelSitesNear(100, 550, 12)`;
  const sites = await t.ev(sweep);

  await t.check('chapel sites exist and are deterministic', async () => {
    t.ok(sites.length > 3, `only ${sites.length} sites in a 25×25-chunk ranchland sweep`);
    const again = await t.ev(sweep);
    t.ok(JSON.stringify(sites) === JSON.stringify(again), 'two sweeps disagree — chapelAt is not pure');
  });

  await t.check('sites keep clear of roads and towns, inside Texas', async () => {
    const bad = await t.ev(`(() => {
      const rad = (pop) => Math.min(90, 6 + Math.pow(pop, 0.38) / 9); // cityRadius
      const out = [];
      for (const s of ${JSON.stringify(sites)}) {
        if (!g.inTexas(s.x, s.z)) out.push('outside:' + s.key);
        if (g.nearestRoad(s.x, s.z, 4)) out.push('road-bubble:' + s.key);      // caps change within 4 of a road
        if (g.nearestRoad(s.cemX, s.cemZ, 4)) out.push('cem-road:' + s.key);
        if (!g.nearestRoad(s.x, s.z, 25)) out.push('unfindable:' + s.key);     // must sit near a farm road
        for (const c of g.GEO.cities)
          if (Math.hypot(c.x - s.x, c.z - s.z) < rad(c.pop) + 15) out.push('in-town:' + s.key);
      }
      return out;
    })()`);
    t.ok(bad.length === 0, `unlawful sites: ${bad.slice(0, 4).join(', ')}`);
  });

  // adopt the site nearest the sweep center for the live checks
  const site = sites.reduce((a, b) =>
    Math.hypot(a.cemX - 100, a.cemZ - 550) < Math.hypot(b.cemX - 100, b.cemZ - 550) ? a : b);

  await t.check('scenery chunk spawns the chapel + cemetery meshes', async () => {
    await t.tp(site.x + 20, site.z);
    await t.wait(0.6); // chunks spawn on the next scenery update
    const kinds = await t.ev(`(() => {
      const found = [];
      for (const gr of g.scenery.live.values())
        for (const c of gr.children) if (c.userData.kind === 'chapel' || c.userData.kind === 'cemetery') found.push(c.userData.kind);
      return found;
    })()`);
    t.ok(kinds.includes('chapel'), 'no chapel mesh in live chunks');
    t.ok(kinds.includes('cemetery'), 'no cemetery mesh in live chunks');
  });

  // wisp nights are seeded per site+day — find one haunted and one quiet day
  const days = await t.ev(`(() => {
    let on = null, off = null;
    for (let d = 1; d < 200 && (on === null || off === null); d++) {
      const roll = g.seededRand('wisp:${site.key}:' + d)() < 0.5;
      if (roll && on === null) on = d;
      if (!roll && off === null) off = d;
    }
    return { on, off };
  })()`);

  await t.check('wisps arm at deep night through the real loop (wiring sentinel)', async () => {
    t.ok(days.on !== null && days.off !== null, 'no haunted/quiet day pair in 200 days');
    await t.ev(`g.sky.days = ${days.on}`);
    await t.setNight();
    await t.tp(site.cemX + 40, site.cemZ);
    await t.until('g.haunts.wisps.visible', 15000); // site rescan runs every ~2 s
    await t.until('g.haunts.wispMat.opacity > 0.15', 5000);
  });

  await t.check('wisps fade when approached, recover when you back off', async () => {
    const far = await t.ev('g.haunts.wispMat.opacity');
    await t.tp(site.cemX + 5, site.cemZ);
    await t.until('g.haunts.wispMat.opacity < 0.05', 5000);
    await t.tp(site.cemX + 40, site.cemZ);
    await t.until(`g.haunts.wispMat.opacity > ${Math.max(0.15, far * 0.8)}`, 5000);
  });

  await t.check('a quiet night stays quiet (per-night seeded roll)', async () => {
    await t.ev(`g.sky.days = ${days.off}`);
    await t.until('!g.haunts.wisps.visible && !g.haunts.haunted', 8000);
  });

  await t.check('watching the lights logs the first legend', async () => {
    await t.ev(`g.sky.days = ${days.on}`);
    await t.tp(site.cemX + 20, site.cemZ); // a natural parked-truck distance
    await t.until(`g.gameplay.save.legends.includes('wisps')`, 15000);
  });

  await t.check('the chapel bell tolls as the clock wraps midnight', async () => {
    await t.tp(site.x + 15, site.z);
    await t.ev('g.sky.t = 0.996'); // ~3 s of game time short of midnight
    await t.until('g.haunts.lastBell > 0', 15000);
  });

  await t.check('Enchanted Rock ghost fires log the second legend', async () => {
    const [rx, rz] = await t.ev(`(() => {
      const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
      return LL(30.5064, -98.8198);
    })()`);
    await t.tp(rx + 30, rz);
    await t.until('g.haunts.fires.visible && g.haunts.fireMat.opacity > 0.15', 8000);
    await t.until(`g.gameplay.save.legends.includes('ghostfires')`, 8000);
    await t.setDay(); // dawn banishes the fires
    await t.until('!g.haunts.fires.visible', 8000);
  });

  await t.check('legends count as the visible 9th collectible (HUD + save)', async () => {
    t.ok((await t.ev('g.gameplay.counts().legends')) === 2, 'counts().legends !== 2');
    const saved = await t.ev(`JSON.parse(localStorage.getItem('lonestar-roam-save-v1:1')).legends`);
    t.ok(Array.isArray(saved) && saved.length === 2, `save.legends = ${JSON.stringify(saved)}`);
    await t.until(`document.getElementById('score-legends').textContent === '2'`, 5000); // 12 Hz HUD
  });
}
