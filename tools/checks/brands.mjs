// Texas Brands (brands.js) — Wave 1: Bucky's travel centers. Assert numbers,
// not pixels: real-loop streaming, showpiece poly floor, placement legality,
// approach-billboard road-hugging, and night-gated emissive signage (~0 by
// day). The streaming check drives the REAL loop (no manual brands.update)
// so broken main.js wiring can't hide behind it. One SHOT of the silhouette.

export default async function brands(t) {
  // Katy sits on I-10 (motorway) — ideal for the spawn + billboard road-hug.
  // resolved (post-legalize) pad center — the raw OSM node sits ~20u away, off the slab
  const katyAt = await t.ev(`(() => {
    const s = g.brands.buckySites.find((s) => s.name === 'Katy');
    return { x: s.at[0], z: s.at[1] };
  })()`);

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
      // sample the sign's canvas: NEON idiom — a dark board carrying bright
      // yellow wordmark pixels (the texture doubles as the emissiveMap, so
      // bright pixels ARE the night glow; a lit-surface look washed out twice)
      let dark = 0, glyph = 0, n = 0;
      const img = p && p.material.map && p.material.map.image;
      if (img && img.getContext) {
        const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
        for (let i = 0; i < d.length; i += 32) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (lum < 40) dark++;
          if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 120) glyph++;
          n++;
        }
      }
      return { has: !!p, mapped: !!(p && p.material && p.material.map), visible: p ? p.visible : false,
        neonWired: !!(p && p.material.emissiveMap && p.material.emissiveMap === p.material.map),
        darkFrac: n ? dark / n : 0, glyphFrac: n ? glyph / n : 0 };
    })()`);
    t.ok(panel.has && panel.mapped, `Bucky's sign panel missing or blank: ${JSON.stringify(panel)}`);
    t.ok(panel.visible, "Bucky's sign panel not visible");
    t.ok(panel.neonWired, 'sign texture is not wired as its own emissiveMap (neon idiom)');
    t.ok(panel.darkFrac > 0.5, `sign board is not dark: ${(panel.darkFrac * 100).toFixed(0)}% dark`);
    t.ok(panel.glyphFrac > 0.02, `no bright wordmark pixels on the board: ${(panel.glyphFrac * 100).toFixed(1)}%`);
  });

  await t.check('placement legality: no brand site sits on an airport field', async () => {
    // scan every RESOLVED site coord (post-legalize) through the pure exclusion query
    const bad = await t.ev(`(() => {
      const sites = [
        ...g.brands.buckySites.map((s) => ['B:' + s.name, s.at[0], s.at[1]]),
        ...g.brands.hebSites.map((s) => ['H:' + s.name, s.x, s.z]),
        ...g.brands.lscSites.map((s) => ['L:' + s.name, s.at[0], s.at[1]]),
      ];
      return sites.filter(([n, x, z]) => !g.airportClear(x, z)).map((c) => c[0]);
    })()`);
    t.ok(bad.length === 0, `sites on an airport: ${bad.join(', ')}`);
  });

  await t.check('placement legality: every brand site clears road ribbons, water, and the border', async () => {
    // The legalize()/spotClear gate (brands.js) must hold for all 56 resolved
    // sites: no slab over a ribbon at reference scale 0.5 (street tier judged
    // at the 0.15 default reach), nothing wet, nothing out of state. Reaches
    // mirror BUCKY/HEB/LSC_FOOT.z1; the 0.9 margin sits just under the gate's
    // 1.0 so a boundary site can't flake the check.
    const bad = await t.ev(`(() => {
      const HALF = { motorway: 1.6, trunk: 1.0, primary: 0.75, street: 0.55 };
      const judge = (n, x, z, reach) => {
        const r = g.nearestRoad(x, z, 30);
        if (r && r.dist < HALF[r.type] + reach * (r.type === 'street' ? 0.15 : 0.5) + 0.9)
          return n + ' on ' + r.type + ' d=' + r.dist.toFixed(1);
        if (g.waterAt(x, z)) return n + ' in ' + g.waterAt(x, z);
        if (!g.inTexas(x, z)) return n + ' out of state';
        return null;
      };
      const out = [];
      for (const s of g.brands.buckySites) out.push(judge('B:' + s.name, s.at[0], s.at[1], 20.5));
      for (const s of g.brands.hebSites) out.push(judge('H:' + s.name, s.x, s.z, 12));
      for (const s of g.brands.lscSites) out.push(judge('L:' + s.name, s.at[0], s.at[1], 25));
      return out.filter(Boolean);
    })()`);
    t.ok(bad.length === 0, `illegal sites: ${bad.join('; ')}`);
  });

  await t.check("placement legality: New Braunfels Bucky's keeps its beaver-landmark standoff", async () => {
    // the store's OSM node was picked ~14u off the beaver-kind collectible;
    // the legalize nudge must not slide it back onto the landmark
    const d = await t.ev(`(() => {
      const s = g.brands.buckySites.find((s) => s.name === 'New Braunfels');
      const lm = g.LANDMARKS.find((l) => l.kind === 'beaver');
      return Math.hypot(s.at[0] - lm.at[0], s.at[1] - lm.at[1]);
    })()`);
    t.ok(d >= 10, `New Braunfels site slid onto the beaver landmark: ${d.toFixed(1)}u`);
  });

  await t.check('placement legality: nudged landmarks stand clear of their road/river ribbons', async () => {
    // the five 2026-07-16 placement-audit nudges (gameplay.js) — assert the
    // live LANDMARKS table, so a coord revert reintroducing the straddle fails here
    const bad = await t.ev(`(() => {
      const HALF = { motorway: 1.6, trunk: 1.0, primary: 0.75, street: 0.55 };
      const names = ['Cadillac Ranch', 'Presidio La Bahía', 'Eiffel Tower of Paris, TX', 'Paisano Pete', 'LBJ Ranch'];
      return names.map((n) => {
        const lm = g.LANDMARKS.find((l) => l.name === n);
        if (!lm) return n + ' missing';
        const [x, z] = lm.at;
        const r = g.nearestRoad(x, z, 20);
        if (r && r.dist < HALF[r.type] + 2.2) return n + ' on ' + r.type + ' d=' + r.dist.toFixed(1);
        if (g.waterAt(x, z)) return n + ' in ' + g.waterAt(x, z);
        return null;
      }).filter(Boolean);
    })()`);
    t.ok(bad.length === 0, `landmarks still straddling: ${bad.join('; ')}`);
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

  await t.check('approach billboards: re-snapped boards stay legal on a CURVED road (Luling)', async () => {
    // Luling's I-10 bend put pre-fix tangent-extrapolated boards on the
    // pavement and up to 20u into the fields (2026-07-16 audit) — every
    // surviving board must hug the freeway shoulder, dry and in-state
    const at = await t.ev(`g.brands.buckySites.find((s) => s.name === 'Luling').at`);
    await t.tp(at[0], at[1] + 3);
    await t.until(`g.brands.live.has('Luling')`, 8000);
    const b = await t.ev(`(() => {
      const HALF = { motorway: 1.6, trunk: 1.0, primary: 0.75, street: 0.55 };
      const r = g.brands.live.get('Luling');
      return r.boards.map((p) => {
        const hug = g.nearestRoad(p.wx, p.wz, 30, (ty) => ty === 'motorway' || ty === 'trunk');
        const any = g.nearestRoad(p.wx, p.wz, 6);
        return { hug: hug ? hug.dist : 999, onPavement: any ? any.dist < HALF[any.type] + 0.4 : false,
          wet: !!g.waterAt(p.wx, p.wz), out: !g.inTexas(p.wx, p.wz) };
      });
    })()`);
    t.ok(b.length >= 2, `the curve dropped too many boards: ${b.length}`);
    for (const p of b) {
      t.ok(p.hug < 4, `a board strayed off the freeway: ${p.hug.toFixed(2)}u`);
      t.ok(!p.onPavement, 'a board stands on the pavement');
      t.ok(!p.wet && !p.out, 'a board is wet or out of state');
    }
  });

  await t.check('grounding: pad at MAX terrain height + foundation skirt reaches below the lot MIN', async () => {
    // relief over the same ±20 lot grid brands.js samples; pick the steepest site
    const pick = await t.ev(`(() => {
      // resolved (post-legalize) coords — padY is computed where the slab actually sits
      const range = (x, z) => { let mn = Infinity, mx = -Infinity;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const h = g.hAt(x + i * 20, z + j * 20); if (h < mn) mn = h; if (h > mx) mx = h; }
        return { mn, mx }; };
      let best = null;
      for (const s of g.brands.buckySites) {
        const [x, z] = s.at; const { mn, mx } = range(x, z);
        if (!best || mx - mn > best.relief) best = { n: s.name, x, z, relief: mx - mn, mn, mx };
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
    await t.ev(`g.brands.setScale(1)`); // PAD_TOP margin below assumes unscaled geometry
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

  await t.check('brand size hint: HUD hint shows near a site even shrunk small, hides far away', async () => {
    // shrunk to the new first-load default, at an ugly mid-approach offset
    // (not the pad center) — proving the hint is keyed off the site's real
    // location, not the now-tiny scaled footprint that motivated brandNear.
    await t.ev(`g.brands.setScale(0.15)`);
    await t.tp(katyAt.x + 42, katyAt.z - 17);
    await t.until(`g.hud.els.brandSize.style.display === 'block'`, 8000);

    await t.tp(katyAt.x + 400, katyAt.z + 400);
    await t.until(`g.hud.els.brandSize.style.display === 'none'`, 8000);

    await t.ev(`g.brands.setScale(1)`); // reset for the rest of the suite
  });

  await t.check('brand size hint: suppressed in FLY mode even in range', async () => {
    await t.tp(katyAt.x + 42, katyAt.z - 17, 'FLY');
    await t.wait(0.2);
    t.ok(await t.ev(`g.hud.els.brandSize.style.display`) === 'none', 'brand size hint visible while flying');
    await t.tp(katyAt.x + 42, katyAt.z - 17, 'WALK'); // back to ground for the rest of the suite
  });

  await t.check('night lights: two warm lights light the nearest site at night, dark by day, at the site', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);

    // by day the lights are off (the real loop, no manual brands.update)
    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`({ c: g.brands.canopyLight.intensity, s: g.brands.signLight.intensity, neon: g.brands.buckySignMat.emissiveIntensity })`);
    t.near(day.c, 0, 0.001, `canopy light on by day: ${day.c}`);
    t.near(day.s, 0, 0.001, `sign light on by day: ${day.s}`);
    t.near(day.neon, 0, 0.001, `wordmark neon glowing by day: ${day.neon}`);

    // at night both light up...
    await t.setNight();
    await t.wait(0.5);
    const night = await t.ev(`(() => {
      const cl = g.brands.canopyLight, sl = g.brands.signLight, r = g.brands.live.get('Katy');
      // distance from each light to the store the lights are supposed to sit at
      const dc = Math.hypot(cl.position.x - r.group.position.x, cl.position.z - r.group.position.z);
      const ds = Math.hypot(sl.position.x - r.group.position.x, sl.position.z - r.group.position.z);
      const orig = Math.hypot(cl.position.x, cl.position.z); // guard: not dropped at world origin
      return { ci: cl.intensity, si: sl.intensity, dc, ds, orig, neon: g.brands.buckySignMat.emissiveIntensity };
    })()`);
    t.ok(night.ci > 1 && night.si > 1, `lights never came on at night: ${JSON.stringify(night)}`);
    t.ok(night.neon > 0.5, `wordmark neon never lit at night: ${night.neon}`);
    // the warm pool must stay WEAKER than the canopy so it can't wash the neon
    t.ok(night.si < night.ci / 2, `sign light back at neon-fighting strength: sign ${night.si}, canopy ${night.ci}`);
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
      // hover in front of the pylon panel — the wordmark-legibility read
      await t.ev(`(() => {
        const r = g.brands.live.get('Katy'), h = r.group.rotation.y, s = g.brands.scale;
        const sx = r.group.position.x + (15.5 * Math.cos(h) + 18.5 * Math.sin(h)) * s;
        const sz = r.group.position.z + (-15.5 * Math.sin(h) + 18.5 * Math.cos(h)) * s;
        const sy = r.group.position.y + 13 * s;
        const back = 8 * Math.max(s, 0.4);
        const vx = sx + Math.sin(h) * back, vz = sz + Math.cos(h) * back;
        g.player.setMode('FLY');
        g.player.pos.set(vx, sy, vz);
        g.player.heading = Math.atan2(-(sx - vx), -(sz - vz));
        g.player.speed = 0;
      })()`);
      await t.wait(0.4);
      await t.shot('bucky-sign-closeup');
      await t.ev(`g.player.setMode('DRIVE')`);
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
    await t.ev(`g.brands.setScale(1)`); // PAD_TOP margin below assumes unscaled geometry
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
  // resolved (post-legalize) lot center, same reason as katyAt above
  const lscAt = await t.ev(`(() => {
    const s = g.brands.lscSites.find((s) => s.name === 'Abilene');
    return { x: s.at[0], z: s.at[1] };
  })()`);

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

  // -------------------------------- Datacenter sign (DATACENTER_SIGN_SPEC.md — rolled out to all 8 sites)
  const lscSAAt = await t.ev(`({
    x: (-98.65 + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100,
    z: -(29.42 - 31) * 111320 / 100,
  })`);

  await t.check('datacenter sign: LSC_SITES table is fully signed, 8/8, no duplicate tagline/fact copy', async () => {
    const info = await t.ev(`(() => {
      const names = [...g.brands.lscByName.keys()];
      const signs = names.map((n) => g.brands.lscByName.get(n).sign).filter(Boolean);
      return {
        total: names.length, signed: signs.length, mats: g.brands.lscSignMats.size,
        taglines: new Set(signs.map((s) => s.tagline)).size,
        facts: new Set(signs.map((s) => s.fact)).size,
      };
    })()`);
    t.ok(info.total === 8, `expected 8 LSC sites, found ${info.total}`);
    t.ok(info.signed === 8, `not every LSC site has a sign: ${info.signed}/8`);
    t.ok(info.mats === 8, `lscSignMats missing an entry for a signed site: ${info.mats}/8`);
    t.ok(info.taglines === 8 && info.facts === 8, `duplicate tagline/fact copy across sites: ${JSON.stringify(info)}`);
  });

  await t.check('datacenter sign: San Antonio spawns a lit sign panel using its own per-site material', async () => {
    await t.tp(lscSAAt.x, lscSAAt.z + 3);
    await t.until(`g.brands.live.has('lsc:San Antonio')`, 8000);
    const rec = await t.ev(`(() => {
      const r = g.brands.live.get('lsc:San Antonio');
      const m = r.signMesh.children.find((c) => c.geometry === g.brands.lscSignGeo);
      return {
        hasSign: !!r.signMesh,
        panelMat: m.material === g.brands.lscSignMats.get('San Antonio'),
        hasMap: !!m.material.map, hasEmissiveMap: !!m.material.emissiveMap,
      };
    })()`);
    t.ok(rec.hasSign, 'San Antonio LSC site never built a signMesh');
    t.ok(rec.panelMat, "sign panel isn't using its per-site cached material");
    t.ok(rec.hasMap && rec.hasEmissiveMap, `sign material missing map/emissiveMap: ${JSON.stringify(rec)}`);
  });

  await t.check('datacenter sign: Abilene spawns its OWN distinct sign panel (rollout, not a San-Antonio-only special case)', async () => {
    await t.tp(lscAt.x, lscAt.z + 3);
    await t.until(`g.brands.live.has('lsc:Abilene')`, 8000);
    const rec = await t.ev(`(() => {
      const r = g.brands.live.get('lsc:Abilene');
      const m = r.signMesh.children.find((c) => c.geometry === g.brands.lscSignGeo);
      return {
        hasSign: !!r.signMesh,
        panelMat: m.material === g.brands.lscSignMats.get('Abilene'),
        distinctFromSA: m.material !== g.brands.lscSignMats.get('San Antonio'),
      };
    })()`);
    t.ok(rec.hasSign, 'Abilene never built a signMesh after the rollout');
    t.ok(rec.panelMat, "Abilene's sign panel isn't using ITS OWN per-site material");
    t.ok(rec.distinctFromSA, "Abilene's sign is reusing San Antonio's material — per-site text wouldn't read correctly");
  });

  await t.check("datacenter sign night-gate: emissiveMap glow ~0 by day, lit at night (own material, not ventMat)", async () => {
    await t.tp(lscSAAt.x, lscSAAt.z + 3);
    await t.until(`g.brands.live.has('lsc:San Antonio')`, 8000);

    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`g.brands.lscSignMats.get('San Antonio').emissiveIntensity`);
    t.near(day, 0, 0.001, `sign glows by day: ${day}`);

    await t.setNight();
    await t.wait(0.5);
    const night = await t.ev(`g.brands.lscSignMats.get('San Antonio').emissiveIntensity`);
    t.ok(night > 0.2, `sign never lit at night: ${night}`);
    await t.setDay();
  });

  // The plaque triggers off the SIGN's world position, not the pad center —
  // hypot(11, 26.1) ≈ 28.3 units apart, so a center-based query missed the
  // sign entirely (the exact "tested at a convenient radius, not the natural
  // one" trap CLAUDE.md warns about). Fetch the real anchor from `signAt`
  // (computed at spawn from heading + SCALE) instead of assuming a fixed offset.
  const lscSignAt = await (async () => {
    await t.tp(lscSAAt.x, lscSAAt.z + 3);
    await t.until(`g.brands.live.has('lsc:San Antonio')`, 8000);
    return t.ev(`(() => { const [x, z] = g.brands.live.get('lsc:San Antonio').signAt; return { x, z }; })()`);
  })();

  await t.check('datacenter plaque: lscNear resolves San Antonio at the SIGN (not the pad center), null out of range', async () => {
    await t.tp(lscSignAt.x, lscSignAt.z + 3);
    const near = await t.ev(`g.brands.lscNear(g.player.pos, 28)?.name`);
    t.ok(near === 'San Antonio', `lscNear didn't find San Antonio near its own sign: ${near}`);

    await t.tp(lscSAAt.x, lscSAAt.z + 3); // the PAD CENTER, ~28.3 units from the sign — must now read as out of range
    const atCenter = await t.ev(`g.brands.lscNear(g.player.pos, 28)`);
    t.ok(atCenter === null, `lscNear still keyed off the pad center, not the sign: ${JSON.stringify(atCenter)}`);

    await t.tp(lscSignAt.x + 500, lscSignAt.z);
    const far = await t.ev(`g.brands.lscNear(g.player.pos, 28)`);
    t.ok(far === null, `lscNear returned a site out of range: ${JSON.stringify(far)}`);
  });

  await t.check('datacenter plaque: E opens the real-facts dialog with the right hint, E again closes it', async () => {
    await t.tp(lscSignAt.x, lscSignAt.z + 3, 'WALK');
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the datacenter sign', `expected the datacenter-sign hint, got "${hint}"`);

    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      sub: g.hud.els.dialog.querySelector('.npc-sub').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
      shown: g.hud.els.dialog.style.display,
    })`);
    t.ok(dlg.name.includes('San Antonio'), `dialog name didn't name the site: "${dlg.name}"`);
    t.ok(dlg.sub.includes('AI-READY CAMPUS'), `dialog sub missing the tagline: "${dlg.sub}"`);
    t.ok(dlg.text.includes('334 MW') && dlg.text.includes('gallons'), `dialog text missing the sourced facts: "${dlg.text}"`);
    t.ok(dlg.shown === 'block', 'dialog not shown after E');

    await t.key('KeyE');
    const closed = await t.ev('g.hud.els.dialog.style.display');
    t.ok(closed === 'none', 'second E press did not close the plaque');
  });

  await t.check('datacenter plaque: switching straight to a landmark plaque replaces it, walking off closes it', async () => {
    await t.tp(lscSignAt.x, lscSignAt.z + 3, 'WALK');
    await t.key('KeyE');
    const lscName = await t.ev(`g.hud.els.dialog.querySelector('.npc-name').textContent`);
    t.ok(lscName.includes('San Antonio'), `expected the LSC plaque open first, got "${lscName}"`);

    // Big Bend — remote enough that no city's proximity-spawned townsfolk (or
    // the 12 named characters) shadow the landmark's own E-interact.
    const bigBend = await t.ev(`(() => {
      const g2 = g.gameplay.landmarkGroup.children.find((c) => c.userData.lm.name === 'Big Bend');
      return { x: g2.position.x, z: g2.position.z };
    })()`);
    await t.tp(bigBend.x, bigBend.z + 3, 'WALK');
    await t.key('KeyE');
    const switched = await t.ev(`g.hud.els.dialog.querySelector('.npc-name').textContent`);
    t.ok(switched.includes('Big Bend'), `didn't switch straight to the landmark plaque, got "${switched}"`);

    await t.tp(bigBend.x + 500, bigBend.z, 'WALK');
    await t.wait(0.3);
    const closed = await t.ev('g.hud.els.dialog.style.display');
    t.ok(closed === 'none', 'plaque stayed open after walking away from both sources');
  });

  // ---------------------------------------- player-controlled brand size
  await t.check('brand size: setScale rebuilds the hero at the new scale, clamps, and persists', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);

    await t.ev(`g.brands.setScale(0.6)`);
    await t.until(`g.brands.live.has('Katy')`, 2000);
    const shrunk = await t.ev(`({ scale: g.brands.live.get('Katy').building.scale.x, stored: localStorage.getItem('lonestar-brand-scale:1') })`);
    t.near(shrunk.scale, 0.6, 0.001, `building sub-group not scaled: ${shrunk.scale}`);
    t.ok(shrunk.stored === '0.6', `scale not persisted to localStorage: ${shrunk.stored}`);

    const clampHi = await t.ev(`g.brands.setScale(5)`);
    const clampLo = await t.ev(`g.brands.setScale(-5)`);
    t.ok(clampHi.endsWith('125%'), `scale not clamped to the max: ${clampHi}`);
    t.ok(clampLo.endsWith('10%'), `scale not clamped to the min: ${clampLo}`);

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
    // Test at the 0.1x FLOOR, not some mid-range value: that's where a
    // cap-before-divide ordering bug in the skirt formula would actually
    // clip the needed depth and reintroduce the float (caught once already).
    const site = await t.ev(`g.brands.hebSites.find((s) => s.name === 'El Paso')`);
    await t.ev(`g.brands.setScale(0.1)`);
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
