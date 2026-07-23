// Shoulder & Shelf, wave 3 — Padre and the coast road: the island as real
// drivable land (sand mesh, map presence), the wet-sand speed cap, the Queen
// Isabella Causeway ceremony, SPI mini-town + Mansfield jetties, the Port
// Isabel Lighthouse landmark, the Malaquite dawn turtle release, and the
// retargeted Gulf Coast travel entry. Coordinates here were validated against
// the island rings offline (see the wave-3 session).

export default async function padre(t) {
  await t.check('island membership: onIsland/beachAt carve land, beach strip, dunes, water', async () => {
    const res = await t.ev(`({
      malaquite: g.onIsland(2102.3, 3971.2),          // north ring, visitor-center beach
      spi: g.onIsland(2225.2, 5449.1),                // south ring, mini-town spit
      laguna: g.onIsland(2140, 5300),                 // Laguna Madre open water
      mainland: g.onIsland(2185.6, 5479.6),           // Port Isabel — Texas, but NOT island
      beachEdge: g.beachAt(2104, 3971.2),             // 1.3 units off the waterline
      duneInterior: g.beachAt(2087, 3971.2),          // 17 units from either shore
      mainlandBeach: g.beachAt(2185.6, 5479.6),
    })`);
    t.ok(res.malaquite, 'Malaquite beach is not onIsland');
    t.ok(res.spi, 'the SPI spit is not onIsland');
    t.ok(!res.laguna, 'open Laguna Madre water reads as island');
    t.ok(!res.mainland, 'Port Isabel (mainland) reads as island — onIsland over-broadened');
    t.ok(res.beachEdge, 'the waterline strip is not beach');
    t.ok(!res.duneInterior, 'the dune interior reads as beach — the whole island became a highway');
    t.ok(!res.mainlandBeach, 'the mainland shore reads as beach');
  });

  await t.check('island sand meshes exist and span land-above-water to seabed', async () => {
    const res = await t.ev(`(() => {
      const out = [];
      for (const m of (g.padreSites.islands ?? [])) {
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        out.push({ minY: bb.min.y, maxY: bb.max.y, minX: bb.min.x, maxX: bb.max.x });
      }
      return out;
    })()`);
    t.ok(res.length === 2, `expected 2 island sand meshes, got ${res.length}`);
    for (const bb of res) {
      t.ok(bb.maxY > -1.5, `sand never rises above the water plane (maxY ${bb.maxY.toFixed(2)} vs water -2.5)`);
      t.ok(bb.minY < -3, `shoreline never drops below water (minY ${bb.minY.toFixed(2)})`);
    }
  });

  await t.check('wet sand drives at road speed; the dune belt stays offroad-slow', async () => {
    // straight 100-unit stretch of the seaward edge (z 3800→3900, dev < 0.5u),
    // ugly natural heading — not an axis-aligned convenience run
    await t.tp(2176.5, 3802);
    await t.ev(`(g.player.heading = Math.atan2(-(2135.5 - 2176.5), -(3898 - 3802)), g.player.keys['KeyW'] = true)`);
    const beach = await t.simStep(3);
    await t.ev(`g.player.keys['KeyW'] = false`);
    t.ok(beach.maxSpeed > 30, `wet sand never reached road speed: ${beach.maxSpeed.toFixed(1)} (cap should be 33)`);
    t.ok(beach.maxSpeed < 34.5, `wet sand overshot the posted 33: ${beach.maxSpeed.toFixed(1)}`);
    const still = await t.ev(`g.beachAt(g.player.pos.x, g.player.pos.z)`);
    t.ok(still, 'the run drifted off the beach strip — cap reading is not trustworthy');
    await t.tp(2133.5, 3850); // mid-island dune belt, ~22 units from either shore
    await t.ev(`g.player.keys['KeyW'] = true`);
    const dune = await t.simStep(2.5);
    await t.ev(`g.player.keys['KeyW'] = false`);
    t.ok(dune.maxSpeed < 20.6, `dune interior exceeded the stock offroad cap: ${dune.maxSpeed.toFixed(1)}`);
  });

  await t.check('Queen Isabella Causeway: ceremony toast fires mid-deck in DRIVE', async () => {
    await t.ev(`document.getElementById('toast').textContent = ''`);
    await t.tp(2207.3, 5473.3); // mid-span over the laguna
    await t.until(`/Queen Isabella/.test(document.getElementById('toast').textContent)`, 8000); // ceremony lives in the real hudTick loop
    const res = await t.ev(`({
      toast: document.getElementById('toast').textContent,
      road: !!g.nearestRoad(g.player.pos.x, g.player.pos.z, 4),
    })`);
    t.ok(/Queen Isabella/.test(res.toast), `no causeway toast mid-deck: "${res.toast}"`);
    t.ok(!res.road, 'the causeway deck registers as a road — the cap/ceremony logic will double-fire');
  });

  await t.check('SPI mini-town, jetties, causeway props exist (scenery, never a city)', async () => {
    const res = await t.ev(`({
      spi: g.padreSites.spi.children.length,
      jetty: g.padreSites.jetty.children.length,
      causeway: g.padreSites.causeway.children.length,
      spiCity: g.GEO.cities.some((c) => /padre|isabel/i.test(c.name)),
    })`);
    t.ok(res.spi === 7, `SPI towers: ${res.spi} !== 7`);
    t.ok(res.jetty === 28, `jetty rocks: ${res.jetty} !== 28 (14 per side)`);
    t.ok(res.causeway >= 8, `causeway props thin: ${res.causeway} (deck + 2 rails + pylons)`);
    t.ok(!res.spiCity, 'SPI/Port Isabel crept into GEO.cities — the 132 is sacred');
  });

  await t.check('Port Isabel Lighthouse: landmark collects at parked distance', async () => {
    // 14 units off the tower — where a player actually parks, not boots-on-door
    await t.tp(2185.6 + 10, 5479.6 + 10);
    await t.wait(0.5); // collection lives in gameplay.update (real loop)
    const res = await t.ev(`({
      got: g.gameplay.save.landmarks.includes('Port Isabel Lighthouse'),
      total: document.getElementById('total-landmarks').textContent,
    })`);
    t.ok(res.got, 'lighthouse did not collect from parked distance (14u, radius 20)');
    t.ok(res.total === '39', `landmark total in HUD is ${res.total}, expected 39 (36 + lighthouse + W4's SS Selma + Guadalupe Peak)`);
  });

  await t.check('collectible totals in the DOM come from the live tables', async () => {
    const res = await t.ev(`({
      critters: document.getElementById('total-critters').textContent,
      species: Object.keys(g.SPECIES).length,
      legends: document.getElementById('total-legends').textContent,
      legendCount: Object.keys(g.LEGENDS).length,
    })`);
    t.ok(res.critters === String(res.species), `critter total ${res.critters} !== SPECIES table ${res.species}`);
    t.ok(res.species === 34, `species table is ${res.species}, expected 34 (29 + Sea W2's five offshore)`);
    t.ok(res.legends === String(res.legendCount), `legend total ${res.legends} !== LEGENDS table ${res.legendCount}`);
  });

  await t.check('turtle release: seeded morning shows hatchlings that actually crawl', async () => {
    const res = await t.ev(`(() => {
      let D = -1, E = -1;
      for (let d = 0; d < 400 && (D < 0 || E < 0); d++) {
        const roll = g.seededRand('turtle:' + d)() < 0.45;
        if (roll && D < 0) D = d;
        if (!roll && E < 0) E = d;
      }
      const posOf = (i) => {
        const a = g.turtles.mesh.instanceMatrix.array;
        return [a[i * 16 + 12], a[i * 16 + 14]];
      };
      // hatchling silhouette: merged vertex-colored geometry, not the old 8-corner box
      const geo = g.turtles.mesh.geometry;
      const shape = { verts: geo.attributes.position.count, colored: !!geo.attributes.color && g.turtles.mesh.material.vertexColors };
      // count event toasts without unwiring the HUD
      let toasts = 0, lastToast = '';
      const prevEvent = g.turtles.onEvent;
      g.turtles.onEvent = (m) => { toasts++; lastToast = m; prevEvent?.(m); };
      // release morning, early: player near (12u) — animated, event announced
      g.turtles.update(0.05, 2110, 3971, 0.26, D + 0.26);
      const early = { visible: g.turtles.mesh.visible, p: posOf(24), toasts };
      // later the same morning: the same hatchling has moved seaward, no re-toast
      g.turtles.update(0.05, 2110, 3971, 0.29, D + 0.29);
      const late = { visible: g.turtles.mesh.visible, p: posOf(24), toasts };
      const moved = Math.hypot(late.p[0] - early.p[0], late.p[1] - early.p[1]);
      const spotted0 = g.gameplay.save.species.includes('kempsridley');
      // watch from parked distance (35u < SPOT_R 40) → logs the species
      g.turtles.update(0.05, 2098 + 35, 3971, 0.29, D + 0.29);
      const spotted = g.gameplay.save.species.includes('kempsridley');
      // off morning and off hour: nothing
      g.turtles.update(0.05, 2110, 3971, 0.26, E + 0.26);
      const offDay = g.turtles.mesh.visible;
      g.turtles.update(0.05, 2110, 3971, 0.5, D + 0.5);
      const noon = g.turtles.mesh.visible;
      g.turtles.onEvent = prevEvent;
      return { D, E, shape, early, late, moved, spotted0, spotted, offDay, noon, toasts, lastToast };
    })()`);
    t.ok(res.D >= 0 && res.E >= 0, `seeded scan found no release/quiet morning in 400 days (D ${res.D}, E ${res.E})`);
    t.ok(res.shape.verts > 100 && res.shape.colored, `hatchling is still a plain box (${res.shape.verts} verts, colored ${res.shape.colored})`);
    t.ok(res.early.visible && res.late.visible, 'hatchlings invisible during a release-morning dawn');
    t.ok(res.moved > 1.5, `hatchling 24 barely moved over the morning: ${res.moved.toFixed(2)}u — animation dead`);
    t.ok(res.early.toasts === 1 && /Kemp/.test(res.lastToast), `event toast on arrival: fired ${res.early.toasts}×, text "${res.lastToast}"`);
    t.ok(res.toasts === 1, `event toast repeated within one morning (${res.toasts}× total)`);
    t.ok(res.spotted0, 'watching from 12u never logged the ridley');
    t.ok(res.spotted, 'kempsridley not in save.species after watching from 35u');
    t.ok(!res.offDay, 'hatchlings out on a non-release morning — seeding ignored');
    t.ok(!res.noon, 'hatchlings out at noon — dawn window ignored');
  });

  await t.check('travel entry "Gulf Coast — Padre Island" arrives on the sand in DRIVE', async () => {
    await t.ev(`(g.travel.tab = 'Nature', g.travel.render())`);
    const res = await t.ev(`(() => {
      const e = g.travel.current.find((p) => /Padre/.test(p.name));
      if (!e) return { found: false };
      g.travel.go(e);
      const p = g.player;
      return { found: true, mode: p.mode, island: g.onIsland(p.pos.x, p.pos.z),
               beachNear: g.beachAt(p.pos.x + 4, p.pos.z) || g.beachAt(p.pos.x, p.pos.z) || g.beachAt(p.pos.x - 4, p.pos.z) };
    })()`);
    t.ok(res.found, 'no Padre entry in the Nature tab');
    t.ok(res.mode === 'DRIVE', `arrived in ${res.mode}, spec says DRIVE`);
    t.ok(res.island, 'travel arrival is not on the island');
    t.ok(res.beachNear, 'travel arrival is nowhere near the beach strip');
  });

  await t.check('beach kit spawns on Malaquite chunks; the map draws the island on both layers', async () => {
    await t.tp(2102, 3971);
    await t.wait(1.0); // scenery chunk spawn is throttled
    const res = await t.ev(`(() => {
      // the island-column chunks around Malaquite (the strip drifts across
      // cx 7/8 here); the wider live neighborhood legitimately includes
      // mainland brush across the laguna, so never tally it whole
      const kinds = {};
      for (const key of ['7,14', '7,15', '7,16', '8,14', '8,15', '8,16']) {
        const gr = g.scenery.live.get(key);
        if (gr) gr.traverse((o) => { const k = o.userData?.kind; if (k) kinds[k] = (kinds[k] || 0) + 1; });
      }
      const probe = (layer, T, x, z) => {
        const [px, pz] = T(x, z);
        return [...layer.getContext('2d').getImageData(Math.round(px), Math.round(pz), 1, 1).data];
      };
      return { kinds,
        miniIsland: probe(g.hud.miniLayer, g.hud.miniT, 2100, 3971),
        miniGulf: probe(g.hud.miniLayer, g.hud.miniT, 2400, 3971),
        wideIsland: probe(g.hud.mapLayer, g.hud.mapT, 2100, 3971),
        wideGulf: probe(g.hud.mapLayer, g.hud.mapT, 2400, 3971) };
    })()`);
    const beachKit = (res.kinds.dune ?? 0) + (res.kinds.seaoats ?? 0) + (res.kinds.driftwood ?? 0);
    t.ok(beachKit > 0, `no dunes/sea oats/driftwood in the live chunks around Malaquite: ${JSON.stringify(res.kinds)}`);
    t.ok(!res.kinds.mesquite, 'mesquite growing on the beach — the island chunk table did not take');
    t.ok(res.miniIsland[3] > 0, 'minimap: island pixel is transparent — Padre still missing from the Texas silhouette');
    t.ok(res.miniGulf[3] === 0, 'minimap: open Gulf east of the island got painted — island fill leaked');
    t.ok(res.wideIsland.join() !== res.wideGulf.join(), 'big map: island pixel identical to open Gulf — island not drawn on the wide layer');
  });
}
