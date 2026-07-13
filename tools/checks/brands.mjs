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
      return { has: !!r, y: r.group.position.y, kids: r.group.children.length };
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
      return { has: !!r, kids: r.group.children.length, type: r.type };
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
    t.ok(tris > 350, `HEB hero not showpiece-tier: ${tris} tris`);
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
}
