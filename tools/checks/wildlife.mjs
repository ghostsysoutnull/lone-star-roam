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

  // --- Sea-Industry W2: life offshore (5 new sea species, gull/maritime bridge) ---

  await t.check('sea tables: SPECIES_COUNT, the 5 new rows, and their region-table siting', async () => {
    const tables = await t.ev(`(() => {
      const keys = ['spotteddolphin', 'greenturtle', 'cownose', 'tarpon', 'gull'];
      const specs = Object.fromEntries(keys.map((k) => [k, g.SPECIES[k]]));
      const factsOk = keys.every((k) => !!specs[k] && !!specs[k].fact && specs[k].fact.length > 0);
      const behaviorsOk = ['spotteddolphin', 'greenturtle', 'cownose', 'tarpon'].every((k) =>
        specs[k].sea === true && ['graze', 'lurk', 'coil'].includes(specs[k].behavior));
      const offshore = g.animals.regionTable(4200, 2350).map((r) => r[0]);
      return { count: Object.keys(g.SPECIES).length, present: keys.every((k) => !!specs[k]), factsOk, behaviorsOk, offshore };
    })()`);
    t.ok(tables.present, 'one or more of the 5 new sea species keys is missing from SPECIES');
    t.ok(tables.count === 34, `SPECIES_COUNT is ${tables.count}, plan expects 34`);
    t.ok(tables.factsOk, 'a new sea species has an empty/missing fact');
    t.ok(tables.behaviorsOk, 'a non-gull sea row is missing sea:true or has a behavior outside graze/lurk/coil');
    t.ok(tables.offshore.includes('spotteddolphin'), `offshore regionTable(4200,2350) missing spotteddolphin: ${tables.offshore}`);

    const laguna = await t.ev(`(() => {
      let minCoastDist = Infinity;
      for (let x = 2150; x <= 2350; x += 10) {
        for (let z = 5150; z <= 5350; z += 10) {
          const w = g.boatableAt(x, z);
          if (!w || w.kind !== 'gulf') continue;
          const cd = g.coastDist(x, z);
          minCoastDist = Math.min(minCoastDist, cd);
          if (cd < 25) return { x, z, coastDist: cd, species: g.animals.regionTable(x, z).map((r) => r[0]) };
        }
      }
      return { found: false, minCoastDist };
    })()`);
    t.ok(laguna.x !== undefined, `no Laguna Madre flats point in x∈[2150,2350] z∈[5150,5350] step 10 (boatableAt gulf, coastDist<25) — minimum coastDist found in the box: ${laguna.minCoastDist}`);
    if (laguna.x !== undefined) {
      t.ok(laguna.species.includes('cownose') && laguna.species.includes('greenturtle'),
        `flats regionTable at (${laguna.x},${laguna.z}, coastDist ${laguna.coastDist.toFixed(1)}) missing cownose/greenturtle: ${laguna.species}`);
    }

    const site = await t.ev(`(() => {
      const offsets = [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30], [30, -30], [-30, 30]];
      for (const [ox, oz] of offsets) {
        const x = 4580.2 + ox, z = 1859.0 + oz; // SEA_SITES: Galveston south jetty
        const w = g.boatableAt(x, z);
        if (w && w.kind === 'gulf') return { x, z, species: g.animals.regionTable(x, z).map((r) => r[0]) };
      }
      return null;
    })()`);
    t.ok(site, 'no gulf water within ±30u of the SEA_SITES jetty center [4580.2,1859.0]');
    if (site) t.ok(site.species.includes('tarpon'), `regionTable at the jetty site (${site.x},${site.z}) missing tarpon: ${site.species}`);
  });

  await t.check('sea species spawn legality: every gulf animal rides real water at the waterline', async () => {
    await t.tp(4200, 2350, 'BOAT');
    await t.ev(`g.animals.update(0.1, g.player.pos.x, g.player.pos.z, 0)`);
    const res = await t.ev(`(() => {
      const bad = [];
      let seaCount = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) {
          const spec = g.SPECIES[a.species];
          if (!spec.sea) continue;
          seaCount++;
          const w = g.boatableAt(a.g.position.x, a.g.position.z);
          const dy = Math.abs(a.g.position.y - g.SEA_Y);
          if (!w || w.kind !== 'gulf' || dy >= 1.2) bad.push({ species: a.species, x: a.g.position.x, z: a.g.position.z, y: a.g.position.y, water: w });
        }
      return { seaCount, bad };
    })()`);
    t.ok(res.seaCount > 0, 'no sea-flagged animals spawned near [4200,2350]');
    t.ok(res.bad.length === 0, `sea animal off legal gulf water or off the waterline: ${JSON.stringify(res.bad.slice(0, 3))}`);
  });

  await t.check('seaLife: conjures & logs all four species, tarpon rolls at the waterline', async () => {
    await t.tp(4200, 2350, 'BOAT');
    await t.ev(`g.debug.actions.seaLife()`);
    await t.step(3, 'g.animals.update(dt, g.player.pos.x, g.player.pos.z, 0);');
    const logged = await t.ev(`g.gameplay.save.species`);
    for (const sp of ['spotteddolphin', 'greenturtle', 'cownose', 'tarpon']) {
      t.ok(logged.includes(sp), `${sp} missing from save.species after seaLife + close approach`);
    }
    // tarpon W2.1 contract: the Silver King leap (first one early after spawn)
    // + calm between leaps — the ±52° stationary rock shipped once and read
    // as a small submarine (Bruno, 2026-07-23); the old check enforced it
    const seaY = await t.ev('g.SEA_Y');
    const foundTarpon = await t.ev(`(() => {
      const px = g.player.pos.x, pz = g.player.pos.z;
      let best = null, bd = 100;
      for (const e of g.animals.live.values()) for (const a of e.animals) {
        if (a.species !== 'tarpon') continue;
        const d = Math.hypot(a.g.position.x - px, a.g.position.z - pz);
        if (d < bd) { bd = d; best = a; }
      }
      window.__tarpA = best; window.__tmax = -99; window.__zcalm = 0;
      // drive to the asserted state (hermetic law): the natural first leap
      // often fires during the earlier stepping above, and waiting on the
      // random 8–18s re-arm is a coin flip against a fixed window (it flaked
      // exactly that way under the j=4 full run, 2026-07-23)
      if (best) { best.leap = null; best.leapT = 0.1; }
      return !!best;
    })()`);
    t.ok(foundTarpon, 'no tarpon within 100u after seaLife');
    await t.step(4,
      `g.animals.update(dt, g.player.pos.x, g.player.pos.z, 0); window.__tmax = Math.max(window.__tmax, window.__tarpA.g.position.y); if (window.__tarpA.g.position.y < ${seaY + 0.3}) window.__zcalm = Math.max(window.__zcalm, Math.abs(window.__tarpA.g.rotation.z));`,
      `window.__tmax > ${seaY + 0.8} && window.__tarpA.leap == null`); // early-exit once the forced leap has peaked and landed
    const tarp = await t.ev(`({ tmax: window.__tmax, zcalm: window.__zcalm })`);
    t.ok(tarp.tmax > seaY + 0.8, `forced leap not observed in 4s: max y ${tarp.tmax.toFixed(2)} (need > ${(seaY + 0.8).toFixed(2)})`);
    t.ok(tarp.zcalm <= 0.25, `calm-phase sway too big: |rotation.z| ${tarp.zcalm.toFixed(2)} — the submarine rock is back`);

    // legibility pass: the dolphin is a cruiser — always under way so the
    // porpoise arc plays, never parked as an invisible sliver at the waterline.
    // Assert on the NEAREST dolphin: only animals inside ACTIVE_R (150u) are
    // simulated — a far natural spawn legitimately never ticks its state.
    // Path length, not net displacement — a random heading re-roll can fold a
    // genuinely cruising fish back near its start (that displacement version
    // flaked on direction luck under the j=4 full run, 2026-07-23)
    const d0 = await t.ev(`(() => {
      const px = g.player.pos.x, pz = g.player.pos.z;
      let best = null, bd = 100;
      for (const e of g.animals.live.values()) for (const a of e.animals) {
        if (a.species !== 'spotteddolphin') continue;
        const d = Math.hypot(a.g.position.x - px, a.g.position.z - pz);
        if (d < bd) { bd = d; best = a; }
      }
      window.__dolA = best; window.__dsum = 0; window.__dp = null;
      return !!best;
    })()`);
    t.ok(d0, 'no spotteddolphin within 100u after seaLife');
    await t.step(3,
      'g.animals.update(dt, g.player.pos.x, g.player.pos.z, 0); if (window.__dp) window.__dsum += Math.hypot(window.__dolA.g.position.x - window.__dp.x, window.__dolA.g.position.z - window.__dp.z); window.__dp = { x: window.__dolA.g.position.x, z: window.__dolA.g.position.z };');
    const dol = await t.ev(`({ ambling: window.__dolA.ambling, dsum: window.__dsum })`);
    t.ok(dol.ambling === true, 'cruise dolphin is parked (ambling false) — the arc cue is off');
    t.ok(dol.dsum > 6, `cruise dolphin swam only ${dol.dsum.toFixed(2)}u of path over 3s — should be continuously under way`);
  });

  await t.check('flee stays wet: a scared cownose never leaves legal gulf water', async () => {
    await t.tp(4200, 2350, 'BOAT');
    await t.ev(`g.debug.actions.seaLife()`);
    await t.step(1, 'g.animals.update(dt, g.player.pos.x, g.player.pos.z, 0);');
    const ray = await t.ev(`(() => { const a = [...g.animals.live.values()].flatMap((e) => e.animals).find((a) => a.species === 'cownose'); return a ? { x: a.g.position.x, z: a.g.position.z } : null; })()`);
    t.ok(ray, 'no cownose found after seaLife');
    if (!ray) return;
    await t.tp(ray.x, ray.z, 'BOAT'); // right on top of it — inside its 6u fleeR
    await t.step(3, 'g.animals.update(dt, g.player.pos.x, g.player.pos.z, 0);');
    const res = await t.ev(`(() => {
      const a = [...g.animals.live.values()].flatMap((e) => e.animals).find((a) => a.species === 'cownose');
      const w = g.boatableAt(a.g.position.x, a.g.position.z);
      return { d: Math.hypot(a.g.position.x - ${ray.x}, a.g.position.z - ${ray.z}), wet: !!(w && w.kind === 'gulf') };
    })()`);
    t.ok(res.d > 1.5, `cownose didn't gain ground when scared: ${res.d.toFixed(2)}`);
    t.ok(res.wet, 'fleeing cownose left legal gulf water');
  });

  await t.check('gull flock: anchors from seaFlocks, wheels near it, clears with no anchor, logs on approach', async () => {
    await t.tp(4200, 2350, 'BOAT');
    const res = await t.ev(`(() => {
      const px = g.player.pos.x, pz = g.player.pos.z;
      g.animals.seaFlocks = [{ x: px + 10, z: pz }];
      g.animals.update(0.1, px, pz, 0);
      const visible = g.animals.gullGroup?.visible;
      const seaY = g.SEA_Y;
      const gulls = g.animals.gulls.map((b) => ({ d: Math.hypot(b.g.position.x - (px + 10), b.g.position.z - pz), y: b.g.position.y }));
      g.animals.seaFlocks = [];
      g.animals.update(0.1, px, pz, 0);
      const clearedVisible = g.animals.gullGroup?.visible;
      return { visible, gulls, seaY, clearedVisible };
    })()`);
    t.ok(res.visible === true, 'gullGroup not visible with a live anchor in range');
    t.ok(res.gulls.length === 4, `expected 4 gulls, got ${res.gulls.length}`);
    for (const [i, gu] of res.gulls.entries()) {
      t.ok(gu.d < 13, `gull ${i} is ${gu.d.toFixed(1)}u from its anchor — expected < 13`);
      t.ok(gu.y >= res.seaY + 1.5 && gu.y <= res.seaY + 7, `gull ${i} y ${gu.y.toFixed(2)} out of [SEA_Y+1.5, SEA_Y+7]`);
    }
    t.ok(res.clearedVisible === false, 'gullGroup stayed visible after seaFlocks cleared');

    // clear the dedup so this SPOT_R approach is the one that logs it, not the
    // px+10 anchor above (also within SPOT_R and would otherwise mask this)
    await t.ev(`g.gameplay.save.species = g.gameplay.save.species.filter((s) => s !== 'gull')`);
    const logged = await t.ev(`(() => {
      const px = g.player.pos.x, pz = g.player.pos.z;
      g.animals.seaFlocks = [{ x: px + 8, z: pz }];
      g.animals.update(0.1, px, pz, 0);
      return g.gameplay.save.species.includes('gull');
    })()`);
    t.ok(logged, 'gull did not land in the critter save within SPOT_R');
  });

  await t.check('real-loop bridge: main.js wires maritime.workingShrimpers() into animals.seaFlocks every frame', async () => {
    await t.tp(4752, 1993); // Galveston ground
    await t.ev(`g.debug.actions.shrimpFleet()`);
    await t.simWait(2);
    const n = await t.ev(`g.animals.seaFlocks.length`);
    t.ok(n === 10, `animals.seaFlocks has ${n} entries after 2s of real loop — main.js bridge (maritime.workingShrimpers()) not wired?`);
  });
}
