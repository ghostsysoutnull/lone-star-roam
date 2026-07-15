// Shoulder & Shelf, wave 1 — frozen baseline (in-Texas draws must stay
// byte-identical after Padre joins inTexas/inWorld), inTexas/inWorld
// semantics, county counter silence outside Texas, soft wall at all edges,
// and band data joined.

export default async function band(t) {
  // Captured on clean main, 2026-07-14, BEFORE Padre joined inTexas/inWorld —
  // pins that in-Texas scenery draws stay byte-identical once the island is in.
  const FROZEN = [
    { x: -2147.5, z: -3607.7, n: 6, kinds: { farmstead: 1, windmill: 1, chicken: 4 } },   // Hale chunk
    { x: 830.2, z: 847.1, n: 14, kinds: { ranchhq: 1, hqhouse: 1, watertower: 1, windmill: 1, stocktank: 1, barn: 2, pen: 3, flagpole: 1, chicken: 3 } }, // LBJ ranch arch
    { x: -5800, z: -1200, n: 0, kinds: {} },                                              // bare west-Texas chunk
  ];
  for (const spot of FROZEN) {
    await t.check(`frozen baseline: chunk at (${spot.x},${spot.z}) unchanged by Padre join`, async () => {
      await t.tp(spot.x, spot.z);
      await t.wait(1.0);
      const res = await t.ev(`(() => {
        const cx = Math.floor(${spot.x} / 260), cz = Math.floor(${spot.z} / 260);
        const gr = g.scenery.live.get(cx + ',' + cz);
        if (!gr) return { n: 0, kinds: {} };
        let n = 0; const kinds = {};
        gr.traverse((o) => { if (o.userData && (o.userData.prop || o.userData.kind)) { n++; const k = o.userData.prop || o.userData.kind; kinds[k] = (kinds[k]||0)+1; } });
        return { n, kinds };
      })()`);
      t.ok(res.n === spot.n, `count drifted: ${res.n} !== ${spot.n} (${JSON.stringify(res.kinds)})`);
      t.ok(JSON.stringify(res.kinds) === JSON.stringify(spot.kinds), `kinds drifted: ${JSON.stringify(res.kinds)} !== ${JSON.stringify(spot.kinds)}`);
    });
  }

  await t.check('Padre joins inTexas; a Gulf point well off the coast does not', async () => {
    const res = await t.ev(`(() => {
      // verified interior points (ring-crossing midpoints, not bbox/centroid guesses)
      const northRing = g.inTexas(2025.15, 4226.5);
      const southRing = g.inTexas(2192.55, 5216);
      const inGulf = g.inTexas(6500, 5800); // gulf plane center — open water, no ring anywhere near
      return { northRing, southRing, inGulf };
    })()`);
    t.ok(res.northRing, 'the north Padre/Mustang ring is not inTexas — the join did not take');
    t.ok(res.southRing, 'the south Padre ring is not inTexas — the join did not take');
    t.ok(!res.inGulf, 'open Gulf water reads as inTexas — inTexas over-broadened');
  });

  // Points found by walking outward from real border.json vertices along the
  // local outward normal (tools/build-band.mjs's zone classifier), each pair
  // straddling the 402u shoulder / 1127u shelf threshold with comfortable margin.
  const EDGES = [
    { name: 'north (OK panhandle line)', zone: 'land', in: [-298.4, -6363.0], out: [-179.0, -6523.4] },
    { name: 'west (NM line)', zone: 'land', in: [-3681.2, -3361.4], out: [-3881.2, -3362.5] },
    { name: 'east (Texarkana/AR line)', zone: 'land', in: [5208.7, -3137.8], out: [5218.5, -3287.4] },
    { name: 'offshore (Gulf shelf)', zone: 'coast', in: [3476, 3872.1], out: [3768.8, 3937.2] },
  ];
  for (const e of EDGES) {
    await t.check(`inWorld at the ${e.name} edge: in-shoulder true, past-shoulder false`, async () => {
      const res = await t.ev(`({ zIn: g.borderZoneAt(${e.in[0]}, ${e.in[1]}), inW: g.inWorld(${e.in[0]}, ${e.in[1]}), outW: g.inWorld(${e.out[0]}, ${e.out[1]}) })`);
      t.ok(res.zIn === e.zone, `zone classified as ${res.zIn}, expected ${e.zone}`);
      t.ok(res.inW, `just inside the ${e.zone === 'coast' ? 'shelf' : 'shoulder'} reads outside inWorld`);
      t.ok(!res.outW, `just past the ${e.zone === 'coast' ? 'shelf' : 'shoulder'} still reads inWorld`);
    });
  }

  await t.check('Mexico gets no dilation — inWorld matches inTexas regardless of distance (settled as out)', async () => {
    const res = await t.ev(`(() => {
      const near = { zone: g.borderZoneAt(-57.5, 4189.6), inW: g.inWorld(-57.5, 4189.6) };
      const far = { zone: g.borderZoneAt(-177.3, 4777.5), inW: g.inWorld(-177.3, 4777.5) };
      return { near, far };
    })()`);
    t.ok(res.near.zone === 'mexico' && res.far.zone === 'mexico', `expected mexico zone, got ${res.near.zone}/${res.far.zone}`);
    t.ok(!res.near.inW && !res.far.inW, 'a point past the Rio Grande reads inWorld — Mexico must get zero dilation');
  });

  await t.check('soft wall pushes back + tells you why, at a land edge and at the Gulf', async () => {
    // reset the edge-fire latch from a solidly-inWorld spot, clear the toast,
    // THEN jump straight past the shoulder — t.tp's own settle-wait already
    // ticks the real loop, so the wall fires during the teleport itself
    await t.tp(-2767, 334); // I-10 west of Fort Stockton — deep in Texas
    await t.ev(`g.hud.toast('')`);
    await t.tp(5218.5, -3287.4); // past the shoulder near Texarkana
    const landMsg = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(landMsg.includes('far as this road goes'), `no/wrong land-edge wall toast: "${landMsg}"`);

    await t.tp(-2767, 334);
    await t.ev(`g.hud.toast('')`);
    await t.tp(3768.8, 3937.2); // past the shelf, offshore
    const waterMsg = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(waterMsg.includes('blue water'), `no/wrong Gulf wall toast: "${waterMsg}"`);
  });

  await t.check('county counter stays silent in the band (Law: nothing outside ever counts)', async () => {
    const res = await t.ev(`(() => {
      const before = g.gameplay.save.counties.length;
      const shreveportArea = { x: 5486.5, z: -1697.9 }; // Shreveport, LA — no Texas county bbox reaches here
      const county = g.countyAt(shreveportArea.x, shreveportArea.z);
      g.gameplay.enterCounty(county, 1);
      return { county, before, after: g.gameplay.save.counties.length };
    })()`);
    t.ok(res.county === null, `countyAt returned a Texas county name outside Texas: ${res.county}`);
    t.ok(res.after === res.before, `county tally moved outside Texas: ${res.before} -> ${res.after}`);
  });

  await t.check('band terrain uses real DEM elevation (not the outside dip reserved for open water)', async () => {
    const res = await t.ev(`(() => {
      const txkAR = [5307.1, -2718.2]; // Texarkana, AR — real town just past the line
      return { out: g.outsideAt(txkAR[0], txkAR[1]), h: g.hAt(txkAR[0], txkAR[1]) };
    })()`);
    t.ok(res.out, 'Texarkana AR does not read outsideAt — DEM rebake/grid mismatch');
    t.ok(res.h > 1, `band terrain reads near sea-level (${res.h.toFixed(2)}) — looks water-dipped, not real DEM`);
  });

  await t.check('rose scatter determinism: unaffected by the border/DEM rebake (seeds off highways.json only)', async () => {
    const res = await t.ev(`({ n: g.gameplay.roseSpots.length, r0: g.gameplay.roseSpots[0], r150: g.gameplay.roseSpots[150] })`);
    t.ok(res.n === 300, `rose count drifted: ${res.n} !== 300`);
    t.ok(Math.abs(res.r0.x - 1639.2195) < 0.01 && Math.abs(res.r0.z - 3771.5105) < 0.01, `rose 0 moved: ${res.r0.x},${res.r0.z}`);
    t.ok(Math.abs(res.r150.x - 2533.201) < 0.01 && Math.abs(res.r150.z - -2240.5792) < 0.01, `rose 150 moved: ${res.r150.x},${res.r150.z}`);
  });

  await t.check('band-places.json: joined, place count > 0 per neighbor state, known-in/known-out cities correct', async () => {
    const res = await t.ev(`(async () => {
      const d = await (await fetch('data/band-places.json')).json();
      const names = new Set(d.map((p) => p.name));
      return {
        n: d.length,
        perState: Object.fromEntries(['LA','AR','OK','NM'].map((s) => [s, d.filter((p) => p.state === s).length])),
        hasIn: ['Shreveport', 'Texarkana', 'Las Cruces', 'Bossier City'].every((n) => names.has(n)),
        noOut: !['Lawton', 'Lake Charles', 'Carlsbad', 'Roswell', 'Alamogordo'].some((n) => names.has(n)),
        allHavePop: d.every((p) => Number.isFinite(p.pop) && p.pop >= 0), // a real place can legitimately report 0 (e.g. Chattanooga, OK)
      };
    })()`);
    t.ok(res.n > 0, 'band-places.json is empty');
    for (const s of ['LA', 'AR', 'OK', 'NM']) t.ok(res.perState[s] > 0, `no band places joined for ${s}`);
    t.ok(res.hasIn, 'a known in-band city (Shreveport/Texarkana/Las Cruces/Bossier City) is missing — clip or projection drifted');
    t.ok(res.noOut, 'a known out-of-band city (Lawton/Lake Charles/Carlsbad/Roswell/Alamogordo) leaked in — clip too wide');
    t.ok(res.allHavePop, 'a band place has a negative/missing population — join key mismatch');
  });

  await t.check('parish/county lookup at a known Louisiana point (out-of-state HUD line data)', async () => {
    const res = await t.ev(`(async () => {
      const counties = await (await fetch('data/neighbor-counties.json')).json();
      function inPoly(x, z, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        }
        return inside;
      }
      // Shreveport, LA — inside Caddo Parish
      const shreveport = { x: 5486.5, z: -1697.9 };
      const hit = counties.find((c) => c.state === 'LA' && inPoly(shreveport.x, shreveport.z, c.ring));
      return { name: hit?.name, total: counties.length };
    })()`);
    t.ok(res.total > 0, 'neighbor-counties.json is empty');
    t.ok(res.name === 'Caddo Parish', `Shreveport did not resolve to Caddo Parish (got: ${res.name})`);
  });

  await t.check('big map widened to the shoulder/shelf; a band point still maps on-canvas', async () => {
    const res = await t.ev(`(() => {
      const b = g.GEO.bounds;
      const expectedSc = Math.min(
        (1400 - 40) / ((b.maxX + 402) - (b.minX - 402)),
        (1320 - 40) / ((b.maxZ + 1127) - (b.minZ - 402))
      );
      const shreveport = g.hud.mapT(5486.5, -1697.9); // Shreveport, LA — a real band point
      return { sc: g.hud.mapSc, expectedSc, shreveport, texasCornerStillOnCanvas: g.hud.mapT(b.minX, b.minZ) };
    })()`);
    t.ok(Math.abs(res.sc - res.expectedSc) < 1e-6, `map scale not widened to shoulder/shelf bounds: ${res.sc} vs ${res.expectedSc}`);
    t.ok(res.shreveport[0] >= 0 && res.shreveport[0] <= 1400 && res.shreveport[1] >= 0 && res.shreveport[1] <= 1320,
      `a real band city maps off-canvas: ${res.shreveport}`);
    t.ok(res.texasCornerStillOnCanvas[0] >= 0 && res.texasCornerStillOnCanvas[1] >= 0, 'Texas silhouette itself fell off-canvas after widening');
  });

  await t.check('minimap layer stays untouched (Law): its own scale/bounds are Texas-only, decoupled from the widened big map', async () => {
    const res = await t.ev(`(() => {
      const b = g.GEO.bounds;
      const expectedMiniSc = Math.min((1400 - 40) / (b.maxX - b.minX), (1320 - 40) / (b.maxZ - b.minZ));
      return { miniSc: g.hud.miniSc, mapSc: g.hud.mapSc, expectedMiniSc, sameLayer: g.hud.miniLayer === g.hud.mapLayer };
    })()`);
    t.ok(Math.abs(res.miniSc - res.expectedMiniSc) < 1e-6, `minimap scale drifted from its original Texas-only formula: ${res.miniSc} vs ${res.expectedMiniSc}`);
    t.ok(res.miniSc !== res.mapSc, 'minimap scale equals the widened big-map scale — they should be decoupled layers');
    t.ok(!res.sameLayer, 'minimap and big map share one canvas — widening one would leak into the other');
  });

  await t.check('out-of-state HUD line: toasts "Parish, State" once at a real crossing, never touches the county tally', async () => {
    // deterministic: call the same enterBandCounty the main.js hudTick loop
    // calls, directly — an ambient-real-frame wait is too timing-fragile
    // under full-suite parallel load (CLAUDE.md: wait in physics time, use steppers)
    await t.tp(5486.5, -1697.9); // Shreveport, LA — inside Caddo Parish
    const res = await t.ev(`(() => {
      const before = g.gameplay.save.counties.length;
      g.gameplay.bandCountyNow = null; g.gameplay.bandCountyToastT = 0; g.hud.toast('');
      const nc = g.neighborCountyAt(g.player.pos.x, g.player.pos.z);
      g.gameplay.enterBandCounty(nc ? nc.name + ', Louisiana' : null, 0.08);
      return { nc, before, after: g.gameplay.save.counties.length, toast: document.getElementById('toast').textContent };
    })()`);
    t.ok(res.nc?.name === 'Caddo Parish', `neighborCountyAt missed Caddo Parish at Shreveport: ${JSON.stringify(res.nc)}`);
    t.ok(res.toast === '🗺 Caddo Parish, Louisiana', `wrong/missing band-county toast: "${res.toast}"`);
    t.ok(res.after === res.before, `band parish crossing touched the Texas county tally: ${res.before} -> ${res.after}`);
  });

  // --- Wave 2: The Neighbors — band cities/stars/townsfolk/aviation/Passport ---
  const SHV = { x: 5406, z: -1638.9, pop: 177323 }; // Shreveport, LA (band-places.json)

  await t.check('band city (Shreveport) renders through cities.js — building count scales with real pop', async () => {
    await t.tp(SHV.x - 300, SHV.z);
    await t.wait(0.5);
    const res = await t.ev(`(() => {
      const g2 = g.cities.live.get('band:Shreveport');
      if (!g2) return { has: false };
      const inst = g2.children.find((c) => c.isInstancedMesh);
      return { has: true, band: g2.userData.band, count: inst ? inst.count : 0 };
    })()`);
    t.ok(res.has, 'Shreveport did not spawn in cities.live under its band: key');
    t.ok(res.band === true, 'spawned band city group missing userData.band');
    t.ok(res.count > 20, `Shreveport (pop ${SHV.pop}) spawned too few buildings: ${res.count}`);
  });

  await t.check('silver star present at an unvisited band city, distinct from gold Texas stars', async () => {
    const res = await t.ev(`(() => {
      const s = g.gameplay.bandCityStars.children.find((c) => c.userData.city === 'Shreveport');
      const gold = g.gameplay.cityStars.children[0]?.material.color.getHex();
      return { has: !!s, color: s?.material.color.getHex(), gold };
    })()`);
    t.ok(res.has, 'no silver star at unvisited Shreveport');
    t.ok(res.color === 0xc7ccd4, `band star not silver: ${res.color?.toString(16)}`);
    t.ok(res.gold === undefined || res.color !== res.gold, 'band star shares the gold Texas star color — Law violated');
  });

  await t.check('visiting a band city ticks the Passport, not the Texas 132 — HUD row reflects it', async () => {
    const before = await t.ev(`({ towns: g.gameplay.save.passport.towns.length, cities: g.gameplay.save.cities.length })`);
    await t.tp(SHV.x, SHV.z);
    await t.wait(0.5);
    const res = await t.ev(`({
      towns: g.gameplay.save.passport.towns.includes('Shreveport'),
      townsLen: g.gameplay.save.passport.towns.length,
      citiesLen: g.gameplay.save.cities.length,
      starGone: !g.gameplay.bandCityStars.children.find((c) => c.userData.city === 'Shreveport'),
      hudTowns: document.getElementById('score-pass-towns').textContent,
    })`);
    t.ok(res.towns, 'Shreveport not recorded in save.passport.towns after visiting its center');
    t.ok(res.starGone, 'silver star still present after the visit');
    t.ok(res.citiesLen === before.cities, `Texas save.cities moved from a band visit: ${before.cities} -> ${res.citiesLen}`);
    t.ok(+res.hudTowns === res.townsLen, `HUD Passport-towns row (${res.hudTowns}) doesn't match save (${res.townsLen})`);
  });

  await t.check('Passport state stamp on first crossing (direct call, W1 enterBandCounty idiom)', async () => {
    await t.ev(`(() => { g.gameplay.save.passport.stamps = []; g.hud.toast(''); })()`);
    await t.ev(`g.gameplay.stampState('LA', 'Louisiana')`);
    await t.wait(0.2); // hud.update() runs on its own throttled rAF tick, not synchronously with the mutation above
    const res = await t.ev(`({
      stamps: g.gameplay.save.passport.stamps.slice(),
      toast: document.getElementById('toast').textContent,
      hud: document.getElementById('score-pass-stamps').textContent,
    })`);
    t.ok(res.stamps.includes('LA'), 'stampState did not record LA');
    t.ok(res.toast.includes('Louisiana'), `wrong/missing Passport stamp toast: "${res.toast}"`);
    t.ok(+res.hud === res.stamps.length, `HUD Passport-stamps row (${res.hud}) doesn't match save (${res.stamps.length})`);
  });

  await t.check('townsfolk spawn at a band city by pop tier, and night-gate the same as Texas towns', async () => {
    await t.setDay();
    await t.tp(SHV.x - 300, SHV.z);
    await t.wait(0.6);
    const dayRes = await t.ev(`(() => {
      const folk = g.npcs.townByCity.get('band:Shreveport');
      if (!folk) return { has: false };
      return { has: true, n: folk.length, bigCity: folk[0].bigCity, visible: folk.map((f) => f.g.visible) };
    })()`);
    t.ok(dayRes.has, 'no townsfolk spawned at Shreveport (pop 177,323, within 500u)');
    t.ok(dayRes.n === 3, `Shreveport (mid-size, >80k<400k) should get 3 townsfolk, got ${dayRes.n}`);
    t.ok(dayRes.bigCity === false, 'Shreveport (177,323) misclassified as bigCity (>400k threshold)');
    t.ok(dayRes.visible.every(Boolean), 'townsfolk not visible by day');
    await t.setNight();
    const nightVisible = await t.ev(`g.npcs.townByCity.get('band:Shreveport').map((f) => f.g.visible)`);
    t.ok(nightVisible.every((v) => v === false), 'non-bigCity band townsfolk stayed visible after dark');
    await t.setDay();
  });

  await t.check('daySchedule runs clean over the full field table — every id has ROUTES, no dangling destination', async () => {
    const res = await t.ev(`(() => {
      try {
        const sched = g.daySchedule(0);
        const ids = new Set(g.AIRPORTS.map((a) => a.id));
        const scheduledIds = new Set(sched.map((s) => s.id));
        const militaryIds = g.AIRPORTS.filter((a) => a.military).map((a) => a.id);
        const bandIds = g.AIRPORTS.filter((a) => a.band && !a.military).map((a) => a.id);
        const dangling = sched.flatMap((s) => s.slots.map((sl) => sl.dest)).filter((d) => !ids.has(d));
        return {
          ok: true, n: sched.length, total: g.AIRPORTS.length,
          militaryExcluded: militaryIds.every((id) => !scheduledIds.has(id)),
          bandIncluded: bandIds.every((id) => scheduledIds.has(id)),
          dangling,
        };
      } catch (e) { return { ok: false, err: String(e) }; }
    })()`);
    t.ok(res.ok, `daySchedule threw: ${res.err}`);
    t.ok(res.n === res.total - 2, `daySchedule should schedule every field but the 2 military ones: ${res.n} of ${res.total}`);
    t.ok(res.militaryExcluded, 'a military field (Cannon/Barksdale) appeared in the civilian schedule');
    t.ok(res.bandIncluded, 'a civilian band field (SHV/TXK/CVN/HOB) is missing from the schedule');
    t.ok(res.dangling.length === 0, `ROUTES destination(s) not in AIRPORTS: ${res.dangling}`);
  });

  await t.check('military fields (Cannon/Barksdale) are tagged and excluded from charter offers', async () => {
    const res = await t.ev(`(() => {
      const cvs = g.AIRPORTS.find((a) => a.id === 'CVS'), bad = g.AIRPORTS.find((a) => a.id === 'BAD');
      const offers = g.missions.genCharterOffers();
      const bad2 = offers.filter((o) => o.fromId === 'CVS' || o.toId === 'CVS' || o.fromId === 'BAD' || o.toId === 'BAD');
      return { cvsMil: cvs?.military, badMil: bad?.military, cvsBand: cvs?.band, badBand: bad?.band, leaked: bad2.length };
    })()`);
    t.ok(res.cvsMil === true && res.badMil === true, 'Cannon/Barksdale missing military:true');
    t.ok(res.cvsBand === true && res.badBand === true, 'Cannon/Barksdale missing band:true');
    t.ok(res.leaked === 0, `${res.leaked} charter offer(s) reference a military field`);
  });

  await t.check('Cannon-Barksdale B-52 pair: forceable, closes distance along the real corridor, then lands quiet', async () => {
    const r = await t.ev(`(() => {
      g.military.despawnAll(); g.aviation.despawnAll();
      const cannon = { x: -3647.0, z: -3764.7 };
      const ok = g.military.force('b52', g.aviation, cannon.x, cannon.z);
      if (!ok) return { err: 'force failed' };
      const c = g.military.candidates.find((x) => x.kind === 'b52');
      const d0 = Math.hypot(c.x1 - c.x0, c.z1 - c.z0);
      for (let i = 0; i < 300; i++) g.military.update(0.05, cannon.x, cannon.z, g.aviation); // 15s — 760u leg / 62u/s ≈ 12.3s
      return { err: null, d0, stillFlying: c.flying, x1: c.x1, z1: c.z1 };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.d0 > 700 && r.d0 < 800, `b52 leg length off (expected ~760u): ${r.d0}`);
    t.ok(!r.stillFlying, 'B-52 pair never finished its pass — it should complete and go quiet');
    await t.ev('g.military.despawnAll()');
  });

  await t.check('TX↔band charter full cycle: DFW to Shreveport Regional, Passport landing stamp', async () => {
    await t.ev(`(() => { g.gameplay.save.passport.landings = []; })()`);
    await t.ev("g.missions.force('DFW', 'SHV')");
    t.ok((await t.ev('g.missions.job.kind')) === 'charter', 'force(DFW, SHV) did not create a charter job');
    const rwDFW = await t.ev(`(() => { const a = g.AIRPORTS.find((x) => x.id === 'DFW'); return { cx: a.rws[0].cx, cz: a.rws[0].cz }; })()`);
    const hDFW = await t.ev(`g.hAt(${rwDFW.cx}, ${rwDFW.cz})`);
    await t.tp(rwDFW.cx, rwDFW.cz, 'FLY', hDFW + 1);
    await t.until("g.missions.job && g.missions.job.phase === 'haul'", 8000);
    const rwSHV = await t.ev(`(() => { const a = g.AIRPORTS.find((x) => x.id === 'SHV'); return { cx: a.rws[0].cx, cz: a.rws[0].cz }; })()`);
    const hSHV = await t.ev(`g.hAt(${rwSHV.cx}, ${rwSHV.cz})`);
    const bank0 = await t.ev('g.gameplay.save.bank');
    await t.tp(rwSHV.cx, rwSHV.cz, 'FLY', hSHV + 1);
    await t.until('!g.missions.job', 8000);
    const res = await t.ev(`({ paid: g.gameplay.save.bank - ${bank0}, landings: g.gameplay.save.passport.landings.slice() })`);
    t.ok(res.paid > 0, `TX-to-band charter delivery paid nothing: ${res.paid}`);
    t.ok(res.landings.includes('SHV'), `Passport landings missing SHV: ${JSON.stringify(res.landings)}`);
  });

  await t.check('band highways render as their own layer, separate from GEO.highways (rose-scatter safety)', async () => {
    const res = await t.ev(`(() => {
      const near = g.nearestBandRoad(${SHV.x}, ${SHV.z}, 300);
      const street = g.nearestBandRoad(${SHV.x}, ${SHV.z}, 300, (ty) => ty === 'street');
      return { n: g.GEO.bandHighways.length, near: !!near, street: !!street };
    })()`);
    t.ok(res.n > 0, 'GEO.bandHighways is empty — the through-route arterials never got baked/loaded');
    t.ok(res.near, 'no band arterial found near Shreveport (25mi through-route bake missing/misplaced)');
    t.ok(!res.street, 'a "street" tier band road exists — band roads should be arterials only (no metro-street bake this wave)');
  });

  // The bake once projected before simplifying, applying a DEGREE tolerance in
  // game units (~1000x too tight) — band roads shipped at 2.2 u/pt against
  // Texas's 34.6, so they read visibly denser and rougher the moment you crossed
  // the line. Nothing failed; it took an eyes-on playtest to spot. Guard the
  // ratio, not a point count, so a legitimate rebake can move the roads freely.
  await t.check('band roads are simplified to the same degree-tolerance as Texas roads', async () => {
    const res = await t.ev(`(() => {
      const lenOf = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i-1][0], p[i][1] - p[i-1][1]); return L; };
      const dens = (hw, ty) => {
        const s = hw.filter((h) => h.type === ty);
        const pts = s.reduce((a, h) => a + h.pts.length, 0);
        return pts ? s.reduce((a, h) => a + lenOf(h.pts), 0) / pts : 0;
      };
      const out = {};
      for (const ty of ['motorway', 'trunk', 'primary']) out[ty] = { tx: dens(g.GEO.highways, ty), band: dens(g.GEO.bandHighways, ty) };
      return out;
    })()`);
    for (const [ty, d] of Object.entries(res)) {
      // band stubs are straighter than Texas's urban stretches, so they simplify
      // sparser (higher u/pt) — only a DENSER band road indicates the unit bug.
      t.ok(d.band > d.tx * 0.5,
        `band ${ty} carries a vertex every ${d.band.toFixed(1)}u vs Texas's ${d.tx.toFixed(1)}u — far denser, so the bake is simplifying in game units against a degree tolerance again (tools/build-band-roads.mjs: simplify BEFORE proj)`);
    }
  });
}
