// Wildlife behavior at natural values. The load-bearing check is flee =
// distance INCREASES over time — the inverted-heading bug shipped once and
// looked right in screenshots. Species specs come from g.SPECIES
// (fleeR = skittish, nightMin/nightMax = nocturnal/diurnal hours).

export default async function wildlife(t) {
  // rural Hill Country west of Austin: deer herds, daytime species
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);
  await t.setDay();
  await t.tp(austin.x - 300, austin.z - 40);
  await t.wait(0.5); // chunks spawn on the next update

  await t.check('animals spawn and honor their hours (day)', async () => {
    const { total, wrong } = await t.ev(`(() => {
      const night = g.ATMOS.night;
      let total = 0, wrong = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) {
          total++;
          const s = g.SPECIES[a.species];
          const want = s.nightMin != null ? night >= s.nightMin : s.nightMax != null ? night <= s.nightMax : true;
          if (a.g.visible !== want) wrong++;
        }
      return { total, wrong };
    })()`);
    t.ok(total > 0, 'no animals spawned');
    t.ok(wrong === 0, `${wrong}/${total} animals ignore their hours`);
  });

  // find a skittish herd (≥2 fleeR members sharing a home) and stash it
  const herd = await t.ev(`(() => {
    const groups = new Map();
    for (const { animals } of g.animals.live.values())
      for (const a of animals) {
        if (!g.SPECIES[a.species].fleeR || !a.g.visible) continue;
        const k = a.homeX + ',' + a.homeZ;
        (groups.get(k) ?? groups.set(k, []).get(k)).push(a);
      }
    for (const [, m] of groups)
      if (m.length >= 2) { window.__herd = m; return { x: m[0].homeX, z: m[0].homeZ, n: m.length, species: m[0].species }; }
    return null;
  })()`);

  await t.check('a skittish herd exists nearby', async () => {
    t.ok(herd, 'no multi-member skittish herd in live chunks');
  });
  if (!herd) return;

  await t.check(`scare startles the herd (${herd.species} ×${herd.n})`, async () => {
    await t.tp(herd.x + 3, herd.z, 'WALK');
    await t.ev(`g.animals.scare(${herd.x}, ${herd.z}, 30)`);
    const fleeing = await t.ev(`window.__herd.filter((a) => a.state === 'flee').length`);
    t.ok(fleeing >= 2, `only ${fleeing}/${herd.n} fleeing`);
  });

  await t.check('fleeing animals RUN AWAY (distance grows, never shrinks)', async () => {
    const d = await t.sample(
      `Math.hypot(window.__herd[0].g.position.x - ${herd.x}, window.__herd[0].g.position.z - ${herd.z})`,
      8, 300);
    t.ok(d[7] > d[0] + 1.5, `didn't gain ground: ${d[0].toFixed(1)} → ${d[7].toFixed(1)}`);
    t.ok(Math.min(...d) >= d[0] - 0.8, `closed in mid-flight: min ${Math.min(...d).toFixed(1)} vs start ${d[0].toFixed(1)}`);
  });

  await t.check('close encounter logs the species', async () => {
    const pos = await t.ev('({ x: window.__herd[0].g.position.x, z: window.__herd[0].g.position.z })');
    await t.tp(pos.x + 4, pos.z, 'WALK');
    await t.until(`g.gameplay.save.species.includes('${herd.species}')`, 10000);
  });

  await t.check('HUD nearby readout: populated close up, cleared far away', async () => {
    const pos = await t.ev('({ x: window.__herd[0].g.position.x, z: window.__herd[0].g.position.z })');
    await t.tp(pos.x + 4, pos.z, 'WALK');
    await t.wait(0.2);
    const near = await t.ev('g.animals.nearby && g.animals.nearby.species');
    t.ok(near === herd.species, `nearby readout wrong up close: ${near} (want ${herd.species})`);
    await t.tp(pos.x + 400, pos.z, 'WALK');
    await t.wait(0.2);
    const far = await t.ev('g.animals.nearby');
    t.ok(far === null, `nearby readout didn't clear far away: ${JSON.stringify(far)}`);
    await t.tp(pos.x + 4, pos.z, 'WALK'); // back in range for downstream checks
  });

  await t.check('animals honor their hours (night)', async () => {
    await t.setNight();
    await t.wait(0.4);
    const { total, wrong } = await t.ev(`(() => {
      const night = g.ATMOS.night;
      let total = 0, wrong = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) {
          total++;
          const s = g.SPECIES[a.species];
          const want = s.nightMin != null ? night >= s.nightMin : s.nightMax != null ? night <= s.nightMax : true;
          if (a.g.visible !== want) wrong++;
        }
      return { total, wrong };
    })()`);
    t.ok(wrong === 0, `${wrong}/${total} animals ignore their hours at night`);
    await t.setDay(); // leave the world in daylight
  });

  // rattlesnake (Trans-Pecos) and gator (Piney Woods) were 0.15 keep-odds
  // outliers vs. 0.3-0.55 everywhere else — pin the retuned values directly
  // via g.animals.regionTable rather than resampling chunks statistically
  await t.check('rattlesnake and gator keep-odds match the retuned values', async () => {
    const snakeOdds = await t.ev(`g.animals.regionTable(-2700, 600).find((e) => e[0] === 'rattlesnake')[4]`);
    const gatorOdds = await t.ev(`g.animals.regionTable(4000, 0).find((e) => e[0] === 'gator')[4]`);
    t.near(snakeOdds, 0.35, 0.001, 'rattlesnake keep-odds');
    t.near(gatorOdds, 0.3, 0.001, 'Piney Woods gator keep-odds');
  });

  await t.check('rattle warning carries to 16 units, not just 9', async () => {
    await t.tp(-2700, 600, 'WALK');
    await t.wait(0.5); // chunks spawn on the next update
    const snake = await t.ev(`(() => {
      for (const { animals } of g.animals.live.values())
        for (const a of animals)
          if (a.species === 'rattlesnake') return { x: a.g.position.x, z: a.g.position.z };
      return null;
    })()`);
    t.ok(snake, 'no rattlesnake spawned near the Trans-Pecos test spot');
    if (!snake) return;

    await t.ev(`(window.__rattleSpy = [], window.__origOnSound = g.animals.onSound,
      g.animals.onSound = (k) => { window.__rattleSpy.push(k); window.__origOnSound?.(k); })`);

    await t.tp(snake.x + 30, snake.z, 'WALK');
    await t.wait(0.4);
    t.ok(!(await t.ev(`window.__rattleSpy.includes('rattle')`)), 'rattle audible from 30 units away');

    await t.ev(`window.__rattleSpy = []`);
    await t.tp(snake.x + 13, snake.z, 'WALK'); // between the old 9-unit cutoff and the new 16-unit one
    await t.wait(0.4);
    t.ok(await t.ev(`window.__rattleSpy.includes('rattle')`), 'rattle silent at 13 units — still gated at the old 9-unit radius?');

    await t.ev(`g.animals.onSound = window.__origOnSound`);
  });

  // --- Band Parity W5: wildlife extended to the band (LA/AR/OK/NM) ---

  await t.check('band region tables: one species flavor per neighbor state', async () => {
    const nm = await t.ev(`g.animals.regionTable(-3486, -1923.7).map((r) => r[0])`); // Hobbs, NM — desert
    const ok = await t.ev(`g.animals.regionTable(2281.3, -3591.2).map((r) => r[0])`); // Ardmore, OK — plains
    const ar = await t.ev(`g.animals.regionTable(5262.8, -2719.2).map((r) => r[0])`); // Texarkana, AR — pine
    const la = await t.ev(`g.animals.regionTable(5747.5, -629.7).map((r) => r[0])`); // Many, LA — swamp
    t.ok(nm.includes('roadrunner') && nm.includes('javelina'), `NM desert band missing expected species: ${nm}`);
    t.ok(ok.includes('coyote') && ok.includes('jackrabbit'), `OK plains band missing expected species: ${ok}`);
    t.ok(ar.includes('turkey') && ar.includes('blackbear'), `AR pine band missing expected species: ${ar}`);
    t.ok(la.includes('gator'), `LA swamp band missing expected species: ${la}`);
  });

  // same frozen Tillman County, OK farmstead ag.mjs freezes (BAND_FARM)
  const BAND_FARM = { x: 772.7489797285957, z: -3732.7234383456844 };

  await t.check('band farmstead: census herd spawns near Tillman County, OK (no crash)', async () => {
    await t.tp(BAND_FARM.x + 20, BAND_FARM.z + 20);
    await t.wait(0.6); // chunks spawn on the next update
    const n = await t.ev(`(() => {
      let n = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals)
          if (['longhorn', 'horse', 'goat', 'sheep'].includes(a.species) &&
              Math.hypot(a.homeX - ${BAND_FARM.x}, a.homeZ - ${BAND_FARM.z}) < 40) n++;
      return n;
    })()`);
    t.ok(n > 0, 'no farmstead herd found near the band farmstead (Tillman County, OK)');
  });

  await t.check('band-land animal wanders freely without bouncing back to Texas (widened clamp)', async () => {
    const nm = { x: -3486, z: -1923.7 }; // NM desert band (Hobbs — on NM 18, so walk off the road first)
    const res = await t.ev(`(() => {
      let x = ${nm.x}, z = ${nm.z};
      for (let i = 0; i < 40 && g.nearestAnyRoad(x, z, 6); i++) { x -= 5; z += 5; }
      const a = g.animals.forceSpawn('coyote', x, z);
      a.heading = Math.PI / 2; // face west — deeper into NM, away from Texas
      const start = { x: a.g.position.x, z: a.g.position.z };
      for (let i = 0; i < 40; i++) g.animals.move(a, 12, 0.05);
      return { start, end: { x: a.g.position.x, z: a.g.position.z } };
    })()`);
    const moved = Math.hypot(res.end.x - res.start.x, res.end.z - res.start.z);
    t.ok(moved > 5, `band animal barely moved — clamp still bouncing it back? moved ${moved.toFixed(2)}`);
    const stillBand = await t.ev(`g.inTexasOrBand(${res.end.x}, ${res.end.z}) && !g.inTexas(${res.end.x}, ${res.end.z})`);
    t.ok(stillBand, `animal left the band without crossing into Texas: ${JSON.stringify(res.end)}`);
  });
}
