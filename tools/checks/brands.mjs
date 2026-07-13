// Texas Brands (brands.js) — Wave 1: Bucky's travel centers. Assert numbers,
// not pixels: real-loop streaming, showpiece poly floor, placement legality,
// approach-billboard road-hugging, and night-gated emissive signage (~0 by
// day). The streaming check drives the REAL loop (no manual brands.update)
// so broken main.js wiring can't hide behind it. One SHOT of the silhouette.

export default async function brands(t) {
  // Katy sits on I-10 (motorway) — ideal for the spawn + billboard road-hug.
  const katyAt = await t.ev(`({
    x: (-95.8475 + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100,
    z: -(29.7787 - 31) * 111320 / 100,
  })`);

  await t.check('streaming sentinel: the real loop spawns/despawns a site by distance', async () => {
    // teleport ONTO Katy and let the render loop (main.js brands.update) spawn it
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const near = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      return { has: !!r, y: r.group.position.y, kids: r.building.children.length };
    })()`);
    t.ok(near.has && near.kids >= 3, `spawn incomplete: ${JSON.stringify(near)}`);

    // capture shared prototype geometries — they must SURVIVE despawn
    const protoBefore = await t.ev(`({
      pump: !!g.brands.pumpGeo.attributes, board: !!g.brands.billboardGeo.attributes,
    })`);
    t.ok(protoBefore.pump && protoBefore.board, 'prototypes missing before despawn');

    // drive far away — the loop must dispose the site group
    await t.tp(katyAt.x + 1200, katyAt.z);
    await t.until(`!g.brands.live.has('Katy')`, 8000);
    const after = await t.ev(`({
      live: g.brands.live.has('Katy'),
      pump: !!(g.brands.pumpGeo.attributes && g.brands.pumpGeo.attributes.position),
      board: !!(g.brands.billboardGeo.attributes && g.brands.billboardGeo.attributes.position),
    })`);
    t.ok(!after.live, 'site never despawned');
    t.ok(after.pump && after.board, `shared prototype geometry was disposed: ${JSON.stringify(after)}`);
  });

  await t.check('showpiece poly floor: hero merged triangle count beats a heli-body baseline', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const tris = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      const tri = (m) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
      return { staticT: tri(r.staticMesh) };
    })()`);
    const total = tris.staticT;
    // a heli body is ~120-260 tris; a showpiece storefront must dwarf that
    t.ok(total > 400, `hero not showpiece-tier: ${total} tris (${JSON.stringify(tris)})`);
  });

  await t.check('sign panel: the "Bucky\'s" name actually renders (textured, not blank)', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const panel = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      const p = r.signPanel;
      return { has: !!p, mapped: !!(p && p.material && p.material.map), visible: p ? p.visible : false };
    })()`);
    t.ok(panel.has && panel.mapped, `Bucky's sign panel missing or blank: ${JSON.stringify(panel)}`);
    t.ok(panel.visible, "Bucky's sign panel not visible");
  });

  await t.check('placement legality: no Bucky\'s sits on an airport field', async () => {
    // scan every site coord through the pure exclusion query
    const bad = await t.ev(`(() => {
      const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];
      const coords = [
        ['Luling',29.6507,-97.5935],['New Braunfels',29.7269,-98.0779],['Bastrop',30.1071,-97.3058],
        ['Baytown',29.8008,-94.9999],['Katy',29.7787,-95.8475],['Texas City',29.4284,-95.0632],
        ['Terrell',32.7167,-96.3212],['Temple',31.1364,-97.3293],['Denton',33.1793,-97.1026],
        ['Melissa',33.2713,-96.5923],['Royse City',32.9792,-96.2953],['Ennis',32.3232,-96.6066],
        ['Waller',30.0715,-95.9321],['Madisonville',30.9652,-95.8807],['Northlake',33.0242,-97.2784],
      ];
      return coords.filter(([n, la, lo]) => { const [x, z] = LL(la, lo); return !g.airportClear(x, z); }).map((c) => c[0]);
    })()`);
    t.ok(bad.length === 0, `sites on an airport: ${bad.join(', ')}`);
  });

  await t.check('approach billboards: 3+ posts hug the nearest motorway/trunk', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const b = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      const posts = r.boards.map((p) => {
        const rd = g.nearestRoad(p.wx, p.wz, 30, (ty) => ty === 'motorway' || ty === 'trunk');
        return { d: rd ? rd.dist : 999 };
      });
      // the copy must actually RENDER: each panel carries a canvas texture,
      // and the signs aren't all the same pun (varied campaign per site)
      const maps = r.boards.map((p) => !!(p.panel && p.panel.material && p.panel.material.map));
      const copies = new Set(r.boards.map((p) => p.copy));
      return { n: posts.length, maxD: Math.max(...posts.map((p) => p.d)), mapped: maps.every(Boolean), variety: copies.size };
    })()`);
    t.ok(b.n >= 3, `too few billboards: ${b.n}`);
    t.ok(b.maxD < 4, `a billboard strayed off the road: ${b.maxD.toFixed(2)} units`);
    t.ok(b.mapped, 'a billboard panel has no copy texture (blank sign)');
    t.ok(b.variety >= 2, `billboards all show the same pun: ${b.variety} distinct`);
  });

  await t.check('grounding: pad at MAX terrain height + foundation skirt reaches below the lot MIN', async () => {
    // relief over the same ±20 lot grid brands.js samples; pick the steepest site
    const pick = await t.ev(`(() => {
      const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];
      const coords = [['Bastrop',30.1071,-97.3058],['Temple',31.1364,-97.3293],['Denton',33.1793,-97.1026],
        ['Melissa',33.2713,-96.5923],['Terrell',32.7167,-96.3212],['Northlake',33.0242,-97.2784],
        ['New Braunfels',29.7269,-98.0779],['Waller',30.0715,-95.9321],['Luling',29.6507,-97.5935]];
      const range = (x, z) => { let mn = Infinity, mx = -Infinity;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const h = g.hAt(x + i * 20, z + j * 20); if (h < mn) mn = h; if (h > mx) mx = h; }
        return { mn, mx }; };
      let best = null;
      for (const [n, la, lo] of coords) {
        const [x, z] = LL(la, lo); const { mn, mx } = range(x, z);
        if (!best || mx - mn > best.relief) best = { n, x, z, relief: mx - mn, mn, mx };
      }
      return best;
    })()`);
    await t.tp(pick.x, pick.z + 3);
    await t.until(`g.brands.live.has('${pick.n}')`, 8000);
    const g0 = await t.ev(`(() => {
      const r = g.brands.live.get('${pick.n}');
      r.staticMesh.geometry.computeBoundingBox();
      return { padY: r.group.position.y, baseWorld: r.group.position.y + r.staticMesh.geometry.boundingBox.min.y };
    })()`);
    t.near(g0.padY, pick.mx, 0.05, `pad not at lot max (relief ${pick.relief.toFixed(2)})`);
    // the foundation must drape at or below the lowest lot terrain — no floating corner
    t.ok(g0.baseWorld <= pick.mn + 1e-3, `foundation floats above the lot min: base ${g0.baseWorld.toFixed(2)} vs min ${pick.mn.toFixed(2)} (relief ${pick.relief.toFixed(2)})`);
  });

  await t.check('grounding: walking/driving over the pad rides the slab top, not raw terrain underneath', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const expect = await t.ev(`({ padTop: g.brandGroundYAt(${katyAt.x}, ${katyAt.z}), raw: g.hAt(${katyAt.x}, ${katyAt.z}) })`);
    t.ok(expect.padTop !== null, "brandGroundYAt returned null standing on Bucky's own pad");
    // PAD_TOP (0.42) is added on top of the pad's max-terrain sample, which is
    // itself >= raw hAt at the same point — so the two must diverge by at
    // least that much, proving the pad (not raw relief) drives the number.
    t.ok(expect.padTop > expect.raw + 0.3, `pad top barely clears raw terrain: ${JSON.stringify(expect)}`);

    await t.ev(`(() => { g.player.setMode('WALK'); g.player.pos.set(${katyAt.x}, 50, ${katyAt.z}); })()`);
    await t.simStep(0.3);
    const walkY = await t.ev(`g.player.pos.y`);
    t.near(walkY, expect.padTop, 0.05, `WALK sank through the pad to ${walkY}, expected ${expect.padTop}`);

    await t.ev(`(() => { g.player.setMode('DRIVE'); g.player.pos.set(${katyAt.x}, 50, ${katyAt.z}); })()`);
    await t.simStep(0.3);
    const driveY = await t.ev(`g.player.pos.y`);
    t.near(driveY, expect.padTop, 0.05, `DRIVE sank through the pad to ${driveY}, expected ${expect.padTop}`);
  });

  await t.check('night lights: two warm lights light the nearest site at night, dark by day, at the site', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);

    // by day the lights are off (the real loop, no manual brands.update)
    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`({ c: g.brands.canopyLight.intensity, s: g.brands.signLight.intensity })`);
    t.near(day.c, 0, 0.001, `canopy light on by day: ${day.c}`);
    t.near(day.s, 0, 0.001, `sign light on by day: ${day.s}`);

    // at night both light up...
    await t.setNight();
    await t.wait(0.5);
    const night = await t.ev(`(() => {
      const cl = g.brands.canopyLight, sl = g.brands.signLight, r = g.brands.live.get('Katy');
      // distance from each light to the store the lights are supposed to sit at
      const dc = Math.hypot(cl.position.x - r.group.position.x, cl.position.z - r.group.position.z);
      const ds = Math.hypot(sl.position.x - r.group.position.x, sl.position.z - r.group.position.z);
      const orig = Math.hypot(cl.position.x, cl.position.z); // guard: not dropped at world origin
      return { ci: cl.intensity, si: sl.intensity, dc, ds, orig };
    })()`);
    t.ok(night.ci > 1 && night.si > 1, `lights never came on at night: ${JSON.stringify(night)}`);
    // regression guard: the lights must sit AT the site, not the world origin
    // (localToWorld on a fresh group reads a stale matrixWorld → origin)
    t.ok(night.dc < 25 && night.ds < 30, `lights not positioned at the site: ${JSON.stringify(night)}`);
    t.ok(night.orig > 100, `lights collapsed to the world origin: ${night.orig.toFixed(1)}`);

    if (process.env.SHOT) {
      // stand back on the road side and look at the lit store (colour read)
      await t.ev(`(() => {
        const r = g.brands.live.get('Katy'), h = r.group.rotation.y;
        const fx = Math.sin(h), fz = Math.cos(h);       // group-front (local +z) in world
        const vx = r.group.position.x + fx * 46, vz = r.group.position.z + fz * 46;
        g.player.pos.set(vx, g.hAt(vx, vz), vz);
        g.player.heading = Math.atan2(-(r.group.position.x - vx), -(r.group.position.z - vz));
        g.player.speed = 0;
      })()`);
      await t.wait(0.5);
      await t.shot('bucky-night-lit');
    }
    await t.setDay();
  });

  // ------------------------------------------------------ H-E-Buddy (Wave 2)
  const heb = await t.ev(`(() => {
    // Houston is #1 by population — guaranteed to be in the 33-site table.
    const site = g.brands.hebSites.find((s) => s.name === 'Houston');
    return site;
  })()`);

  await t.check('H-E-Buddy site table: 33 sites, all clear of airports and downtown footprints', async () => {
    const legality = await t.ev(`(() => {
      const bad = [];
      for (const s of g.brands.hebSites) {
        const city = g.GEO.cities.find((c) => c.name === s.name);
        if (!city) { bad.push(s.name + ':no-city'); continue; }
        if (!g.airportClear(s.x, s.z)) { bad.push(s.name + ':airport'); continue; }
        // downtown clearance — cityRadius isn't exported to __game, so mirror
        // the same formula the placement search itself used
        const R = Math.min(90, 6 + Math.pow(city.pop, 0.38) / 9);
        const d = Math.hypot(s.x - city.x, s.z - city.z);
        if (d < R + 8) bad.push(s.name + ':downtown ' + d.toFixed(1) + '<' + R.toFixed(1));
      }
      return { n: g.brands.hebSites.length, bad };
    })()`);
    t.ok(legality.n === 33, `expected 33 H-E-Buddy sites, got ${legality.n}`);
    t.ok(legality.bad.length === 0, `illegal sites: ${legality.bad.join(', ')}`);
  });

  await t.check('H-E-Buddy streaming sentinel: the real loop spawns/despawns Houston by distance', async () => {
    await t.tp(heb.x, heb.z + 3);
    await t.until(`g.brands.live.has('heb:Houston')`, 8000);
    const near = await t.ev(`(() => {
      const r = g.brands.live.get('heb:Houston');
      return { has: !!r, kids: r.building.children.length, type: r.type };
    })()`);
    t.ok(near.has && near.kids >= 4 && near.type === 'heb', `spawn incomplete: ${JSON.stringify(near)}`);

    const protoBefore = await t.ev(`({
      corral: !!g.brands.corralGeo.attributes, cart: !!g.brands.cartGeo.attributes, pole: !!g.brands.poleGeo.attributes,
    })`);
    t.ok(protoBefore.corral && protoBefore.cart && protoBefore.pole, 'HEB prototypes missing before despawn');

    await t.tp(heb.x + 1200, heb.z);
    await t.until(`!g.brands.live.has('heb:Houston')`, 8000);
    const after = await t.ev(`({
      live: g.brands.live.has('heb:Houston'),
      corral: !!(g.brands.corralGeo.attributes && g.brands.corralGeo.attributes.position),
      cart: !!(g.brands.cartGeo.attributes && g.brands.cartGeo.attributes.position),
      pole: !!(g.brands.poleGeo.attributes && g.brands.poleGeo.attributes.position),
    })`);
    t.ok(!after.live, 'HEB site never despawned');
    t.ok(after.corral && after.cart && after.pole, `HEB shared prototype geometry was disposed: ${JSON.stringify(after)}`);
  });

  await t.check('H-E-Buddy showpiece poly floor: big-box hero beats a heli-body baseline', async () => {
    await t.tp(heb.x, heb.z + 3);
    await t.until(`g.brands.live.has('heb:Houston')`, 8000);
    const tris = await t.ev(`(() => {
      const r = g.brands.live.get('heb:Houston');
      const tri = (m) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
      return tri(r.staticMesh);
    })()`);
    t.ok(tris > 300, `HEB hero not showpiece-tier: ${tris} tris`);
  });

  await t.check('H-E-Buddy sign panel: the "H-E-Buddy" name actually renders (textured, not blank)', async () => {
    await t.tp(heb.x, heb.z + 3);
    await t.until(`g.brands.live.has('heb:Houston')`, 8000);
    const panel = await t.ev(`(() => {
      const r = g.brands.live.get('heb:Houston');
      const p = r.signPanel;
      return { has: !!p, mapped: !!(p && p.material && p.material.map), visible: p ? p.visible : false };
    })()`);
    t.ok(panel.has && panel.mapped, `HEB sign panel missing or blank: ${JSON.stringify(panel)}`);
    t.ok(panel.visible, 'HEB sign panel not visible');
  });

  await t.check('H-E-Buddy grounding: walking/driving over the lot rides the slab top, not raw terrain', async () => {
    await t.tp(heb.x, heb.z + 3);
    await t.until(`g.brands.live.has('heb:Houston')`, 8000);
    const expect = await t.ev(`({ padTop: g.brandGroundYAt(${heb.x}, ${heb.z}), raw: g.hAt(${heb.x}, ${heb.z}) })`);
    t.ok(expect.padTop !== null, "brandGroundYAt returned null standing on H-E-Buddy's own lot");
    t.ok(expect.padTop > expect.raw + 0.3, `pad top barely clears raw terrain: ${JSON.stringify(expect)}`);

    await t.ev(`(() => { g.player.setMode('WALK'); g.player.pos.set(${heb.x}, 50, ${heb.z}); })()`);
    await t.simStep(0.3);
    const walkY = await t.ev(`g.player.pos.y`);
    t.near(walkY, expect.padTop, 0.05, `WALK sank through the lot to ${walkY}, expected ${expect.padTop}`);

    await t.ev(`(() => { g.player.setMode('DRIVE'); g.player.pos.set(${heb.x}, 50, ${heb.z}); })()`);
    await t.simStep(0.3);
    const driveY = await t.ev(`g.player.pos.y`);
    t.near(driveY, expect.padTop, 0.05, `DRIVE sank through the lot to ${driveY}, expected ${expect.padTop}`);
  });

  await t.check('H-E-Buddy night lights: the red sign band lights up at night, dark by day', async () => {
    await t.tp(heb.x, heb.z + 3);
    await t.until(`g.brands.live.has('heb:Houston')`, 8000);

    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`({ s: g.brands.hebSignLight.intensity })`);
    t.near(day.s, 0, 0.001, `HEB sign light on by day: ${day.s}`);

    await t.setNight();
    await t.wait(0.5);
    const night = await t.ev(`(() => {
      const sl = g.brands.hebSignLight, r = g.brands.live.get('heb:Houston');
      const ds = Math.hypot(sl.position.x - r.group.position.x, sl.position.z - r.group.position.z);
      const orig = Math.hypot(sl.position.x, sl.position.z);
      return { si: sl.intensity, ds, orig };
    })()`);
    t.ok(night.si > 1, `HEB sign light never came on at night: ${JSON.stringify(night)}`);
    t.ok(night.ds < 30, `HEB sign light not positioned at the site: ${JSON.stringify(night)}`);
    t.ok(night.orig > 100, `HEB sign light collapsed to the world origin: ${night.orig.toFixed(1)}`);

    if (process.env.SHOT) {
      await t.ev(`(() => {
        const r = g.brands.live.get('heb:Houston'), h = r.group.rotation.y;
        const fx = Math.sin(h), fz = Math.cos(h);
        const vx = r.group.position.x + fx * 40, vz = r.group.position.z + fz * 40;
        g.player.pos.set(vx, g.hAt(vx, vz), vz);
        g.player.heading = Math.atan2(-(r.group.position.x - vx), -(r.group.position.z - vz));
        g.player.speed = 0;
      })()`);
      await t.wait(0.5);
      await t.shot('heb-night-lit');
    }
    await t.setDay();
  });

  // -------------------------------------------- Lone Star Compute (Wave 3)
  // Abilene = the real "Stargate" flagship, first in LSC_SITES.
  const lscAt = await t.ev(`({
    x: (-99.88 + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100,
    z: -(32.52 - 31) * 111320 / 100,
  })`);

  await t.check('LSC streaming sentinel: the real loop spawns/despawns Abilene, shared protos survive', async () => {
    await t.tp(lscAt.x, lscAt.z + 3);
    await t.until(`g.brands.live.has('lsc:Abilene')`, 8000);
    const near = await t.ev(`(() => {
      const r = g.brands.live.get('lsc:Abilene');
      return { has: !!r, kids: r.building.children.length, type: r.type };
    })()`);
    t.ok(near.has && near.kids >= 4 && near.type === 'lsc', `spawn incomplete: ${JSON.stringify(near)}`);

    const protoBefore = await t.ev(`({
      cool: !!g.brands.coolingGeo.attributes, drum: !!g.brands.drumGeo.attributes, pylon: !!g.brands.pylonGeo.attributes,
    })`);
    t.ok(protoBefore.cool && protoBefore.drum && protoBefore.pylon, 'LSC prototypes missing before despawn');

    await t.tp(lscAt.x + 1500, lscAt.z);
    await t.until(`!g.brands.live.has('lsc:Abilene')`, 8000);
    const after = await t.ev(`({
      live: g.brands.live.has('lsc:Abilene'),
      cool: !!(g.brands.coolingGeo.attributes && g.brands.coolingGeo.attributes.position),
      drum: !!(g.brands.drumGeo.attributes && g.brands.drumGeo.attributes.position),
      pylon: !!(g.brands.pylonGeo.attributes && g.brands.pylonGeo.attributes.position),
    })`);
    t.ok(!after.live, 'LSC site never despawned');
    t.ok(after.cool && after.drum && after.pylon, `LSC shared prototype geometry was disposed: ${JSON.stringify(after)}`);
  });

  await t.check('LSC showpiece poly floor: the datacenter hero beats a heli-body baseline', async () => {
    await t.tp(lscAt.x, lscAt.z + 3);
    await t.until(`g.brands.live.has('lsc:Abilene')`, 8000);
    const tris = await t.ev(`(() => {
      const r = g.brands.live.get('lsc:Abilene');
      const tri = (m) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
      return tri(r.staticMesh);
    })()`);
    t.ok(tris > 400, `LSC hero not showpiece-tier: ${tris} tris`);
  });

  await t.check('LSC placement legality: no datacenter sits on an airport field', async () => {
    const bad = await t.ev(`(() => {
      const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];
      const coords = [
        ['Abilene',32.52,-99.88],['Corsicana',32.05,-96.50],['San Antonio',29.42,-98.65],
        ['Sweetwater',32.47,-100.41],['Temple',31.08,-97.44],['Amarillo',35.30,-101.70],
        ['Red Oak',32.52,-96.80],['Denton',33.24,-97.17],
      ];
      return coords.filter(([n, la, lo]) => { const [x, z] = LL(la, lo); return !g.airportClear(x, z); }).map((c) => c[0]);
    })()`);
    t.ok(bad.length === 0, `LSC sites on an airport: ${bad.join(', ')}`);
  });

  await t.check('LSC grounding: walking/driving over the lot rides the slab top, not raw terrain', async () => {
    await t.tp(lscAt.x, lscAt.z + 3);
    await t.until(`g.brands.live.has('lsc:Abilene')`, 8000);
    const expect = await t.ev(`({ padTop: g.brandGroundYAt(${lscAt.x}, ${lscAt.z}), raw: g.hAt(${lscAt.x}, ${lscAt.z}) })`);
    t.ok(expect.padTop !== null, "brandGroundYAt returned null standing on Lone Star Compute's own lot");
    t.ok(expect.padTop > expect.raw + 0.3, `pad top barely clears raw terrain: ${JSON.stringify(expect)}`);

    await t.ev(`(() => { g.player.setMode('WALK'); g.player.pos.set(${lscAt.x}, 50, ${lscAt.z}); })()`);
    await t.simStep(0.3);
    const walkY = await t.ev(`g.player.pos.y`);
    t.near(walkY, expect.padTop, 0.05, `WALK sank through the lot to ${walkY}, expected ${expect.padTop}`);

    await t.ev(`(() => { g.player.setMode('DRIVE'); g.player.pos.set(${lscAt.x}, 50, ${lscAt.z}); })()`);
    await t.simStep(0.3);
    const driveY = await t.ev(`g.player.pos.y`);
    t.near(driveY, expect.padTop, 0.05, `DRIVE sank through the lot to ${driveY}, expected ${expect.padTop}`);
  });

  await t.check('datacenter hum: gain rises as distance shrinks, silent out of range (heliTarget pattern)', async () => {
    const r = await t.ev(`(() => {
      g.audio.datacenterHum(10); const gNear = g.audio.datacenterTarget;
      g.audio.datacenterHum(150); const gFar = g.audio.datacenterTarget;
      g.audio.datacenterHum(Infinity); const gNone = g.audio.datacenterTarget;
      return { gNear, gFar, gNone };
    })()`);
    t.ok(r.gNear > r.gFar, `hum gain didn't fall off with distance (near ${r.gNear}, far ${r.gFar})`);
    t.ok(r.gNear > 0, `near hum should be audible, got ${r.gNear}`);
    t.ok(r.gNone === 0, `hum out of range should be silent, got ${r.gNone}`);
  });

  await t.check('datacenter hum wiring: the real loop drives the hum via brands.onHum → audio', async () => {
    // real-loop sentinel — a missing/typo'd brands.onHum in main.js can't hide.
    await t.tp(lscAt.x, lscAt.z + 3);
    await t.until(`g.brands.live.has('lsc:Abilene')`, 8000);
    await t.wait(0.4); // let the loop call onHum with the nearby site
    const on = await t.ev(`({ wired: !!g.brands.onHum, target: g.audio.datacenterTarget })`);
    t.ok(on.wired, 'brands.onHum never wired in main.js');
    t.ok(on.target > 0, `hum never rose standing on a datacenter: ${on.target}`);

    await t.tp(lscAt.x + 1500, lscAt.z);
    await t.until(`!g.brands.live.has('lsc:Abilene')`, 8000);
    await t.wait(0.4);
    const off = await t.ev(`g.audio.datacenterTarget`);
    t.near(off, 0, 0.001, `hum never faded after leaving every datacenter: ${off}`);
  });

  await t.check('LSC night glow: cold cooling vents are EMISSIVE (gated on night), ~0 by day', async () => {
    await t.tp(lscAt.x, lscAt.z + 3);
    await t.until(`g.brands.live.has('lsc:Abilene')`, 8000);

    // the vents use the shared emissive material — NOT a PointLight
    const wired = await t.ev(`(() => {
      const r = g.brands.live.get('lsc:Abilene');
      return { same: r.vents.material === g.brands.ventMat, emissive: !!r.vents.material.emissive };
    })()`);
    t.ok(wired.same && wired.emissive, `LSC vents not on the shared emissive material: ${JSON.stringify(wired)}`);

    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`g.brands.ventMat.emissiveIntensity`);
    t.near(day, 0, 0.001, `cooling vents glow by day: ${day}`);

    await t.setNight();
    await t.wait(0.5);
    const night = await t.ev(`g.brands.ventMat.emissiveIntensity`);
    t.ok(night > 0.2, `cooling vents never lit at night: ${night}`);

    if (process.env.SHOT) {
      // stand back on the road side at night — the read is "does it glow COLD,
      // not white?" (this track's recurring emissive trap)
      await t.ev(`(() => {
        const r = g.brands.live.get('lsc:Abilene'), h = r.group.rotation.y;
        const fx = Math.sin(h), fz = Math.cos(h);
        const vx = r.group.position.x + fx * 60, vz = r.group.position.z + fz * 60;
        g.player.pos.set(vx, g.hAt(vx, vz) + 4, vz);
        g.player.heading = Math.atan2(-(r.group.position.x - vx), -(r.group.position.z - vz));
        g.player.speed = 0;
      })()`);
      await t.wait(0.5);
      await t.shot('lonestar-compute-night');
    }
    await t.setDay();
  });

  // ---------------------------------------- player-controlled brand size
  await t.check('brand size: setScale rebuilds the hero at the new scale, clamps, and persists', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);

    await t.ev(`g.brands.setScale(0.6)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
    const shrunk = await t.ev(`({ scale: g.brands.live.get('Katy').building.scale.x, stored: localStorage.getItem('lonestar-brand-scale') })`);
    t.near(shrunk.scale, 0.6, 0.001, `building sub-group not scaled: ${shrunk.scale}`);
    t.ok(shrunk.stored === '0.6', `scale not persisted to localStorage: ${shrunk.stored}`);

    const clampHi = await t.ev(`g.brands.setScale(5)`);
    const clampLo = await t.ev(`g.brands.setScale(-5)`);
    t.ok(clampHi.endsWith('125%'), `scale not clamped to the max: ${clampHi}`);
    t.ok(clampLo.endsWith('50%'), `scale not clamped to the min: ${clampLo}`);

    await t.ev(`g.brands.setScale(1)`); // reset for the rest of the suite
    await t.until(`g.brands.live.has('Katy')`, 2000);
  });

  await t.check('brand size: groundYAt footprint + pad height scale with the slab', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const h = await t.ev(`g.brands.live.get('Katy').group.rotation.y`);
    // ~15 local units off-axis (toWorld's convention): inside the full pad
    // (BUCKY_FOOT.hx = 17) but outside a half-scale pad (hx*0.5 = 8.5).
    const ex = katyAt.x + 15 * Math.cos(h), ez = katyAt.z - 15 * Math.sin(h);

    await t.ev(`g.brands.setScale(1)`);
    const r1 = await t.ev(`g.brandGroundYAt(${katyAt.x}, ${katyAt.z})`);
    const edgeFull = await t.ev(`g.brandGroundYAt(${ex}, ${ez})`);

    await t.ev(`g.brands.setScale(0.5)`);
    const r2 = await t.ev(`g.brandGroundYAt(${katyAt.x}, ${katyAt.z})`);
    const edgeHalf = await t.ev(`g.brandGroundYAt(${ex}, ${ez})`);

    t.ok(r1 !== null && r2 !== null, `pad center should stay on the pad at both scales: ${r1}, ${r2}`);
    // PAD_TOP (0.42) is the only term that changes between the two reads —
    // padY (max terrain under the lot) doesn't move.
    t.near(r1 - r2, 0.42 * 0.5, 0.02, `pad top didn't shrink proportionally: full ${r1}, half ${r2}`);
    t.ok(edgeFull !== null, `edge point should be inside the full-size pad, got ${edgeFull}`);
    t.ok(edgeHalf === null, `edge point should fall outside the half-size pad, got ${edgeHalf}`);

    await t.ev(`g.brands.setScale(1)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
  });

  await t.check('brand size: approach billboards resize in place, never drift off their ground point', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const full = await t.ev(`g.brands.live.get('Katy').boards.map((p) => ({ wx: p.wx, wz: p.wz }))`);

    await t.ev(`g.brands.setScale(0.5)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
    const half = await t.ev(`g.brands.live.get('Katy').boards.map((p) => ({ wx: p.wx, wz: p.wz, scale: p.mesh.scale.x }))`);

    t.ok(half.length === full.length && half.length >= 3, `billboard count changed across a rescale: ${full.length} -> ${half.length}`);
    t.near(half[0].scale, 0.5, 0.01, `billboard mesh didn't pick up the new scale: ${half[0].scale}`);
    for (let i = 0; i < full.length; i++) {
      t.near(half[i].wx, full[i].wx, 0.01, `billboard ${i} drifted in x when the store rescaled`);
      t.near(half[i].wz, full[i].wz, 0.01, `billboard ${i} drifted in z when the store rescaled`);
    }

    await t.ev(`g.brands.setScale(1)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
  });

  await t.check('brand size: night-light anchors track the rescaled sign/canopy, not the unscaled offset', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    await t.setNight();
    await t.wait(0.5);
    const full = await t.ev(`g.brands.live.get('Katy').lightAt.sign`);

    await t.ev(`g.brands.setScale(0.5)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
    await t.wait(0.5); // let update() retarget the persistent lights to the respawned site
    const half = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      const dc = Math.hypot(g.brands.canopyLight.position.x - r.lightAt.canopy[0], g.brands.canopyLight.position.z - r.lightAt.canopy[2]);
      return { sign: r.lightAt.sign, dc };
    })()`);

    // the sign anchor sits 15.5 local units out from pad center — at half
    // scale it should sit roughly half as far from the pad, not unchanged.
    const fullDist = Math.hypot(full[0] - katyAt.x, full[2] - katyAt.z);
    const halfDist = Math.hypot(half.sign[0] - katyAt.x, half.sign[2] - katyAt.z);
    t.near(halfDist, fullDist * 0.5, 0.5, `sign light anchor didn't scale toward the pad: full ${fullDist.toFixed(2)}, half ${halfDist.toFixed(2)}`);
    t.ok(half.dc < 5, `canopy light not retargeted to the rescaled anchor: ${half.dc.toFixed(2)}`);

    await t.setDay();
    await t.ev(`g.brands.setScale(1)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
  });

  await t.check('brand size: shrunk skirt still drapes to the lot min on the steepest real site', async () => {
    // El Paso's H-E-Buddy lot is the steepest real relief in the whole
    // table (~1.78u, found via a one-off scan) — the site most likely to
    // expose a skirt that floats once the building group is scaled down.
    const site = await t.ev(`g.brands.hebSites.find((s) => s.name === 'El Paso')`);
    await t.ev(`g.brands.setScale(0.5)`);
    await t.tp(site.x, site.z + 3);
    await t.until(`g.brands.live.has('heb:El Paso')`, 8000);
    const g0 = await t.ev(`(() => {
      const r = g.brands.live.get('heb:El Paso');
      r.staticMesh.geometry.computeBoundingBox();
      const range = (x, z) => { let mn = Infinity;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) mn = Math.min(mn, g.hAt(x + i * 20, z + j * 20));
        return mn; };
      return {
        mn: range(r.group.position.x, r.group.position.z),
        baseWorld: r.group.position.y + r.building.scale.y * r.staticMesh.geometry.boundingBox.min.y,
      };
    })()`);
    t.ok(g0.baseWorld <= g0.mn + 1e-3, `shrunk skirt floats above the lot min: base ${g0.baseWorld.toFixed(3)} vs min ${g0.mn.toFixed(3)}`);

    await t.ev(`g.brands.setScale(1)`);
    await t.until(`g.brands.live.has('heb:El Paso')`, 2000);
  });
}
