// Shoulder & Shelf, wave 5 — The Shelf: the Tidelands line (state-water
// predicate, big-map dashed overlay, vertex-colored blue-water band), the
// Tidelands buoy + Far Rig plaques (maritime brass, NOT landmarks — the
// counters stay sacred), night-gated rig flares / shrimper work-lights /
// buoy lamp, the 1554 treasure light legend (new-moon nights off the
// Mansfield Cut, always inside state water), and the Aransas birds
// (roseate spoonbill + whooping crane, species 26 → 28).

export default async function shelf(t) {
  await t.check('boot-cost: border spatial index — equivalence vs brute-force nearestDist', async () => {
    // ~300 seeded deterministic points spanning the wide extent: interior
    // Texas, coast, US-neighbor band, Mexico side, offshore — every zone the
    // indexed borderDist (geo.js) must agree with the brute-force scan on.
    const res = await t.ev(`(() => {
      const rand = g.seededRand('bordergrid-check');
      const B = g.GEO.bounds;
      const bruteDist = (x, z) => {
        const poly = g.GEO.border;
        let best = Infinity;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[j], b = poly[i];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L = dx * dx + dz * dz;
          const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
          const px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
          const d = px * px + pz * pz;
          if (d < best) best = d;
        }
        return Math.sqrt(best);
      };
      const marginX = 1600, marginZ = 1600; // past SHELF_U (1127) so offshore/band/mexico all sample
      let worst = 0, n = 0, atX = 0, atZ = 0;
      for (let i = 0; i < 300; i++) {
        const x = B.minX - marginX + rand() * (B.maxX - B.minX + 2 * marginX);
        const z = B.minZ - marginZ + rand() * (B.maxZ - B.minZ + 2 * marginZ);
        const indexed = g.borderDist(x, z), brute = bruteDist(x, z);
        const diff = Math.abs(indexed - brute);
        if (diff > worst) { worst = diff; atX = x; atZ = z; }
        n++;
      }
      return { n, worst, atX, atZ };
    })()`);
    t.ok(res.n === 300, `expected 300 sample points, ran ${res.n}`);
    t.ok(res.worst < 1e-6, `indexed borderDist disagrees with brute force by ${res.worst} at (${res.atX.toFixed(1)}, ${res.atZ.toFixed(1)})`);
  });

  await t.check('boot-cost: indexed borderDist beats brute-force in-situ', async () => {
    // Regression guard on the border spatial index, contention-proof: an
    // absolute wall-clock ceiling flakes under the verify pool (a 2000ms
    // ceiling measured 5131ms under -j4 CPU contention with the fix in
    // place), so assert the RATIO of brute-force to indexed per-call cost
    // measured back-to-back in this same run — contention slows both sides
    // alike. Real margin is ~10×; the gate is 3×. Sample points sit at
    // iso-line-typical offsets, the workload that dominates the wide boot.
    const res = await t.ev(`(() => {
      const rand = g.seededRand('bordergrid-perf');
      const B = g.GEO.bounds;
      const poly = g.GEO.border;
      const bruteDist = (x, z) => {
        let best = Infinity;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[j], b = poly[i];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L = dx * dx + dz * dz;
          const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
          const px = a[0] + dx * t - x, pz = a[1] + dz * t - z;
          const d = px * px + pz * pz;
          if (d < best) best = d;
        }
        return Math.sqrt(best);
      };
      const pts = [];
      for (let i = 0; i < 500; i++) {
        pts.push([B.minX - 1600 + rand() * (B.maxX - B.minX + 3200),
                  B.minZ - 1600 + rand() * (B.maxZ - B.minZ + 3200)]);
      }
      let sink = 0;
      const tb0 = performance.now();
      for (const [x, z] of pts) for (let k = 0; k < 4; k++) sink += bruteDist(x, z);
      const bruteMs = performance.now() - tb0;
      const ti0 = performance.now();
      for (const [x, z] of pts) for (let k = 0; k < 40; k++) sink += g.borderDist(x, z);
      const idxMs = performance.now() - ti0;
      const brutePerCall = bruteMs / (pts.length * 4), idxPerCall = idxMs / (pts.length * 40);
      return { brutePerCall, idxPerCall, ratio: brutePerCall / idxPerCall, sink };
    })()`);
    t.ok(res.ratio > 3, `index only ${res.ratio.toFixed(1)}x faster than brute force ` +
      `(${(res.idxPerCall * 1000).toFixed(2)}µs vs ${(res.brutePerCall * 1000).toFixed(2)}µs per call), expected > 3x`);
    // Pathology backstop only — loose enough to hold under a contended pool.
    const ms = await t.ev('g.hud.wideLayerMs');
    t.ok(typeof ms === 'number' && ms > 0, `hud.wideLayerMs not set: ${ms}`);
    t.ok(ms < 15000, `wide-layer boot took ${ms.toFixed(0)}ms, expected < 15000ms even contended`);
  });
  await t.check('inStateWater: island-aware straddle points around the 166.7u line', async () => {
    const res = await t.ev(`({
      buoy: g.inStateWater(4762.2, 1851.5),          // ON the line (166.66u)
      pastBuoy: g.inStateWater(4802.2, 1851.5),      // ~40u seaward — federal shelf
      mansfield: g.inStateWater(2227.9, 4942.6),     // 99u from PADRE's shore, 220u from the mainland
      mansfieldD: g.coastDist(2227.9, 4942.6),
      land: g.inStateWater(830.2, 847.1),            // LBJ ranch — Texas, not water
      farRig: g.inStateWater(g.maritime.farSite.x, g.maritime.farSite.z), // farthest real major — long past the line
    })`);
    t.ok(res.buoy, 'the buoy point (coastDist 166.66) should be state water');
    t.ok(!res.pastBuoy, '40u seaward of the buoy should be federal shelf');
    t.ok(res.mansfield, 'off the Mansfield Cut should be state water — is coastDist island-aware?');
    t.ok(res.mansfieldD < 120, `Mansfield point coastDist ${res.mansfieldD.toFixed(1)} — islands not in the field (mainland-only would read ~220)`);
    t.ok(!res.land, 'a dry-land Texas point must never read as state water');
    t.ok(!res.farRig, 'the Far Rig sits in federal water');
  });

  await t.check('big map: dashed tidelands overlay hugs the line; minimap untouched', async () => {
    const res = await t.ev(`(() => {
      const line = g.hud.tidelands ?? [];
      const dists = [];
      for (let i = 0; i < line.length; i += 5) dists.push(g.coastDist(line[i][0], line[i][1]));
      return { n: line.length, min: Math.min(...dists), max: Math.max(...dists) };
    })()`);
    t.ok(res.n > 30, `tidelands polyline has only ${res.n} points`);
    // marching-squares midpoints carry ~a cell of interpolation error
    t.ok(Math.abs(res.min - 166.7) < 5 && Math.abs(res.max - 166.7) < 5,
      `line points stray off the 166.7u distance: ${res.min.toFixed(1)}..${res.max.toFixed(1)}`);
  });

  await t.check('big map (W3): world-edge iso-lines hug the shelf + shoulder walls, inked on the wide layer', async () => {
    const res = await t.ev(`(() => {
      const we = g.hud.worldEdge ?? { sea: [], land: [] };
      const seaD = [], landD = [];
      for (let i = 0; i < we.sea.length; i += 7) seaD.push(g.borderDist(we.sea[i][0], we.sea[i][1]));
      for (let i = 0; i < we.land.length; i += 7) landD.push(g.borderDist(we.land[i][0], we.land[i][1]));
      const zones = { sea: we.sea.every(([x, z]) => g.borderZoneAt(x, z) === 'coast'),
                      land: we.land.every(([x, z]) => g.borderZoneAt(x, z) === 'land') };
      // canvas-pixel probe (the rail-ink idiom): drawn-dash midpoints come
      // straight off worldEdgeDrawn (W1.1 — the dash test lives in one place
      // now); look for the #90a0b0 ink (Map W1 brightened it from #47535e)
      const probe = (pts) => {
        const ctx = g.hud.mapLayer.getContext('2d');
        for (const [x, z] of pts) {
          const [px, pz] = g.hud.mapT(x, z);
          const d = ctx.getImageData(Math.round(px) - 3, Math.round(pz) - 3, 7, 7).data;
          for (let i = 0; i < d.length; i += 4)
            if (Math.abs(d[i] - 144) < 30 && Math.abs(d[i + 1] - 160) < 30 && Math.abs(d[i + 2] - 176) < 30) return true;
        }
        return false;
      };
      const drawn = g.hud.worldEdgeDrawn ?? { sea: [], land: [] };
      return { nSea: we.sea.length, nLand: we.land.length,
        seaMin: Math.min(...seaD), seaMax: Math.max(...seaD),
        landMin: Math.min(...landD), landMax: Math.max(...landD),
        zones, seaInk: probe(drawn.sea), landInk: probe(drawn.land) };
    })()`);
    t.ok(res.nSea > 40, `sea world-edge line has only ${res.nSea} points`);
    t.ok(res.nLand > 40, `land world-edge line has only ${res.nLand} points`);
    t.ok(Math.abs(res.seaMin - 1127) < 6 && Math.abs(res.seaMax - 1127) < 6,
      `sea line strays off SHELF_U 1127: ${res.seaMin.toFixed(1)}..${res.seaMax.toFixed(1)}`);
    t.ok(Math.abs(res.landMin - 402) < 6 && Math.abs(res.landMax - 402) < 6,
      `land line strays off SHOULDER_U 402: ${res.landMin.toFixed(1)}..${res.landMax.toFixed(1)}`);
    t.ok(res.zones.sea, 'sea line has points off the coast zone (the inland twin leaked)');
    t.ok(res.zones.land, 'land line has points off US-neighbor ground (Mexico or the twin leaked)');
    t.ok(res.seaInk, 'no world-edge ink found on the wide layer at a sea dash');
    t.ok(res.landInk, 'no world-edge ink found on the wide layer at a land dash');
  });

  await t.check('Map W1.1: dash bands leave no holes — every boundary point sits near a drawn dash', async () => {
    // The Lake Jackson gap: the old checkerboard dash test let a diagonal
    // contour ride a skip-colored lane (bishop rule) — a 215u hole, whose
    // midpoint sat ~107u from the nearest drawn dash. The along-line bands
    // measure ≤91u on deterministic data; 100 splits the two with margin.
    const res = await t.ev(`(() => {
      const hole = (all, drawn) => {
        let worst = 0, at = null;
        for (const [x, z] of all) {
          let best = Infinity;
          for (const [dx, dz] of drawn) {
            const d = (dx - x) ** 2 + (dz - z) ** 2;
            if (d < best) best = d;
          }
          if (best > worst) { worst = best; at = [Math.round(x), Math.round(z)]; }
        }
        return { worst: Math.sqrt(worst), at };
      };
      return { sea: hole(g.hud.worldEdge.sea, g.hud.worldEdgeDrawn.sea),
               land: hole(g.hud.worldEdge.land, g.hud.worldEdgeDrawn.land),
               tide: hole(g.hud.tidelands, g.hud.tidelandsDrawn) };
    })()`);
    for (const k of ['sea', 'land', 'tide'])
      t.ok(res[k].worst < 100, `${k} line has a dash hole: ${res[k].worst.toFixed(0)}u at ${res[k].at}`);
  });

  await t.check('Map W1.2: world-edge seams are inked where the dilation limit steps', async () => {
    const res = await t.ev(`(() => {
      const seam = g.hud.worldEdgeSeam ?? [], drawn = g.hud.worldEdgeSeamDrawn ?? [];
      // the Sabine coast/land seam sits east of x 4000; the Rio Grande
      // coast/mexico seam west of it (mouth ≈ x 2240) — split and span-check
      const span = (pts) => {
        const bds = pts.map(([x, z]) => g.borderDist(x, z));
        return bds.length ? { n: bds.length, lo: Math.min(...bds), hi: Math.max(...bds) } : { n: 0, lo: 0, hi: 0 };
      };
      const sab = span(seam.filter(([x]) => x > 4000));
      const rg = span(seam.filter(([x]) => x >= -4000 && x < 4000));
      const ep = span(seam.filter(([x]) => x < -4000)); // El Paso NM/Mexico corner
      // every seam point straddles a zone divide within a fine cell
      const onDivide = seam.every(([x, z]) => new Set([
        g.borderZoneAt(x + 15, z), g.borderZoneAt(x - 15, z),
        g.borderZoneAt(x, z + 15), g.borderZoneAt(x, z - 15)]).size > 1);
      // and the drawn dashes leave no hole along the seams (the sibling
      // metric of the boundary-line check above)
      let worst = 0;
      for (const [x, z] of seam) {
        let best = Infinity;
        for (const [dx, dz] of drawn) {
          const d = (dx - x) ** 2 + (dz - z) ** 2;
          if (d < best) best = d;
        }
        worst = Math.max(worst, Math.sqrt(best));
      }
      return { sab, rg, ep, onDivide, worst, total: seam.length };
    })()`);
    t.ok(res.sab.n > 15, `Sabine seam too sparse: ${res.sab.n} points`);
    t.ok(res.sab.lo < 460 && res.sab.hi > 1060,
      `Sabine seam should span shoulder→shelf radii: ${res.sab.lo.toFixed(0)}..${res.sab.hi.toFixed(0)}`);
    t.ok(res.rg.n > 15, `Rio Grande seam too sparse: ${res.rg.n} points`);
    t.ok(res.rg.lo < 150 && res.rg.hi > 1060,
      `RG seam should span river→shelf radii: ${res.rg.lo.toFixed(0)}..${res.rg.hi.toFixed(0)}`);
    t.ok(res.ep.n > 5, `El Paso corner seam too sparse: ${res.ep.n} points`);
    t.ok(res.ep.lo < 150 && res.ep.hi > 350,
      `El Paso seam should span border→shoulder radii: ${res.ep.lo.toFixed(0)}..${res.ep.hi.toFixed(0)}`);
    t.ok(res.onDivide, 'a seam point sits away from any zone divide');
    t.ok(res.worst < 100, `seam dashes have a hole: ${res.worst.toFixed(0)}u`);
  });

  await t.check('gulf plane: state water keeps the teal, blue water past the line reads darker', async () => {
    const res = await t.ev(`(() => {
      const gulf = g.maritime.buoy.parent.getObjectByName('gulf');
      if (!gulf) return { missing: true };
      const p = gulf.geometry.attributes.position, c = gulf.geometry.attributes.color;
      const e = gulf.matrixWorld.elements;
      let near = null, far = null;
      for (let i = 0; i < p.count && !(near && far); i += 17) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const d = g.coastDist(wx, wz);
        if (d < 130 && !near) near = { g: c.getY(i) };
        if (d > 260 && !far) far = { g: c.getY(i) };
      }
      return { near, far };
    })()`);
    t.ok(!res.missing && res.near && res.far, 'gulf mesh, or vertices on both sides of the line, not found');
    // THREE.Color stores linear-sRGB: teal 0x2e6f9e green 0.435 → ~0.158 linear
    t.ok(res.near.g > 0.12, `state-water vertex lost its teal (linear green ${res.near.g.toFixed(3)}, expected ~0.158)`);
    t.ok(res.near.g - res.far.g > 0.05, `blue water not darker than state water: ${res.near.g.toFixed(3)} vs ${res.far.g.toFixed(3)}`);
  });

  await t.check('tidelands buoy plaque: hint at parked distance, E reads the hard bargain', async () => {
    await t.tp(4762.2 + 12, 1851.5); // parked-truck distance, not touching the buoy
    await t.wait(0.4); // hint lives in the ~12 Hz hud tick
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the channel buoy', `expected the buoy hint, got "${hint}"`);
    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
      shown: g.hud.els.dialog.style.display,
    })`);
    t.ok(dlg.shown === 'block', 'dialog not shown after E');
    t.ok(dlg.name.includes('Tidelands'), `dialog name is "${dlg.name}"`);
    t.ok(dlg.text.includes('republic drives a hard bargain') && dlg.text.includes('marine leagues'),
      `buoy plaque copy drifted: "${dlg.text.slice(0, 60)}…"`);
    await t.key('KeyE'); // close it — later checks share the session
  });

  await t.check('the Far Rig: re-anchored to the farthest real major, upgraded prop, its own plaque', async () => {
    // Energy W2 rebase: platforms are the 227 baked records; the Far Rig is a
    // bespoke group at the farthest-from-coast real major (maritime.farSite)
    const res = await t.ev(`(() => {
      const far = g.maritime.farRig, site = g.maritime.farSite;
      // farthest among REACHABLE platforms — the world wall caps the shelf at
      // 1127u; deepwater spars beyond it are horizon dressing, not destinations
      const ds = g.maritime.platforms.filter((p) => g.inWorld(p.x, p.z)).map((p) => g.coastDist(p.x, p.z));
      return { site, kids: far?.children.length ?? 0,
        atSite: !!far && far.position.x === site.x && far.position.z === site.z,
        reachable: g.inWorld(site.x, site.z),
        d: g.coastDist(site.x, site.z), maxD: Math.max(...ds), miles: g.maritime.farMiles,
        n: g.maritime.platforms.length };
    })()`);
    t.ok(res.site && res.atSite, 'Far Rig group not anchored at maritime.farSite');
    t.ok(res.reachable, 'the Far Rig must sit inside the world wall — brass no one can reach is dead content');
    t.ok(res.n === 227, `platforms must be the 227 baked records, got ${res.n}`);
    t.ok(Math.abs(res.d - res.maxD) < 1e-6, `Far Rig must be the farthest reachable platform: ${res.d.toFixed(1)} vs max ${res.maxD.toFixed(1)}`);
    t.near(res.d / 16.09, res.miles, 0.2, 'plaque miles disagree with the anchor distance');
    t.ok(res.kids >= 12, `Far Rig prop not visibly upgraded (${res.kids} parts)`);
    await t.tp(res.site.x + 10, res.site.z);
    const plq = await t.ev('g.maritime.plaqueNear(g.player.pos, 28)?.name');
    t.ok(plq === 'The Far Rig', `Far Rig plaque not readable from parked distance: ${plq}`);
  });

  await t.check('night presence: rig flares, work lights and the buoy lamp gate on ATMOS.night', async () => {
    await t.setDay();
    await t.wait(0.3); // maritime.update runs in the real loop
    const day = await t.ev('({ rig: g.maritime.rigGlow.opacity, work: g.maritime.workGlow.opacity })');
    t.ok(day.rig < 0.15 && day.work < 0.15, `glows lit in daylight: rig ${day.rig}, work ${day.work}`);
    await t.setNight();
    await t.wait(0.3);
    const night = await t.ev('({ rig: g.maritime.rigGlow.opacity, work: g.maritime.workGlow.opacity, fog: g.maritime.rigGlow.fog })');
    t.ok(night.rig > 0.6 && night.work > 0.6, `glows dark at night: rig ${night.rig}, work ${night.work}`);
    t.ok(night.fog === false, 'rig glow must ignore scene fog or the horizon skyline dies');
  });

  await t.check('1554 treasure light: appears on the sky\'s own new moon, watching logs the legend', async () => {
    await t.ev('g.sky.days = 4.0'); // round(4 % 8) === 4 — the label sky.js calls New Moon
    await t.setNight();
    const at = await t.ev('({ x: g.haunts.tPos.x, z: g.haunts.tPos.z })');
    await t.tp(at.x - 45, at.z); // outside the 60u flee ring, inside the 80u watch ring
    await t.until('g.haunts.treasure.visible && g.haunts.tMat.opacity > 0.15', 8000);
    await t.until(`g.gameplay.save.legends.includes('treasure')`, 8000);
    const total = await t.ev('document.getElementById(\'total-legends\').textContent');
    t.ok(total === '3', `legend total in HUD is ${total}, expected 3 (wisps + ghost fires + treasure)`);
  });

  await t.check('treasure light recedes from a pursuer and never leaves state water', async () => {
    const before = await t.ev('({ x: g.haunts.tPos.x, z: g.haunts.tPos.z })');
    await t.tp(before.x - 25, before.z); // press inside the flee ring
    await t.wait(2.5); // ~6 u/s recede pace → expect ~15u of drift
    const after = await t.ev(`({
      x: g.haunts.tPos.x, z: g.haunts.tPos.z,
      d: Math.hypot(g.haunts.tPos.x - g.player.pos.x, g.haunts.tPos.z - g.player.pos.z),
      sw: g.inStateWater(g.haunts.tPos.x, g.haunts.tPos.z),
    })`);
    const drifted = Math.hypot(after.x - before.x, after.z - before.z);
    t.ok(drifted > 4, `light barely drifted under pursuit: ${drifted.toFixed(1)}u in 2.5s`);
    t.ok(after.d > 25, `distance to a parked pursuer should GROW (charging-deer class): ${after.d.toFixed(1)}`);
    t.ok(after.sw, 'the ghost left Texas water');
  });

  await t.check('treasure light: dark on a crescent night, gone by dawn', async () => {
    await t.ev('g.sky.days = 1.0'); // waning gibbous — no ghost
    await t.until('!g.haunts.treasure.visible', 6000);
    await t.ev('g.sky.days = 4.0');
    await t.until('g.haunts.treasure.visible', 6000);
    await t.setDay(); // dawn banishes it even on the right day
    await t.until('!g.haunts.treasure.visible', 6000);
  });

  await t.check('Aransas: spoonbill flock + crane pair at Blackjack Peninsula, both logged from the truck', async () => {
    await t.setDay(); // diurnal birds (nightMax 0.6)
    const site = await t.ev('g.animals.aransasSite');
    await t.tp(site.x + 4, site.z + 1); // between the two homes — inside SPOT_R of both
    await t.wait(1.2); // chunk spawn
    const res = await t.ev(`(() => {
      const kinds = { spoonbill: 0, crane: 0 };
      for (const c of g.animals.live.values())
        for (const a of c.animals) if (kinds[a.species] !== undefined) kinds[a.species]++;
      return kinds;
    })()`);
    t.ok(res.spoonbill >= 4, `expected a spoonbill flock, found ${res.spoonbill}`);
    t.ok(res.crane >= 3, `expected the crane family, found ${res.crane}`);
    await t.until(`g.gameplay.save.species.includes('spoonbill') && g.gameplay.save.species.includes('crane')`, 10000);
    const facts = await t.ev(`({ s: g.SPECIES.spoonbill.fact, c: g.SPECIES.crane.fact })`);
    t.ok(facts.c.includes('winters at Aransas'), `crane fact must mention wintering: "${facts.c}"`);
    t.ok(facts.s.length > 20, 'spoonbill fact missing');
  });

  await t.check('the shelf reaches the wall: no Mexico misread off Sabine or Padre (tx-urgent 2026-07-15)', async () => {
    const res = await t.ev(`(() => {
      const rig = g.maritime.plaques.find((p) => p.name === 'The Far Rig').at;
      const zi = (x, z) => ({ zone: g.borderZoneAt(x, z), inW: g.inWorld(x, z) });
      return {
        sabine300: zi(5650, 1600),   // ~290u SE of the Sabine mouth (5401,1458) — open Gulf off the LA corner
        sabine700: zi(6055, 1955),   // past the 402u shoulder of the land stretch
        bocaEast: zi(2280, 5595),    // just off the Boca Chica beach, north of the mouth line
        padreEast: zi(2500, 5300),   // open Gulf east of the island
        mexWater: zi(2100, 5750),    // SW of the mouth, south of the boundary — Mexico
        mexLand: zi(1500, 6000),     // Tamaulipas proper
        galvShelf: zi(5263, 2670),   // ~1100u SE of Galveston — inside the 1127u shelf
        galvPast: zi(5404, 2811),    // ~1300u — one horizon past it
        rig: zi(rig[0], rig[1]),
      };
    })()`);
    t.ok(res.sabine300.zone === 'land' && res.sabine300.inW,
      `Sabine-mouth water must be shoulder, not Mexico: ${JSON.stringify(res.sabine300)}`);
    t.ok(!res.sabine700.inW, 'the land-stretch shoulder still ends at 402u');
    t.ok(res.bocaEast.zone === 'coast' && res.bocaEast.inW,
      `Boca Chica doorstep water misread: ${JSON.stringify(res.bocaEast)}`);
    t.ok(res.padreEast.zone === 'coast' && res.padreEast.inW,
      `Gulf east of Padre misread: ${JSON.stringify(res.padreEast)}`);
    t.ok(res.mexWater.zone === 'mexico' && !res.mexWater.inW, 'Mexico water south of the boundary must stay out');
    t.ok(res.mexLand.zone === 'mexico' && !res.mexLand.inW, 'Tamaulipas must stay out');
    t.ok(res.galvShelf.zone === 'coast' && res.galvShelf.inW, `Galveston shelf clipped: ${JSON.stringify(res.galvShelf)}`);
    t.ok(!res.galvPast.inW, 'the shelf still ends at 1127u');
    t.ok(res.rig.zone === 'coast' && res.rig.inW, `the Far Rig must be reachable: ${JSON.stringify(res.rig)}`);
  });
}
