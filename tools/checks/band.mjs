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
}
