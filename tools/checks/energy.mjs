// Energy — Wave 1: 8-layer Overpass bake (build-energy.mjs -> data/energy.json)
// + geo.js energyAt accessor. Pure data-truth checks, no player movement —
// assert numbers straight out of GEO.energy/energyAt, not pixels.

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];

export default async function energy(t) {
  await t.check('bake join: GEO.energy.counties has exactly 254 counties (ag idiom, all present even at wells:0)', async () => {
    const n = await t.ev(`Object.keys(g.GEO.energy.counties).length`);
    t.ok(n === 254, `expected 254 counties, got ${n}`);
  });

  await t.check('Permian Basin: Midland county reads dense well density', async () => {
    const [x, z] = LL(31.9973, -102.0779); // Midland, TX — Midland county seat
    const rec = await t.ev(`g.energyAt(${x}, ${z})`);
    t.ok(rec && rec.wellKm2 > 0.5, `Midland wellKm2 not dense: ${JSON.stringify(rec)}`);
  });

  await t.check('Trans-Pecos: Terrell county (Sanderson) has zero wells', async () => {
    const [x, z] = LL(30.1421, -102.4088); // Sanderson, TX — Terrell county seat
    const rec = await t.ev(`g.energyAt(${x}, ${z})`);
    t.ok(rec && rec.wells === 0 && rec.wellKm2 === 0, `Terrell not near-zero: ${JSON.stringify(rec)}`);
  });

  await t.check('outside Texas: energyAt returns null far off the border (New Orleans)', async () => {
    const [x, z] = LL(29.9511, -90.0715); // New Orleans, LA
    const rec = await t.ev(`g.energyAt(${x}, ${z})`);
    t.ok(rec === null, `expected null outside Texas, got ${JSON.stringify(rec)}`);
  });

  await t.check('wind: Roscoe and Horse Hollow both survive clustering into a real wind farm', async () => {
    const [rx, rz] = LL(32.45, -100.54); // Roscoe
    const [hx, hz] = LL(32.19, -100.05); // Horse Hollow
    const near = await t.ev(`(() => {
      const nearest = (x, z) => g.GEO.energy.windFarms.reduce((best, f) => {
        const d = Math.hypot(f.x - x, f.z - z);
        return (!best || d < best.d) ? { d, f } : best;
      }, null);
      const r = nearest(${rx}, ${rz});
      const h = nearest(${hx}, ${hz});
      return { rd: r.d, rr: r.f.r, rcount: r.f.count, hd: h.d, hr: h.f.r, hcount: h.f.count };
    })()`);
    t.ok(near.rd < near.rr, `Roscoe point (${near.rd.toFixed(1)}u away) falls outside its nearest farm's radius (${near.rr})`);
    t.ok(near.rcount > 100, `Roscoe's nearest farm cluster too small: ${near.rcount} turbines`);
    t.ok(near.hd < near.hr, `Horse Hollow point (${near.hd.toFixed(1)}u away) falls outside its nearest farm's radius (${near.hr})`);
    t.ok(near.hcount > 100, `Horse Hollow's nearest farm cluster too small: ${near.hcount} turbines`);
  });

  await t.check('refineries: 33 baked (W4 broadened query + 2 hand-placed), Ship Channel present', async () => {
    const r = await t.ev(`(() => {
      const refs = g.GEO.energy.refineries;
      const has = (n) => refs.some((x) => x.name && x.name.includes(n));
      return { n: refs.length, named: refs.filter((x) => x.name).length,
        deerPark: has('Deer Park'), baytown: has('Baytown'), bigSpring: has('Big Spring'),
        junk: refs.some((x) => x.name && /Recycle|Lithium|Power/.test(x.name)) };
    })()`);
    t.ok(r.n === 33, `expected 33 refineries, got ${r.n}`);
    t.ok(r.named === 28, `expected 28 named, got ${r.named}`);
    t.ok(r.deerPark && r.baytown && r.bigSpring, `missing majors: deerPark=${r.deerPark} baytown=${r.baytown} bigSpring=${r.bigSpring}`);
    t.ok(!r.junk, 'junk record (recycler/lithium/power-station sub-site) survived the filter');
  });

  await t.check('offshore: platforms[] has a beyond-state-waters major (inStateWater, not longitude)', async () => {
    const found = await t.ev(`(() => {
      const majors = g.GEO.energy.platforms.filter((p) => p.tier === 'major');
      const far = majors.find((p) => !g.inStateWater(p.x, p.z));
      return { majorCount: majors.length, far: far ? { x: far.x, z: far.z, operator: far.operator || null } : null };
    })()`);
    t.ok(found.majorCount > 0, 'no major-tier platforms baked');
    t.ok(found.far, 'no major platform sits beyond state waters');
  });

  await t.check('fairways: snap-points present for the hand-laid lane\'s port approaches', async () => {
    const fairways = await t.ev(`g.GEO.energy.fairways`);
    t.ok(fairways.length > 0, 'no fairways baked');
    t.ok(fairways.every((f) => f.pts && f.pts.length > 0), 'a fairway has no points');
  });

  await t.check('transmission: lines345 non-empty with a corridor reaching the Panhandle', async () => {
    const found = await t.ev(`(() => {
      const n = g.GEO.energy.lines345.length;
      const reachesPanhandle = g.GEO.energy.lines345.some((l) => l.pts.some((p) => p[1] < -4000));
      return { n, reachesPanhandle };
    })()`);
    t.ok(found.n > 0, 'no 345kV corridors baked');
    t.ok(found.reachesPanhandle, 'no corridor reaches the Panhandle (z < -4000)');
  });

  // --- Wave 2: well sites, scatter retirement, flares, rebase, log, announcer ---

  await t.check('wellSiteAt: Permian chunks spawn lawful pads, a zero-well county spawns none', async () => {
    const res = await t.ev(`(() => {
      const out = { sites: 0, bad: [], terrell: 0 };
      for (let cx = -16; cx <= -9; cx++) for (let cz = -6; cz <= -3; cz++) {
        for (const s of g.wellSiteAt(cx, cz)) {
          out.sites++;
          const road = g.nearestAnyRoad(s.x, s.z, 6);
          if (road && road.dist < 5) out.bad.push(['road', s.x, s.z, road.dist]);
          if (!g.airportClear(s.x, s.z)) out.bad.push(['airport', s.x, s.z]);
          if (g.brandNear(s.x, s.z, 30)) out.bad.push(['brand', s.x, s.z]);
          if (!g.cityClear(s.x, s.z, 20)) out.bad.push(['city', s.x, s.z]);
          for (const ch of g.chapelSitesNear(s.x, s.z, 0))
            if (Math.hypot(ch.x - s.x, ch.z - s.z) < 15) out.bad.push(['chapel', s.x, s.z]);
          const farm = g.farmsteadAt(cx, cz);
          if (farm && Math.hypot(farm.x - s.x, farm.z - s.z) < 15) out.bad.push(['farm', s.x, s.z]);
        }
      }
      for (let cx = -12; cx <= -10; cx++) for (let cz = 3; cz <= 4; cz++) out.terrell += g.wellSiteAt(cx, cz).length;
      return out;
    })()`);
    t.ok(res.sites > 10, `Permian/Midland grid too sparse: ${res.sites} sites over 32 chunks`);
    t.ok(res.bad.length === 0, `unlawful well sites: ${JSON.stringify(res.bad.slice(0, 4))}`);
    t.ok(res.terrell === 0, `Terrell (zero wells) grew ${res.terrell} sites`);
  });

  await t.check('scatter retired: every rendered pumpjack belongs to a well site (or the Waggoner story pair)', async () => {
    // park in the Midland-area basin and let scenery chunks spawn around a real site
    const at = await t.ev(`(() => {
      for (let cx = -12; cx <= -9; cx++) for (let cz = -6; cz <= -3; cz++) {
        const s = g.wellSiteAt(cx, cz);
        if (s.length) return { x: s[0].x, z: s[0].z };
      }
      return null;
    })()`);
    t.ok(at, 'no well site found in the Midland grid to park at');
    await t.tp(at.x + 8, at.z);
    await t.until(`(() => {
      let found = false;
      for (const [, grp] of g.scenery.live) grp.traverse((o) => { if (o.userData.kind === 'wellsite') found = true; });
      return found;
    })()`, 8000);
    const res = await t.ev(`(() => {
      let jacks = 0, orphans = 0, minVerts = Infinity;
      for (const [, grp] of g.scenery.live) grp.traverse((o) => {
        if (o.userData.kind !== 'pumpjack') return;
        jacks++;
        let p = o, ok = false;
        while (p) { if (p.userData && (p.userData.kind === 'wellsite' || p.userData.kind === 'ranchhq')) { ok = true; break; } p = p.parent; }
        if (!ok) orphans++;
        let v = 0;
        o.traverse((m) => { if (m.geometry) v += m.geometry.attributes.position.count; });
        minVerts = Math.min(minVerts, v);
      });
      return { jacks, orphans, minVerts };
    })()`);
    t.ok(res.jacks > 0, 'no pumpjacks rendered at a live well site');
    t.ok(res.orphans === 0, `${res.orphans} pumpjacks outside well sites — the uniform scatter is not retired`);
    t.ok(res.minVerts > 100, `pumpjack prototype under the poly bar: ${res.minVerts} verts`);
  });

  await t.check('gas flares: shared flame material burns 24/7 — faint day floor, full at night (W4 revision)', async () => {
    await t.setDay();
    await t.wait(0.4); // scenery.update drives the gate in the real loop
    const day = await t.ev('g.scenery.flareMat.opacity');
    t.ok(day > 0.2 && day < 0.45, `flare day floor off (expected ~0.3): ${day}`);
    await t.setNight();
    await t.wait(0.4);
    const night = await t.ev('({ o: g.scenery.flareMat.opacity, fog: g.scenery.flareMat.fog })');
    t.ok(night.o > 0.85, `flare flame dim at night (expected ~1): ${night.o}`);
    t.ok(night.fog === false, 'flare flame must ignore scene fog (basin skyline)');
  });

  await t.check('offshore rebase: 227 real platforms drawn instanced, the hand-laid seven gone', async () => {
    const res = await t.ev(`(() => {
      const LLc = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
      const old = [[28.9, -94.7], [28.4, -95.3], [29.3, -93.9], [27.9, -96.3], [28.0, -95.0], [29.0, -93.6], [27.2, -96.9]].map(([a, b]) => LLc(a, b));
      const sites = g.maritime.platforms;
      const oldAlive = old.filter(([x, z]) => sites.some((p) => Math.hypot(p.x - x, p.z - z) < 0.5)).length;
      return { n: sites.length, sameAsBaked: sites === g.GEO.energy.platforms, oldAlive, far: !!g.maritime.farRig };
    })()`);
    t.ok(res.n === 227 && res.sameAsBaked, `platforms must be the 227 baked records (got ${res.n})`);
    t.ok(res.oldAlive === 0, `${res.oldAlive} of the old hand-laid seven still present`);
    t.ok(res.far, 'no bespoke Far Rig group after the rebase');
  });

  await t.check('fairway legs: port approaches snap to the baked points, an approach tanker works one', async () => {
    const res = await t.ev(`(() => {
      const baked = g.GEO.energy.fairways.flatMap((f) => f.pts);
      const legs = g.maritime.fairwayLegs;
      // every leg point past the lane-join head must be a real baked point
      const stray = legs.flatMap((l) => l.slice(1)).filter(([x, z]) => !baked.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 0.01));
      const tanker = g.maritime.ships.find((s) => s.leg);
      return { legs: legs.length, stray: stray.length, tanker: !!tanker, s0: tanker?.s ?? -1 };
    })()`);
    t.ok(res.legs > 0, 'no fairway approach legs built');
    t.ok(res.stray === 0, `${res.stray} leg points are not baked fairway points`);
    t.ok(res.tanker, 'no approach tanker assigned to a fairway leg');
    const s1 = await t.ev('g.maritime.ships.find((s) => s.leg).s');
    await t.wait(1.2);
    const s2 = await t.ev('g.maritime.ships.find((s) => s.leg).s');
    t.ok(s2 !== s1, 'approach tanker not moving along its leg');
  });

  await t.check('hero sites: every Energy hero stands clear of roads (the Spindletop lesson)', async () => {
    const bad = await t.ev(`g.energy.heroes
      .map((h) => ({ id: h.id, d: g.nearestAnyRoad(h.at[0], h.at[1], 12)?.dist ?? 99 }))
      .filter((h) => h.d < 8)`);
    t.ok(bad.length === 0, `hero sites on/near a road: ${JSON.stringify(bad)}`);
  });

  await t.check('Energy log: hero visit logs once, dedups, and the pause line counts it', async () => {
    await t.ev(`g.gameplay.save.energy = []`);
    await t.tp(5191.6, 1096.9); // Spindletop hero plot (shoved off the road)
    await t.until(`g.gameplay.save.energy.includes('spindletop')`, 6000);
    await t.ev(`g.gameplay.logEnergy('spindletop', 'Spindletop', 2, 'dup try')`);
    const res = await t.ev(`({ n: g.gameplay.save.energy.length, counts: g.gameplay.counts().energy })`);
    t.ok(res.n === 1, `hero log did not dedup: ${res.n}`);
    t.ok(res.counts === 1, `counts().energy wrong: ${res.counts}`);
    await t.wait(0.5);
    const dom = await t.ev(`document.getElementById('score-energy').textContent`);
    t.ok(dom === '1', `pause line not updated: "${dom}"`);
  });

  await t.check('announcer: named platform fires one toast, re-arms on exit, unnamed stays silent', async () => {
    const nansen = await t.ev(`g.GEO.energy.platforms.find((p) => p.name === 'NANSEN')`);
    t.ok(nansen, 'NANSEN not in the baked platforms');
    await t.ev(`(() => { g.hud.toast(''); g.energy.cooldown = 0; })()`);
    await t.tp(nansen.x + 5, nansen.z);
    await t.until(`document.getElementById('toast').textContent.includes('NANSEN')`, 4000);
    const first = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(first.includes('NANSEN'), `toast is not the baked name: "${first}"`);
    // dense-row guard: hop straight to another named site — cooldown holds one toast
    const other = await t.ev(`g.GEO.energy.platforms.find((p) => p.name && p.name !== 'NANSEN')`);
    await t.tp(other.x + 5, other.z);
    await t.wait(1.0);
    const held = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(held.includes('NANSEN'), `cooldown broken — a second toast stacked: "${held}"`);
    // leave far (re-arm), return with cooldown cleared — fires again (every visit)
    await t.tp(nansen.x + 200, nansen.z);
    await t.wait(0.8);
    await t.ev(`(() => { g.hud.toast(''); g.energy.cooldown = 0; })()`);
    await t.tp(nansen.x + 5, nansen.z);
    await t.until(`document.getElementById('toast').textContent.includes('NANSEN')`, 4000);
    // unnamed minor: silent — no announcer entry at all
    const dark = await t.ev(`g.GEO.energy.platforms.find((p) => !p.name && !p.operator)`);
    if (dark) {
      await t.ev(`(() => { g.hud.toast(''); g.energy.cooldown = 0; })()`);
      await t.tp(dark.x + 3, dark.z);
      await t.wait(1.2);
      const silent = await t.ev(`document.getElementById('toast').textContent`);
      t.ok(silent === '', `unnamed site announced: "${silent}"`);
    }
  });

  // --- Wave 3: wind farms (instanced turbines), solar fields, log heroes ---

  await t.check('windTurbinesAt: a dense farm chunk instances many lawful turbines, a farm-free chunk none', async () => {
    const res = await t.ev(`(() => {
      const dense = g.windTurbinesAt(-3, -6); // chunk centered on the densest baked farm (1336-turbine cluster)
      const empty = g.windTurbinesAt(20, 4);  // far east, >1000u from any farm's edge
      const bad = dense.filter((s) => !g.inTexas(s.x, s.z) || (g.nearestAnyRoad(s.x, s.z, 3)?.dist ?? 99) < 3);
      return { dense: dense.length, empty: empty.length, bad: bad.length };
    })()`);
    t.ok(res.dense >= 8, `dense farm chunk too sparse: ${res.dense} turbines`);
    t.ok(res.empty === 0, `farm-free chunk grew ${res.empty} turbines`);
    t.ok(res.bad === 0, `${res.bad} of the dense chunk's turbines sit off-Texas or on a road`);
  });

  await t.check('turbines: instanced at a live farm chunk, blade spin tracks ATMOS.wind (real loop — joins the windmill sentinel)', async () => {
    await t.tp(-650, -1430, 'FLY'); // densest farm chunk's center
    await t.until(`(() => {
      for (const [, grp] of g.scenery.live) { let found = false; grp.traverse((o) => { if (o.userData.kind === 'turbinetower') found = true; }); if (found) return true; }
      return false;
    })()`, 8000);
    const towers = await t.ev(`(() => {
      let n = 0;
      for (const [, grp] of g.scenery.live) grp.traverse((o) => { if (o.userData.kind === 'turbinetower') n += o.count; });
      return n;
    })()`);
    t.ok(towers >= 8, `too few instanced turbine towers rendered: ${towers}`);
    t.ok(await t.ev(`!!g.scenery.animated.find((a) => a.kind === 'turbine')`), 'no turbine blade-spin entry registered');

    await t.setWeather('clear');
    const spin0 = await t.ev(`g.scenery.animated.find((a) => a.kind === 'turbine').obj.spin`);
    await t.simWait(1.5);
    const clearDelta = (await t.ev(`g.scenery.animated.find((a) => a.kind === 'turbine').obj.spin`)) - spin0;
    t.ok(clearDelta > 0, `blade spin did not accumulate under clear wind: ${clearDelta}`);

    await t.setWeather('storm');
    const spin2 = await t.ev(`g.scenery.animated.find((a) => a.kind === 'turbine').obj.spin`);
    await t.simWait(1.5);
    const stormDelta = (await t.ev(`g.scenery.animated.find((a) => a.kind === 'turbine').obj.spin`)) - spin2;
    t.ok(stormDelta > clearDelta * 1.5, `blade spin did not speed up with storm wind: clear ${clearDelta.toFixed(3)} vs storm ${stormDelta.toFixed(3)}`);
  });

  await t.check('solar: decal geometry drapes to hAt within ε (from-the-air read stays glued to terrain)', async () => {
    const site = await t.ev(`g.GEO.energy.plants.find((p) => p.source === 'solar' && p.name)`);
    t.ok(site, 'no named solar plant baked');
    await t.tp(site.x + 3, site.z, 'FLY');
    await t.until(`(() => {
      for (const [, grp] of g.scenery.live) { let found = false; grp.traverse((o) => { if (o.userData.kind === 'solarfield') found = true; }); if (found) return true; }
      return false;
    })()`, 8000);
    const res = await t.ev(`(() => {
      let maxErr = 0, verts = 0;
      for (const [, grp] of g.scenery.live) grp.traverse((o) => {
        if (o.userData.kind !== 'solarfield') return;
        for (const child of o.children) {
          if (child.isInstancedMesh || !child.geometry) continue;
          const pos = child.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            maxErr = Math.max(maxErr, Math.abs(y - g.hAt(x, z)));
            verts++;
          }
        }
      });
      return { maxErr, verts };
    })()`);
    t.ok(res.verts > 0, 'no solar decal vertices found near the named plant');
    t.ok(res.maxErr < 0.35, `solar decal strays from hAt: max err ${res.maxErr.toFixed(3)}`);
  });

  await t.check('solar blocks: per-block clearance law — no drawn block touches a road/river, Blue Wing keeps only far-side blocks (W4.5 rework)', async () => {
    const res = await t.ev(`(() => {
      const SOLAR_CLEAR = 1.5;
      const solar = g.GEO.energy.plants.filter((p) => p.source === 'solar');
      // mirror world.js's block math exactly (same seed stream, same order)
      const blocksOf = (s) => {
        const baseR = Math.max(1.5, s.r);
        const srand = g.seededRand('solarrows' + s.x.toFixed(1) + ',' + s.z.toFixed(1));
        const out = [];
        for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const hb = baseR * (0.38 + srand() * 0.06);
          const bx = s.x + qx * baseR * 0.52, bz = s.z + qz * baseR * 0.52;
          const need = hb * Math.SQRT2 + SOLAR_CLEAR;
          const road = g.nearestAnyRoad(bx, bz, need + 10);
          const riv = g.nearestRiver(bx, bz, need + 10);
          if ((road && road.dist < need) || (riv && riv.dist < need)) continue;
          out.push({ hb, reach: (road?.dist ?? 99) , rreach: (riv?.dist ?? 99) });
        }
        return out;
      };
      let violations = 0, drawnSites = 0;
      for (const s of solar) {
        const bl = blocksOf(s);
        if (bl.length) drawnSites++;
        for (const b of bl) if (b.reach < b.hb * Math.SQRT2 || b.rreach < b.hb * Math.SQRT2) violations++;
      }
      const blueWing = solar.find((p) => p.name === 'Blue Wing Solar Farm');
      const bwRoad = g.nearestAnyRoad(blueWing.x, blueWing.z, 30);
      return { violations, drawnSites, total: solar.length,
        bwBlocks: blocksOf(blueWing).length, bwRoadDist: bwRoad?.dist ?? null };
    })()`);
    t.ok(res.violations === 0, `${res.violations} drawn solar blocks still reach a road/river`);
    t.ok(res.drawnSites > 400, `too many solar sites with zero blocks: only ${res.drawnSites}/${res.total} draw`);
    t.ok(res.bwRoadDist !== null && res.bwRoadDist < 5, `Blue Wing's real site should sit near I-37 (got ${res.bwRoadDist})`);
    t.ok(res.bwBlocks < 4, `Blue Wing (2.8u from I-37) should drop its road-side blocks, kept ${res.bwBlocks}/4`);
  });

  await t.check('solar panels: tilted instanced kit at a live site — south-facing, on legs, never flat boxes (W4.5 rework)', async () => {
    const site = await t.ev(`g.GEO.energy.plants.find((p) => p.source === 'solar' && p.name)`);
    await t.tp(site.x + 3, site.z, 'FLY');
    await t.until(`(() => {
      for (const [, grp] of g.scenery.live) { let found = false; grp.traverse((o) => { if (o.userData.kind === 'solarfield') found = true; }); if (found) return true; }
      return false;
    })()`, 8000);
    const res = await t.ev(`(() => {
      let inst = 0, protoVerts = 0, minY = 99, maxY = -99;
      for (const [, grp] of g.scenery.live) grp.traverse((o) => {
        if (o.userData.kind !== 'solarfield') return;
        for (const child of o.children) {
          if (!child.isInstancedMesh) continue;
          inst += child.count;
          const pos = child.geometry.attributes.position;
          protoVerts = pos.count;
          for (let i = 0; i < pos.count; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
        }
      });
      return { inst, protoVerts, minY, maxY };
    })()`);
    t.ok(res.inst > 20, `too few panel instances at a live named site: ${res.inst}`);
    t.ok(res.protoVerts >= 100, `panel prototype suspiciously simple (${res.protoVerts} verts — slab + 2 legs expected)`);
    t.ok(res.minY < 0.05, `no leg reaches the ground: minY ${res.minY.toFixed(2)}`);
    t.ok(res.maxY > 0.6, `tilted slab's high edge missing: maxY ${res.maxY.toFixed(2)} (flat boxes were 0.22)`);
  });

  await t.check('wind heroes: Roscoe, Horse Hollow, and the coastal (Papalote) farm all log on arrival (road clearance covered by the generic hero sweep above)', async () => {
    const ids = await t.ev(`g.energy.heroes.filter((h) => h.kind === 'windfarm').map((h) => h.id)`);
    t.ok(ids.length === 3, `expected 3 wind heroes, got ${ids.length}`);
    for (const id of ['roscoe', 'horsehollow', 'papalote']) t.ok(ids.includes(id), `missing wind hero id: ${id}`);
    await t.ev(`g.gameplay.save.energy = []`);
    const roscoe = await t.ev(`g.energy.heroes.find((h) => h.id === 'roscoe')`);
    await t.tp(roscoe.at[0], roscoe.at[1]);
    await t.until(`g.gameplay.save.energy.includes('roscoe')`, 6000);
  });

  // --- Wave 4: refinery kit + hero skylines + local light pool + spill decals ---

  await t.check('refinery kit: merged skyline geometry stands at every baked site (sites as numbers, not pixels)', async () => {
    const res = await t.ev(`(() => {
      const steel = g.energy.refineryMeshes.steel.geometry.attributes.position;
      const sites = g.GEO.energy.refineries.map((s) => ({ name: s.name || '?', x: s.x, z: s.z, hit: false }));
      for (let i = 0; i < steel.count; i += 3) {
        const vx = steel.getX(i), vz = steel.getZ(i);
        for (const s of sites) if (!s.hit && Math.hypot(s.x - vx, s.z - vz) < 35) s.hit = true;
      }
      return { total: sites.length, missing: sites.filter((s) => !s.hit).map((s) => s.name) };
    })()`);
    t.ok(res.total === 33, `expected 33 baked refineries, got ${res.total}`);
    t.ok(res.missing.length === 0, `sites with no skyline geometry: ${res.missing.join(', ')}`);
  });

  await t.check('refinery kit: every prop cleared the road/river footprint law (Blue Wing lesson, applied per prop)', async () => {
    const res = await t.ev(`(() => {
      const bad = [];
      for (const k of ['steel', 'dark', 'tank', 'rust']) {
        const pos = g.energy.refineryMeshes[k].geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 24) { // sample — full scan is 100k+ verts
          const vx = pos.getX(i), vz = pos.getZ(i);
          const d = Math.min(g.nearestAnyRoad(vx, vz, 6)?.dist ?? 99, g.nearestRiver(vx, vz, 6)?.dist ?? 99);
          if (d < 2.5) bad.push({ k, vx: +vx.toFixed(0), vz: +vz.toFixed(0), d: +d.toFixed(1) });
        }
      }
      return bad.slice(0, 5);
    })()`);
    t.ok(res.length === 0, `kit vertices on a road/river: ${JSON.stringify(res)}`);
  });

  await t.check('hero plaque: Motiva brass reads at parked-truck distance on an ugly heading', async () => {
    const at = await t.ev(`g.energy.heroes.find((h) => h.id === 'motiva').at`);
    await t.tp(at[0] + 9, at[1] + 7); // parked distance, off-axis approach
    await t.ev('g.player.heading = 3.87');
    await t.wait(0.4); // hint rides the ~12 Hz hud tick
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the marker', `expected the marker hint, got "${hint}"`);
    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
    })`);
    t.ok(dlg.name.includes('Motiva'), `dialog name is "${dlg.name}"`);
    t.ok(dlg.text.includes('biggest refinery on the continent'), `Motiva plaque copy drifted: "${dlg.text.slice(0, 60)}…"`);
    await t.key('KeyE');
  });

  await t.check('refinery heroes: all four log on arrival', async () => {
    const ids = await t.ev(`g.energy.heroes.filter((h) => h.kind === 'refinery').map((h) => h.id)`);
    t.ok(ids.length === 4, `expected 4 refinery heroes, got ${ids.length}`);
    for (const id of ['shipchannel', 'baytown', 'motiva', 'corpus']) t.ok(ids.includes(id), `missing refinery hero id: ${id}`);
    await t.ev(`g.gameplay.save.energy = []`);
    const bay = await t.ev(`g.energy.heroes.find((h) => h.id === 'baytown')`);
    await t.tp(bay.at[0], bay.at[1]);
    await t.until(`g.gameplay.save.energy.includes('baytown')`, 6000);
  });

  await t.check('light pool: scene light count is IDENTICAL across nightfall and a two-site drive (the recompile guard)', async () => {
    const count = `(() => { let n = 0; g.sky.scene.traverse((o) => { if (o.isLight) n++; }); return n; })()`;
    await t.setDay();
    const day = await t.ev(count);
    await t.setNight();
    const m = await t.ev(`g.energy.heroes.find((h) => h.id === 'motiva').at`);
    await t.tp(m[0], m[1]);
    await t.wait(0.8);
    const nightA = await t.ev(count);
    const d = await t.ev(`g.energy.heroes.find((h) => h.id === 'shipchannel').at`);
    await t.tp(d[0], d[1]);
    await t.wait(0.8);
    const nightB = await t.ev(count);
    t.ok(day === nightA && nightA === nightB, `light count moved: day=${day} night@motiva=${nightA} night@deerpark=${nightB}`);
    const pool = await t.ev('g.sky.pool.length');
    t.ok(pool === 6, `pool is not the fixed 6: ${pool}`);
  });

  await t.check('light pool: 0-intensity by day, lit near a refinery at night, flare anchors flicker orange', async () => {
    await t.setDay();
    const m = await t.ev(`g.energy.heroes.find((h) => h.id === 'motiva').at`);
    await t.tp(m[0], m[1]);
    await t.wait(0.8);
    const day = await t.ev('g.sky.pool.map((l) => l.intensity)');
    t.ok(day.every((i) => i === 0), `pool lit by day: ${JSON.stringify(day)}`);
    await t.setNight();
    await t.wait(0.8); // one 0.5 s assignment tick + a frame
    const night = await t.ev(`g.sky.pool.filter((l) => l.userData.anchor).map((l) => ({ i: l.intensity, kind: l.userData.anchor.kind }))`);
    t.ok(night.length > 0, 'no pool light assigned beside the Motiva skyline at night');
    t.ok(night.every((l) => l.i > 0), `assigned pool light dark at night: ${JSON.stringify(night)}`);
    t.ok(night.some((l) => l.kind === 'flare' || l.kind === 'refinery'), `no refinery/flare anchor served: ${JSON.stringify(night)}`);
  });

  await t.check('light pool: nearest-assignment follows the player between two sites', async () => {
    await t.setNight();
    const m = await t.ev(`g.energy.heroes.find((h) => h.id === 'motiva').at`);
    await t.tp(m[0], m[1]);
    await t.wait(0.8);
    const atMotiva = await t.ev(`g.sky.pool.filter((l) => l.userData.anchor).map((l) => ({ x: l.position.x, z: l.position.z }))`);
    t.ok(atMotiva.length > 0, 'no anchors served at Motiva');
    const d = await t.ev(`g.energy.heroes.find((h) => h.id === 'shipchannel').at`);
    await t.tp(d[0], d[1]);
    await t.wait(0.8);
    const atDeer = await t.ev(`g.sky.pool.filter((l) => l.userData.anchor).map((l) => ({ x: l.position.x, z: l.position.z }))`);
    t.ok(atDeer.length > 0, 'no anchors served at Deer Park');
    // the pool serves the nearest anchors to the PLAYER — a neighboring
    // refinery's flare 100u out can legitimately hold a light, so assert
    // relative nearness (Motiva side vs Deer Park side), not a fixed radius
    const nearM = atMotiva.every((l) => Math.hypot(l.x - m[0], l.z - m[1]) < Math.hypot(l.x - d[0], l.z - d[1]));
    const nearD = atDeer.every((l) => Math.hypot(l.x - d[0], l.z - d[1]) < Math.hypot(l.x - m[0], l.z - m[1]));
    t.ok(nearM, `Motiva-side lights sit closer to Deer Park: ${JSON.stringify(atMotiva)}`);
    t.ok(nearD, `assignment did not flip to Deer Park: ${JSON.stringify(atDeer)}`);
  });

  await t.check('spill decals: refinery ground glow and rig water glow both track ATMOS.night', async () => {
    await t.setDay();
    await t.wait(0.3);
    const day = await t.ev(`({ ref: g.energy.spillMat.opacity, rig: g.maritime.spillMat.opacity })`);
    t.ok(day.ref === 0 && day.rig === 0, `spill glowing by day: ${JSON.stringify(day)}`);
    await t.setNight();
    await t.wait(0.3);
    const night = await t.ev(`({ ref: g.energy.spillMat.opacity, rig: g.maritime.spillMat.opacity, n: g.ATMOS.night })`);
    t.ok(night.ref > 0.2 && night.rig > 0.2, `spill dark at night: ${JSON.stringify(night)}`);
  });

  await t.check('rig decks: major platforms registered warm-white pool anchors; water spill instanced under the fleet', async () => {
    const res = await t.ev(`(() => {
      const rigAnchors = g.sky.glowAnchors.filter((a) => a.kind === 'rig').length;
      const majors = g.GEO.energy.platforms.filter((p) => p.tier === 'major').length;
      const flare = g.sky.glowAnchors.some((a) => a.kind === 'flare' && g.maritime.farSite && Math.hypot(a.x - g.maritime.farSite.x, a.z - g.maritime.farSite.z) < 12);
      return { rigAnchors, majors, farFlare: flare };
    })()`);
    // majors minus one: the Far Rig is a major but registers flare-kind at its flame
    t.ok(res.rigAnchors === res.majors - 1, `rig anchors (${res.rigAnchors}) != major platforms - farRig (${res.majors - 1})`);
    t.ok(res.farFlare, 'the Far Rig has no flare-kind anchor');
  });

  // --- Wave 5: 345 kV tower corridors, substations, hero plants, ERCOT radio flavor ---

  await t.check('towers: corridor tower count matches arc-length/spacing rounding', async () => {
    const res = await t.ev(`(() => {
      const r = g.energy.towerRanges.find((r) => r.len > 800);
      const expected = Math.max(1, Math.round(r.len / 40)) + 1;
      return { len: r.len, count: r.count, expected };
    })()`);
    t.ok(res.count === res.expected, `corridor tower count ${res.count} != expected ${res.expected} (len ${res.len})`);
  });

  await t.check('towers: instances sit on hAt (draped, not floating/buried)', async () => {
    // matrixWorld.constructor idiom (shoulder.mjs) avoids needing a THREE global
    const out = await t.ev(`(() => {
      const mesh = g.energy.towerMesh;
      const m = new (mesh.matrixWorld.constructor)();
      const n = mesh.count;
      const idxs = [0, (n / 2) | 0, n - 1];
      return idxs.map((i) => {
        mesh.getMatrixAt(i, m);
        const x = m.elements[12], y = m.elements[13], z = m.elements[14];
        return Math.abs(y - g.hAt(x, z));
      });
    })()`);
    t.ok(out.every((dy) => dy < 0.05), `tower not seated on hAt: ${JSON.stringify(out)}`);
  });

  await t.check('plant heroes: all four log on arrival', async () => {
    const ids = await t.ev(`g.energy.heroes.filter((h) => h.kind === 'plant').map((h) => h.id)`);
    t.ok(ids.length === 4, `expected 4 plant heroes, got ${ids.length}`);
    for (const id of ['stp', 'comanchepeak', 'parish', 'martinlake']) t.ok(ids.includes(id), `missing plant hero id: ${id}`);
    await t.ev(`g.gameplay.save.energy = []`);
    const stp = await t.ev(`g.energy.heroes.find((h) => h.id === 'stp')`);
    await t.tp(stp.at[0], stp.at[1]);
    await t.until(`g.gameplay.save.energy.includes('stp')`, 6000);
  });

  await t.check('hero plaque: South Texas Project brass reads at parked-truck distance on an ugly heading', async () => {
    const at = await t.ev(`g.energy.heroes.find((h) => h.id === 'stp').at`);
    await t.tp(at[0] + 8, at[1] - 6); // parked distance, off-axis approach
    await t.ev('g.player.heading = 2.31');
    await t.wait(0.4); // hint rides the ~12 Hz hud tick
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the marker', `expected the marker hint, got "${hint}"`);
    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
    })`);
    t.ok(dlg.name.includes('South Texas Project'), `dialog name is "${dlg.name}"`);
    t.ok(dlg.text.includes('7,000-acre reservoir'), `STP plaque copy drifted: "${dlg.text.slice(0, 60)}…"`);
    await t.key('KeyE');
  });

  await t.check('plant heroes: all four register cool-flood glow anchors', async () => {
    const n = await t.ev(`g.sky.glowAnchors.filter((a) => a.kind === 'plant').length`);
    t.ok(n === 4, `expected 4 plant glow anchors, got ${n}`);
  });

  await t.check('substations: thinned before drawing, kit instanced once per kept site', async () => {
    const res = await t.ev(`({ thinned: g.energy.subSites.length, instCount: g.energy.subMesh.count })`);
    t.ok(res.thinned > 300 && res.thinned < 735, `substation thin count implausible: ${res.thinned}`);
    t.ok(res.instCount === res.thinned, `instanced count (${res.instCount}) != thinned site count (${res.thinned})`);
  });

  await t.check('substations: named+separated sites join the announcer; the Parish substation stays excluded (hero-adjacent, no double toast)', async () => {
    const res = await t.ev(`(() => {
      const parishSub = g.energy.subSites.find((s) => s.name && s.name.includes('W. A. Parish Station'));
      const registered = g.energy.sites.some((s) => s.label.includes('W. A. Parish Station'));
      const anyNamedRegistered = g.energy.sites.some((s) => s.label.startsWith('⚡'));
      return { drawnHasParishSub: !!parishSub, parishSubRegistered: registered, anyNamedRegistered };
    })()`);
    t.ok(res.drawnHasParishSub, 'Parish substation missing from the thinned draw list');
    t.ok(!res.parishSubRegistered, 'Parish substation double-registered with the announcer (hero-exclusion failed)');
    t.ok(res.anyNamedRegistered, 'no substation ever joined the announcer');
  });

  await t.check('ERCOT radio flavor: {grid} token lights up near a baked substation, stays dark far from the grid', async () => {
    const res = await t.ev(`(() => {
      const parish = g.energy.subSites.find((s) => s.name && s.name.includes('W. A. Parish Station'));
      const near = g.radio.ctxFor({ x: parish.x, z: parish.z, cs: 'TEST' }, g.sky).grid;
      const far = g.radio.ctxFor({ x: -3578.2, z: 1948.1, cs: 'TEST' }, g.sky).grid; // Big Bend — 1448u from the nearest substation
      return { near, far };
    })()`);
    t.ok(res.near === 'the ERCOT grid', `grid token not live near a substation: ${JSON.stringify(res)}`);
    t.ok(!res.far, `grid token live 1448u from the nearest substation: ${JSON.stringify(res)}`);
  });
}
