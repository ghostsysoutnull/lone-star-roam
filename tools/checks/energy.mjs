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

  await t.check('fairways: the corpus sea route runs the baked through-channels (Sea W1 heir of the leg system)', async () => {
    // fairwayLegs retired with the LANE — the corpus approach route now owns
    // the join. The two through-channels must lie on the route; the side
    // canals (Viola, Tule Lake, Industrial) legitimately sit off it.
    const res = await t.ev(`(() => {
      const route = g.GEO.sea.routes.find((r) => r.id === 'corpus');
      const distTo = ([x, z]) => Math.min(...route.pts.map(([px, pz], i) => {
        if (!i) return Infinity;
        const [ax, az] = route.pts[i - 1], dx = px - ax, dz = pz - az, L2 = dx * dx + dz * dz || 1;
        const t2 = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        return Math.hypot(x - (ax + dx * t2), z - (az + dz * t2));
      }));
      const near = (name) => {
        const f = g.GEO.energy.fairways.find((f) => f.name === name);
        return Math.min(...f.pts.map(distTo));
      };
      const tanker = g.maritime.ships.find((s) => s.route?.id === 'corpus');
      return { rincon: near('Rincon Canal'), ship: near('Corpus Christi Ship Channel'), tanker: !!tanker, type: tanker?.type };
    })()`);
    t.ok(res.rincon < 10, `Rincon Canal ${res.rincon.toFixed(1)}u off the corpus route (must be < 10)`);
    t.ok(res.ship < 10, `CC Ship Channel ${res.ship.toFixed(1)}u off the corpus route (must be < 10)`);
    t.ok(res.tanker && res.type === 'tanker', `corpus route ship missing or wrong kind (${res.type})`);
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
    // unnamed minor: silent — no announcer entry at all. Must not sit near a
    // GEO.sea route: a passing ship's own identity toast (maritime.js
    // SHIP_TOAST_R = 60u) shares the same #toast surface and would fire
    // independently of this check, breaking the silence assertion on a
    // check defect, not a production bug — 120u margin covers ship drift
    // during the 1.2 s wait.
    const dark = await t.ev(`(() => {
      const distToSeg = (px, pz, [ax, az], [bx, bz]) => {
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
        return Math.hypot(px - (ax + u * dx), pz - (az + u * dz));
      };
      const nearRoute = (x, z) => g.GEO.sea.routes.some((r) => {
        for (let i = 1; i < r.pts.length; i++)
          if (distToSeg(x, z, r.pts[i - 1], r.pts[i]) <= 120) return true;
        return false;
      });
      return g.GEO.energy.platforms.find((p) => !p.name && !p.operator && !nearRoute(p.x, p.z));
    })()`);
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

  // --- W6: energy jobs — offers reference live site ids; the oversize blade
  // haul's ×1.5 is a speed-over-time verdict (one burst over the cap kills it,
  // the charging-deer lesson shape); fast-travel stays locked mid-haul.

  await t.check('W6 board: 3 energy offers, one per type, every site id resolving in HEROES', async () => {
    const res = await t.ev(`(() => {
      const energy = g.missions.offers.filter((o) => o.kind === 'energy');
      const ids = new Set(g.energy.heroes.map((h) => h.id));
      const badSite = energy.filter((o) =>
        (o.siteFrom && !ids.has(o.siteFrom)) || (o.siteTo && !ids.has(o.siteTo))).length;
      const blade = energy.find((o) => o.type === 'blade');
      return { types: energy.map((o) => o.type).sort(), badSite,
               bladeCap: blade?.cap ?? null, othersCapped: energy.some((o) => o.type !== 'blade' && o.cap != null) };
    })()`);
    t.ok(res.types.join(',') === 'blade,crude,fuel', `energy offer types: ${res.types}`);
    t.ok(res.badSite === 0, `${res.badSite} offers reference a site id missing from HEROES`);
    t.ok(res.bladeCap === 30, `blade cap is ${res.bladeCap}, want 30`);
    t.ok(!res.othersCapped, 'a non-oversize energy offer carries a speed cap');
  });

  await t.check('W6 crude: forceEnergy injects site→site; pickup auto-loads at parked-truck distance, off-axis', async () => {
    const offer = await t.ev(`g.missions.forceEnergy('crude')`);
    t.ok(offer && offer.siteFrom === 'midland-tanks' && offer.siteTo === 'baytown', `pinned crude run wrong: ${JSON.stringify(offer)}`);
    // park 8.5u off the marker at an ugly diagonal, not on top of it
    const s = await t.ev(`g.missions.site('midland-tanks')`);
    await t.tp(s.x + 6, s.z - 6);
    await t.until(`g.missions.job && g.missions.job.phase === 'haul'`, 20000);
    t.ok(await t.ev('g.player.truck.userData.cargo.visible'), 'crate not visible after site load');
  });

  await t.check('W6 orphaned site id self-clears the job (city-rename lesson)', async () => {
    await t.ev(`g.missions.job.siteTo = 'retired-site'`);
    await t.until('!g.missions.job', 8000);
  });

  await t.check('W6 blade: cap tracking is continuous and monotonic — one burst is never forgotten', async () => {
    await t.ev(`g.missions.forceEnergy('blade')`);
    const from = await t.ev(`(() => { const c = g.missions.city('Corpus Christi'); return { x: c.x, z: c.z }; })()`);
    await t.tp(from.x, from.z);
    await t.until(`g.missions.job && g.missions.job.phase === 'haul'`, 20000);
    // drive the tracking rule through the real update path at forced speeds
    const tick = (spd, s) => t.step(s, `g.player.speed = ${spd}; g.missions.update(dt, g.player.pos, 'DRIVE', 0)`);
    await tick(22, 2);
    let j = await t.ev(`({ maxSpd: g.missions.job.maxSpd, capBlown: g.missions.job.capBlown, hud: g.missions.hudInfo(g.player.pos).text })`);
    t.ok(j.maxSpd >= 22 && j.maxSpd <= 30 && !j.capBlown, `under-cap leg mistracked: ${JSON.stringify(j)}`);
    t.ok(j.hud.includes('≤72 mph'), `HUD cap tag missing while under cap: "${j.hud}"`);
    await tick(34, 0.3); // one burst over the cap…
    await tick(10, 1); // …then slow and steady again
    j = await t.ev(`({ maxSpd: g.missions.job.maxSpd, capBlown: g.missions.job.capBlown, hud: g.missions.hudInfo(g.player.pos).text })`);
    t.ok(j.maxSpd >= 34 && j.capBlown, `burst forgotten after slowing down: ${JSON.stringify(j)}`);
    t.ok(j.hud.includes('bonus lost'), `HUD tag did not flip after the burst: "${j.hud}"`);
    await t.ev(`g.player.speed = 0`);
  });

  await t.check('W6 fast-travel lock holds during an energy haul', async () => {
    const { allLocked, hint } = await t.ev(`(() => {
      g.travel.tab = 'Cities'; g.travel.render();
      const btns = [...document.querySelectorAll('#travel .poi-list button')];
      return { allLocked: btns.length > 0 && btns.every((b) => b.disabled),
               hint: document.querySelector('#travel .hint').textContent };
    })()`);
    t.ok(allLocked, 'a city button stayed enabled mid-energy-haul');
    t.ok(hint.includes('Cargo aboard'), `hint: "${hint}"`);
  });

  await t.check('W6 blade with a blown cap delivers at ×1, off-axis at the wind-farm marker', async () => {
    const pay = await t.ev('g.missions.job.pay');
    const bank0 = await t.ev('g.gameplay.save.bank');
    const s = await t.ev(`g.missions.site('roscoe')`);
    await t.tp(s.x - 5, s.z + 7);
    await t.until('!g.missions.job', 20000);
    const paid = (await t.ev('g.gameplay.save.bank')) - bank0;
    const expected = Math.round(pay / 5) * 5; // on time, no steady bonus — the burst above
    t.ok(paid === expected, `paid $${paid}, expected $${expected} (pay $${pay})`);
  });

  await t.check('W6 blade held under the cap the whole haul delivers at ×1.5', async () => {
    await t.ev(`g.missions.forceEnergy('blade')`);
    const pay = await t.ev('g.missions.job.pay');
    const from = await t.ev(`(() => { const c = g.missions.city('Corpus Christi'); return { x: c.x, z: c.z }; })()`);
    await t.tp(from.x, from.z);
    await t.until(`g.missions.job && g.missions.job.phase === 'haul'`, 20000);
    const bank0 = await t.ev('g.gameplay.save.bank');
    const s = await t.ev(`g.missions.site('roscoe')`);
    await t.tp(s.x + 7, s.z + 4);
    await t.until('!g.missions.job', 20000);
    const paid = (await t.ev('g.gameplay.save.bank')) - bank0;
    const expected = Math.round((pay * 1.5) / 5) * 5;
    t.ok(paid === expected, `paid $${paid}, expected $${expected} (pay $${pay})`);
  });

  // --- turbine-sampler wave: farm-fidelity guard over windTurbinesAt ---
  // One farm-sweep evaluate, shared by the checks below (deterministic seeded
  // streams — same inputs -> identical output every run, so measurements are
  // exact and can't flake). Overlapping farm circles may double-attribute a
  // rendered site to more than one farm — acceptable, not corrected for.
  //
  // 2026-07-22 sampler rework (src/world.js, already shipped): a prepass
  // computes each overlapping farm's local expectation eLocal = density ×
  // exact circle∩chunk overlap area (circleChunkOverlap, 64-slice x-integral);
  // a contended chunk splits TURBINE_CAP proportionally to eLocal (min 1
  // share, trim-largest on oversubscription) instead of first-farm-takes-all.
  // Per-farm accepted output is bounded by stochRound(eLocal) (floor + a
  // separate `turbinefrac:` Bernoulli stream) AND its cap share — the
  // provable bound is per-farm total rendered ≤ baked count + (number of
  // chunks where that farm's eLocal ≥ 0.05). coveringChunks below mirrors
  // circleChunkOverlap exactly to compute that count independently of the
  // sweep's own output, so check 3 isn't circular.
  //
  // Bake integrity (2026-07-22 bake-clip rebake): build-energy.mjs clips
  // turbine points to the border ring before clustering, so every baked farm
  // center must pass inTexas — check 1 asserts it, and check 2 no longer
  // scopes anything out.

  let turbineSweep = null;
  await t.check('turbine fidelity: farm-sweep evaluate covers every baked farm exactly once (rendered count + independent coveringChunks)', async () => {
    turbineSweep = await t.ev(`(() => {
      const CHUNK = 260;
      // mirrors world.js circleChunkOverlap exactly — independent recompute,
      // not derived from windTurbinesAt's own output, so check 3 is a real check
      const circleChunkOverlap = (fx, fz, r, x0, z0) => {
        const xa = Math.max(x0, fx - r), xb = Math.min(x0 + CHUNK, fx + r);
        if (xb <= xa) return 0;
        const N = 64, dx = (xb - xa) / N;
        let area = 0;
        for (let i = 0; i < N; i++) {
          const x = xa + (i + 0.5) * dx, h = Math.sqrt(Math.max(0, r * r - (x - fx) * (x - fx)));
          area += Math.max(0, Math.min(z0 + CHUNK, fz + h) - Math.max(z0, fz - h)) * dx;
        }
        return area;
      };
      const farms = g.GEO.energy.windFarms;
      const results = [];
      for (const f of farms) {
        const cxMin = Math.floor((f.x - f.r) / CHUNK) - 1, cxMax = Math.floor((f.x + f.r) / CHUNK) + 1;
        const czMin = Math.floor((f.z - f.r) / CHUNK) - 1, czMax = Math.floor((f.z + f.r) / CHUNK) + 1;
        const density = f.count / (Math.PI * f.r * f.r);
        let rendered = 0, coveringChunks = 0;
        const badClear = [];
        for (let cx = cxMin; cx <= cxMax; cx++) for (let cz = czMin; cz <= czMax; cz++) {
          const baseX = cx * CHUNK, baseZ = cz * CHUNK;
          const eLocal = density * circleChunkOverlap(f.x, f.z, f.r, baseX, baseZ);
          if (eLocal >= 0.05) coveringChunks++;
          for (const s of g.windTurbinesAt(cx, cz)) {
            if (Math.hypot(s.x - f.x, s.z - f.z) <= f.r) {
              rendered++;
              if (!g.cityClear(s.x, s.z, 20)) badClear.push({ x: s.x, z: s.z });
            }
          }
        }
        results.push({ x: f.x, z: f.z, count: f.count, r: f.r, rendered, coveringChunks, badClear, inTx: g.inTexas(f.x, f.z) });
      }
      return results;
    })()`);
    t.ok(turbineSweep.length === 145, `expected 145 farms swept, got ${turbineSweep.length}`);
    t.ok(turbineSweep.every((f) => Number.isInteger(f.rendered) && f.rendered >= 0), 'a farm produced a malformed rendered count');
    const outTx = turbineSweep.filter((f) => !f.inTx);
    t.ok(outTx.length === 0, `baked farm centers outside inTexas (bake clip regressed): ${JSON.stringify(outTx.map((f) => [f.x, f.z]))}`);
  });

  await t.check('turbine fidelity: every rendered site in the sweep passes cityClear(x, z, 20) (regression guard on the generation gate)', async () => {
    const bad = turbineSweep.flatMap((f) => f.badClear);
    t.ok(bad.length === 0, `${bad.length} rendered turbine sites fail cityClear: ${JSON.stringify(bad.slice(0, 5))}`);
  });

  await t.check('turbine fidelity: no farm renders above the provable design bound (baked count + covering chunks at eLocal >= 0.05)', async () => {
    const over = turbineSweep.filter((f) => f.rendered > f.count + f.coveringChunks);
    t.ok(over.length === 0, `farms over the design bound: ${JSON.stringify(over.map((f) => ({ x: f.x, z: f.z, count: f.count, r: f.r, rendered: f.rendered, coveringChunks: f.coveringChunks })))}`);
  });

  // Check 2: no in-Texas farm renders zero, except one hardcoded, evidenced
  // exception — main-session call 2026-07-22, ruled don't-fix: placement law
  // (road clearance >=3, city clearance >=20) outranks a count-1 farm's
  // presence. (x -2203.6, z -4673.7, count 1, r 20): its whole r=20 circle
  // sits inside road/city clearance — the shipped rescue's 40 real draws in
  // the farm's center chunk found 22 road-blocked + 3 city-blocked + 0
  // lawful, and an independent 200-draw probe of the FULL circle (both
  // covering chunks, fresh `hyporescue:` stream, doesn't touch real output)
  // found 92 road-blocked + 17 city-blocked + 0 lawful. No sampler fix can
  // seat a turbine here without loosening a placement gate. The exception is
  // keyed by coordinates (not a farm object identity or a count/index), so a
  // future bake reshuffle can't silently widen it to the wrong farm.
  const TURBINE_ZERO_EXCEPTIONS = [[-2203.6, -4673.7]]; // [x, z] — see comment above
  const isExcepted = (f) => TURBINE_ZERO_EXCEPTIONS.some(([ex, ez]) => Math.abs(f.x - ex) < 0.05 && Math.abs(f.z - ez) < 0.05);

  await t.check('turbine fidelity: no farm renders zero turbines, except the one evidenced legality-exhausted exception (all baked centers are in-Texas since the bake-clip rebake)', async () => {
    const zero = turbineSweep.filter((f) => f.count >= 1 && f.rendered === 0 && !isExcepted(f));
    t.ok(zero.length === 0, `unexpected in-Texas farms rendering zero: ${JSON.stringify(zero.map((f) => ({ x: f.x, z: f.z, count: f.count, r: f.r })))}`);
  });

  await t.check('turbine fidelity: the exception stays honest — the excepted farm actually DOES render zero (self-cleaning: a future gate/data change that frees it fails this check first)', async () => {
    const excepted = turbineSweep.filter((f) => isExcepted(f));
    t.ok(excepted.length === 1, `expected exactly 1 farm to match the exception coordinates, got ${excepted.length}`);
    t.ok(excepted[0]?.rendered === 0, `exception farm now renders ${excepted[0]?.rendered} turbines — the placement-law verdict may have changed; remove the exception in TURBINE_ZERO_EXCEPTIONS`);
  });

  await t.check('turbine fidelity: statewide total + ratio spread (curiosity stats, not a pass/fail gate)', async () => {
    const total = turbineSweep.reduce((s, f) => s + f.rendered, 0);
    t.ok(total > 5000, `statewide rendered turbine total implausibly low: ${total}`);
  });
}
