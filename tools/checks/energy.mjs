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

  await t.check('refineries: all 22 real Texas refineries baked', async () => {
    const n = await t.ev(`g.GEO.energy.refineries.length`);
    t.ok(n === 22, `expected 22 refineries, got ${n}`);
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

  await t.check('gas flares: shared flame material gates on ATMOS.night (0 by day)', async () => {
    await t.setDay();
    await t.wait(0.4); // scenery.update drives the gate in the real loop
    const day = await t.ev('g.scenery.flareMat.opacity');
    t.ok(day < 0.15, `flare flame lit in daylight: ${day}`);
    await t.setNight();
    await t.wait(0.4);
    const night = await t.ev('({ o: g.scenery.flareMat.opacity, fog: g.scenery.flareMat.fog })');
    t.ok(night.o > 0.6, `flare flame dark at night: ${night.o}`);
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

  await t.check('wind heroes: Roscoe, Horse Hollow, and the coastal (Papalote) farm all log on arrival (road clearance covered by the generic hero sweep above)', async () => {
    const ids = await t.ev(`g.energy.heroes.filter((h) => h.kind === 'windfarm').map((h) => h.id)`);
    t.ok(ids.length === 3, `expected 3 wind heroes, got ${ids.length}`);
    for (const id of ['roscoe', 'horsehollow', 'papalote']) t.ok(ids.includes(id), `missing wind hero id: ${id}`);
    await t.ev(`g.gameplay.save.energy = []`);
    const roscoe = await t.ev(`g.energy.heroes.find((h) => h.id === 'roscoe')`);
    await t.tp(roscoe.at[0], roscoe.at[1]);
    await t.until(`g.gameplay.save.energy.includes('roscoe')`, 6000);
  });
}
