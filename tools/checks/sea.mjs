// Sea-Industry W1 — the eight real ports + AIS-informed ship routes.
// Numbers-first: baked-layer shape, dressed-kit presence, ships advancing
// arc-length on their routes, announcer registration + toast, Ports log
// save/DOM round-trip. The corpus-route fairway join lives in energy.mjs
// (it guards GEO.energy.fairways); tour spots validate in debug.mjs.

export default async function sea(t) {
  await t.check('baked sea layer loads and maritime rides it (LANE retired)', async () => {
    const res = await t.ev(`(() => {
      const routes = g.maritime.routes;
      const trunk = g.maritime.trunk;
      const [lx, lz] = g.maritime.laneAt(g.maritime.len / 2);
      const onTrunk = Math.min(...trunk.pts.map(([px, pz], i) => {
        if (!i) return Infinity;
        const [ax, az] = trunk.pts[i - 1], dx = px - ax, dz = pz - az, L2 = dx * dx + dz * dz || 1;
        const tt = Math.max(0, Math.min(1, ((lx - ax) * dx + (lz - az) * dz) / L2));
        return Math.hypot(lx - (ax + dx * tt), lz - (az + dz * tt));
      }));
      return {
        baked: g.GEO.sea.routes.length, ports: g.GEO.sea.ports.length,
        routes: routes.length, lens: routes.every((r) => r.len > 0 && r.cum.length === r.pts.length),
        trunk: !!trunk, onTrunk, legsGone: g.maritime.fairwayLegs === undefined,
      };
    })()`);
    t.ok(res.baked === 6 && res.routes === 6, `6 baked routes expected (baked ${res.baked}, built ${res.routes})`);
    t.ok(res.ports === 8, `8 baked ports expected, got ${res.ports}`);
    t.ok(res.lens, 'every route needs a full arc-length table');
    t.ok(res.trunk, 'no trunk route — rotors.js CG patrol has nothing to ride');
    t.ok(res.onTrunk < 0.1, `laneAt(len/2) sits ${res.onTrunk.toFixed(2)}u off the trunk polyline`);
    t.ok(res.legsGone, 'fairwayLegs still present — the LANE-era leg system should be retired');
  });

  await t.check('the eight ports stand dressed: one merged kit each, work lights instanced', async () => {
    const res = await t.ev(`(() => {
      const kits = g.GEO.sea.ports.map((p) => {
        const mesh = g.scene.getObjectByName('port:' + p.id);
        if (!mesh) return { id: p.id, missing: true };
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        return { id: p.id, verts: mesh.geometry.attributes.position.count,
          off: Math.hypot(cx - p.x, cz - p.z), colored: !!mesh.geometry.attributes.color };
      });
      const glows = g.scene.children.filter((c) => c.isInstancedMesh && c.material === g.maritime.workGlow);
      return { kits, glowCounts: glows.map((i) => i.count) };
    })()`);
    for (const k of res.kits) {
      t.ok(!k.missing, `port kit missing: ${k.id}`);
      if (k.missing) continue;
      t.ok(k.verts > 200, `${k.id} kit suspiciously thin (${k.verts} verts)`);
      t.ok(k.off < 25, `${k.id} kit centered ${k.off.toFixed(1)}u from its anchor`);
      t.ok(k.colored, `${k.id} kit not vertex-colored (merged-kit contract)`);
    }
    t.ok(res.glowCounts.includes(16), `port work-light instanced mesh should carry 16 spots (got ${res.glowCounts.join(',')})`);
  });

  await t.check('seven route ships, each the right kind for its port, all under way in water (cutters excluded)', async () => {
    const before = await t.ev(`g.maritime.ships.filter((s) => s.route && s.type !== 'cutter').map((s) => ({ id: s.route.id, type: s.type, s: s.s, len: s.route.len }))`);
    t.ok(before.length === 7, `7 route ships expected (3 trunk + 4 approaches), got ${before.length}`);
    const cutterCount = await t.ev(`g.maritime.ships.filter((s) => s.type === 'cutter').length`);
    t.ok(cutterCount === 2, `cutters must be excluded from the cargo-ship count — expected 2 cutters total, counted ${cutterCount}`);
    const byRoute = {};
    for (const s of before) (byRoute[s.id] ??= []).push(s.type);
    t.ok((byRoute.houston ?? []).includes('container'), `houston approach wants a container ship (${byRoute.houston})`);
    t.ok((byRoute.sabine ?? []).includes('tanker'), `sabine approach wants a tanker (${byRoute.sabine})`);
    t.ok((byRoute.corpus ?? []).includes('tanker'), `corpus approach wants a tanker (${byRoute.corpus})`);
    t.ok((byRoute.freeport ?? []).includes('chemical'), `freeport approach wants a chemical carrier (${byRoute.freeport})`);
    t.ok((byRoute.trunk ?? []).length === 3 && byRoute.trunk.includes('bulk'), `trunk wants 3 ships incl. a bulker (${byRoute.trunk})`);
    await t.step(4, 'g.maritime.update(dt, g.clock.elapsedTime);');
    const after = await t.ev(`g.maritime.ships.filter((s) => s.route && s.type !== 'cutter').map((s) => ({ s: s.s, len: s.route.len, x: s.g.position.x, z: s.g.position.z }))`);
    for (const [i, a] of after.entries()) {
      const moved = Math.abs(a.s - before[i].s);
      t.ok(moved > 4, `${before[i].id} ${before[i].type} barely moved: ${moved.toFixed(1)}u over 4s (speed >= 2.2 expected; pingpong turnarounds move less but never this little)`);
      t.ok(a.s >= 0 && a.s <= a.len + 0.01, `${before[i].id} ship escaped its route: s=${a.s.toFixed(1)} of ${a.len.toFixed(1)}`);
    }
    const wet = await t.ev(`g.maritime.ships.filter((s) => s.route && s.type !== 'cutter').every((s) => g.boatableAt(s.g.position.x, s.g.position.z))`);
    t.ok(wet, 'a route ship is sitting on dry land — route/water contract broken');
  });

  await t.check('announcer: all eight ports registered, HUD toast on approach (Brownsville)', async () => {
    const reg = await t.ev(`g.GEO.sea.ports.filter((p) => g.energy.sites.some((s) => s.label.includes(p.name) && s.label.includes(p.info))).length`);
    t.ok(reg === 8, `${reg}/8 ports registered with the energy announcer`);
    // Brownsville: no baked refinery, and no marina site (its harbor is not
    // game water) — the port site can't lose the nearest-wins toast race
    const p = await t.ev(`g.GEO.sea.ports.find((p) => p.id === 'brownsville')`);
    await t.tp(p.x + 15, p.z); // inside the 25u ring, off the kit itself
    await t.until(`document.getElementById('toast').textContent.includes('Port of Brownsville')`, 8000); // energy.update runs at HUD cadence in the real loop
    const toast = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(toast.includes('Port of Brownsville'), `approach toast reads "${toast}" — expected the Brownsville announce`);
  });

  await t.check('Ports log: stamps at the wharf apron, dedups, additive save key, DOM totals', async () => {
    const totals = await t.ev(`({ total: document.getElementById('total-ports').textContent, isArray: Array.isArray(g.gameplay.save.ports) })`);
    t.ok(totals.total === '8', `total-ports span reads "${totals.total}" — must be filled from GEO.sea.ports at boot`);
    t.ok(totals.isArray, 'save.ports missing — the additive key never initialized');
    const p = await t.ev(`g.GEO.sea.ports.find((p) => p.id === 'texascity')`);
    await t.tp(p.x + 12, p.z + 12);
    // save mutates in energy.update; #score-ports refreshes on the HUD's own
    // throttled tick — poll both so neither lags the assertion below.
    await t.until(`g.gameplay.save.ports.includes('texascity') && document.getElementById('score-ports').textContent === String(g.gameplay.save.ports.length)`, 8000);
    const logged = await t.ev(`({ has: g.gameplay.save.ports.includes('texascity'), n: g.gameplay.save.ports.length, score: document.getElementById('score-ports').textContent })`);
    t.ok(logged.has, 'parking at the wharf did not stamp the Ports log');
    t.ok(logged.score === String(logged.n), `score-ports DOM (${logged.score}) out of sync with save (${logged.n})`);
    const dedup = await t.ev(`(() => {
      const n0 = g.gameplay.save.ports.length;
      g.gameplay.logPort('texascity', 'Port of Texas City', 8, 'again');
      return { n0, n1: g.gameplay.save.ports.length };
    })()`);
    t.ok(dedup.n0 === dedup.n1, `logPort deduplication failed: ${dedup.n0} -> ${dedup.n1}`);
  });

  // --- Sea-Industry W2: identity, placards, VHF, cutters, the shrimp fleet ---

  await t.check('W2 identity: 19 unique vessel names, cargo orig/dest, cutter/shrimper naming', async () => {
    const res = await t.ev(`(() => {
      const ports = g.GEO.sea.ports.map((p) => p.name);
      const fishing = ['Galveston', 'Palacios', 'Aransas Pass', 'Port Isabel', 'Brownsville'];
      const all = [...g.maritime.ships, ...g.maritime.shrimpers];
      const names = all.map((s) => s.id.name);
      const cargo = g.maritime.ships.filter((s) => s.type !== 'cutter');
      return {
        total: all.length,
        namesOk: names.every((n) => !!n && n.length > 0),
        unique: new Set(names).size === names.length,
        cargoOk: cargo.every((s) => s.id.orig && s.id.dest && s.id.orig !== s.id.dest && ports.includes(s.id.orig) && ports.includes(s.id.dest)),
        cutterOk: g.maritime.cutters.every((c) => c.id.name.startsWith('USCGC ')),
        shrimpOk: g.maritime.shrimpers.every((b) => fishing.includes(b.id.home)),
        bigOk: cargo.every((s) => s.id.name.startsWith('MV ') || s.id.name.startsWith('MT ')),
      };
    })()`);
    t.ok(res.total === 19, `expected 19 vessels (7 cargo + 2 cutters + 10 shrimpers), got ${res.total}`);
    t.ok(res.namesOk, 'a vessel has an empty/missing id.name');
    t.ok(res.unique, 'vessel names collide across the fleet');
    t.ok(res.cargoOk, 'a cargo ship has a bad orig/dest (missing, equal, or not a real GEO.sea.ports name)');
    t.ok(res.cutterOk, "a cutter's id.name doesn't start 'USCGC '");
    t.ok(res.shrimpOk, "a shrimper's id.home isn't one of the 5 fishing port names");
    t.ok(res.bigOk, "a cargo ship's id.name doesn't start 'MV ' or 'MT '");
  });

  await t.check('W2 placard: toast carries the forced ship\'s name + route arrow, re-arms past 90u, refires on return', async () => {
    const bolivar = [4507, 1834]; // on the houston approach, near the real entrance channel
    await t.tp(bolivar[0], bolivar[1]);
    const forced = await t.ev(`(() => {
      // force a CARGO ship specifically (not a cutter — force() also candidates
      // cutters, and the cutter placard text carries no '→'); mirrors
      // maritime.force()'s nearest-route-point search, cargo-only
      let best = null;
      for (const v of g.maritime.ships) {
        if (!v.route || v.type === 'cutter') continue;
        for (let i = 0; i < v.route.pts.length; i++) {
          const [px, pz] = v.route.pts[i];
          const d = Math.hypot(px - ${bolivar[0]}, pz - ${bolivar[1]});
          if (!best || d < best.d) best = { d, v, s: v.route.cum[i] };
        }
      }
      if (!best) return null;
      best.v.s = Math.min(best.v.route.len, Math.max(0, best.s));
      // silence every other vessel so only the forced one can toast this call
      for (const s of [...g.maritime.ships, ...g.maritime.shrimpers]) s.id.toasted = true;
      best.v.id.toasted = false;
      return { name: best.v.id.name };
    })()`);
    t.ok(forced, 'no cargo route ship near Bolivar Roads to force');
    await t.ev(`g.maritime.update(0.05, 0, g.player)`);
    await t.until(`document.getElementById('toast').textContent.includes(${JSON.stringify(forced.name)}) && document.getElementById('toast').textContent.includes('→')`, 8000);
    const toast = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(toast.includes(forced.name) && toast.includes('→'), `placard toast reads "${toast}" — expected "${forced.name}" and an arrow`);

    await t.tp(bolivar[0] + 300, bolivar[1]);
    await t.ev(`g.maritime.update(0.05, 0, g.player)`);
    const rearmed = await t.ev(`[...g.maritime.ships, ...g.maritime.shrimpers].find((s) => s.id.name === ${JSON.stringify(forced.name)}).id.toasted`);
    t.ok(rearmed === false, 'forced ship\'s toasted flag did not re-arm past the 90u rearm radius');

    await t.tp(bolivar[0], bolivar[1]);
    await t.ev(`g.maritime.update(0.05, 0, g.player)`);
    const retoasted = await t.ev(`[...g.maritime.ships, ...g.maritime.shrimpers].find((s) => s.id.name === ${JSON.stringify(forced.name)}).id.toasted`);
    t.ok(retoasted === true, 'forced ship did not re-toast on second approach');
  });

  await t.check('W2 VHF: forceChatter fills every token, fires onChatter with a voice, sets cooldown + floor', async () => {
    await t.tp(4507, 1834);
    const res = await t.ev(`(() => {
      window.__origOnChatter = g.maritime.onChatter;
      window.__vhfCapture = null;
      g.maritime.onChatter = (line, voice) => { window.__vhfCapture = { line, voice }; window.__origOnChatter?.(line, voice); };
      const s = g.maritime.force(g.player.pos.x, g.player.pos.z);
      g.maritime.update(0.05, 0, null); // reposition the forced vessel onto its new arc-length s — no player, so the real placard/VHF pass stays quiet
      const line = g.maritime.forceChatter(g.player.pos.x, g.player.pos.z);
      return { line, capture: window.__vhfCapture, chatT: s?.id.chatT, floor: g.maritime.vhfFloor };
    })()`);
    t.ok(res.line, 'forceChatter returned nothing');
    t.ok(!res.line.includes('{'), `unfilled VHF token: "${res.line}"`);
    t.ok(res.capture && res.capture.line === res.line, 'onChatter hook did not capture the forced line');
    t.ok(res.capture && res.capture.voice && typeof res.capture.voice.p === 'number' && typeof res.capture.voice.r === 'number',
      `captured voice missing {p,r}: ${JSON.stringify(res.capture?.voice)}`);
    t.ok(res.chatT > 0, `forced vessel's chatT did not advance: ${res.chatT}`);
    t.ok(res.floor > 0, `vhfFloor did not raise after forceChatter: ${res.floor}`);
    await t.ev(`g.maritime.onChatter = window.__origOnChatter`);
  });

  await t.check('W2 cutters: 2 on real routes (one trunk), boatable, pingponging like any ship', async () => {
    const before = await t.ev(`g.maritime.cutters.map((c) => ({ kind: c.route.kind, s: c.s, len: c.route.len, x: c.g.position.x, z: c.g.position.z, wet: !!g.boatableAt(c.g.position.x, c.g.position.z) }))`);
    t.ok(before.length === 2, `expected 2 cutters, got ${before.length}`);
    t.ok(before.some((c) => c.kind === 'trunk'), 'no cutter rides the trunk route');
    for (const [i, c] of before.entries()) t.ok(c.wet, `cutter ${i} sitting on dry land: (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
    await t.step(4, 'g.maritime.update(dt, 0);');
    const after = await t.ev(`g.maritime.cutters.map((c) => ({ s: c.s, len: c.route.len }))`);
    for (const [i, a] of after.entries()) {
      const moved = Math.abs(a.s - before[i].s);
      t.ok(moved > 4, `cutter ${i} barely moved: ${moved.toFixed(1)}u over 4s`);
      t.ok(a.s >= 0 && a.s <= a.len + 0.01, `cutter ${i} escaped its route: s=${a.s.toFixed(1)} of ${a.len.toFixed(1)}`);
    }
  });

  await t.check('W2 joint moment: cgMeet anchors a flying Coast Guard heli over its cutter, hover tracks it', async () => {
    await t.tp(4034, 2576); // trunk mid
    await t.ev(`g.debug.actions.cgMeet()`);
    const staged = await t.ev(`(() => {
      const c = g.heli.candidates.find((k) => k.kind === 'coastguard' && k.flying);
      if (!c) return null;
      return { hoverT: c.hoverT, hasAnchor: !!c.anchor, anchorIsCutter: g.maritime.cutters.includes(c.anchor) };
    })()`);
    t.ok(staged, 'no flying coastguard heli candidate after cgMeet');
    t.ok(staged.hoverT > 0, `hoverT not staged: ${staged.hoverT}`);
    t.ok(staged.hasAnchor && staged.anchorIsCutter, 'candidate anchor is not one of maritime.cutters');
    await t.step(3, 'g.heli.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);');
    const tracked = await t.ev(`(() => {
      const c = g.heli.candidates.find((k) => k.kind === 'coastguard' && k.flying);
      if (!c || !c.anchor) return null;
      return { d: Math.hypot(c.x - c.anchor.g.position.x, c.z - c.anchor.g.position.z) };
    })()`);
    t.ok(tracked, 'coastguard candidate lost its anchor mid-hover');
    t.ok(tracked.d <= 45, `hover drifted ${tracked.d.toFixed(1)}u from its anchor cutter`);
  });

  await t.check('W2 shrimp fleet data: 10 boats (2/port), every transit-path point on real gulf water', async () => {
    const res = await t.ev(`(() => {
      const byPort = {};
      const dry = [];
      for (const b of g.maritime.shrimpers) {
        byPort[b.port.id] = (byPort[b.port.id] ?? 0) + 1;
        for (const [px, pz] of b.path.pts) {
          const w = g.boatableAt(px, pz);
          if (!w || w.kind !== 'gulf') dry.push({ port: b.port.id, x: px, z: pz });
        }
      }
      return { total: g.maritime.shrimpers.length, byPort, dry };
    })()`);
    t.ok(res.total === 10, `expected 10 shrimp boats, got ${res.total}`);
    for (const [id, n] of Object.entries(res.byPort)) t.ok(n === 2, `port ${id} has ${n} boats, expected 2`);
    t.ok(res.dry.length === 0, `dry transit-path point(s): ${JSON.stringify(res.dry)}`);
  });

  // the double-translation bug: hull/cabin/mast geometries once carried a
  // baked .translate() AND the same offset again in their per-instance
  // matrix — pins the fix numerically (origin-centered geometry, offset
  // lives only in the matrix). rig is the one exception: its boom keeps a
  // baked translate(0, 1.2, 0) as the outrigger's rotation pivot.
  await t.check('W2 shrimp kit geometry: hull/cabin/mast/glow origin-centered, rig pivots at its base', async () => {
    const res = await t.ev(`(() => {
      const want = { hull: [0, 0, 0], cabin: [0, 0, 0], mast: [0, 0, 0], glow: [0, 0, 0], rig: [0, 1.2, 0] };
      const out = {};
      for (const [name, geo] of Object.entries(want)) {
        const g2 = g.maritime.shrimpMeshes[name].geometry;
        g2.computeBoundingBox();
        const bb = g2.boundingBox;
        out[name] = { center: [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2], want: geo };
      }
      return out;
    })()`);
    for (const [name, { center, want }] of Object.entries(res)) {
      const d = Math.hypot(center[0] - want[0], center[1] - want[1], center[2] - want[2]);
      t.ok(d < 0.05, `${name} bbox center is (${center.map((v) => v.toFixed(3))}), expected (${want}) ±0.05 — double-translation regression?`);
    }
  });

  await t.check('W2 shrimp cycle: night sends the fleet home, day sends it out (staged, hermetic)', async () => {
    await t.ev(`(() => { g.sky.t = 0.95; for (const b of g.maritime.shrimpers) { b.p = 0.4; b.r = 0; b.working = false; } })()`);
    await t.step(10, 'g.maritime.updateShrimpers(dt, 0);');
    const afterNight = await t.ev(`({ ps: g.maritime.shrimpers.map((b) => b.p), allIdle: g.maritime.shrimpers.every((b) => !b.working), n: g.maritime.workingShrimpers().length })`);
    for (const [i, p] of afterNight.ps.entries()) t.ok(p < 0.4, `boat ${i}'s p did not decrease homeward at night: ${p}`);
    t.ok(afterNight.allIdle, 'a boat is still marked working at night');
    t.ok(afterNight.n === 0, `workingShrimpers() should be empty at night, got ${afterNight.n}`);

    await t.ev(`(() => { g.sky.t = 0.5; for (const b of g.maritime.shrimpers) { b.p = 0.4; b.r = 0; } })()`);
    await t.step(10, 'g.maritime.updateShrimpers(dt, 0);');
    const afterDay = await t.ev(`g.maritime.shrimpers.map((b) => b.p)`);
    for (const [i, p] of afterDay.entries()) t.ok(p > 0.4, `boat ${i}'s p did not increase outbound by day: ${p}`);
  });

  await t.check('W2 forceShrimpDay: fleet snaps onto its grounds in working trim', async () => {
    const res = await t.ev(`(() => {
      g.sky.t = 0.5; // day window — 'out' stays true so working doesn't unwind on this tick
      const n = g.maritime.forceShrimpDay();
      g.maritime.updateShrimpers(0.05, 0);
      const boats = g.maritime.shrimpers.map((b) => {
        const [gx, gz] = b.path.pts[b.path.pts.length - 1];
        return { working: b.working, d: Math.hypot(b.g.position.x - gx, b.g.position.z - gz) };
      });
      return { n, boats, working: g.maritime.workingShrimpers().length };
    })()`);
    t.ok(res.n === 10, `forceShrimpDay returned ${res.n}, expected 10`);
    for (const [i, b] of res.boats.entries()) {
      t.ok(b.working, `boat ${i} not marked working after forceShrimpDay`);
      t.ok(b.d < 14, `boat ${i} is ${b.d.toFixed(1)}u from its ground — expected within 14u`);
    }
    t.ok(res.working === 10, `workingShrimpers() returned ${res.working}, expected 10`);

    // trawl rate: a lap takes minutes, not seconds — a stray time-scale factor
    // once spun the fleet at ~4 rad/s and every position/state assertion above
    // still passed (Bruno caught it by eye on the tour, 2026-07-23)
    const a0 = await t.ev(`g.maritime.shrimpers.map((b) => b.trawlA)`);
    await t.step(4, 'g.maritime.updateShrimpers(dt, 0);');
    const a1 = await t.ev(`g.maritime.shrimpers.map((b) => b.trawlA)`);
    for (let i = 0; i < a0.length; i++) {
      const rate = (a1[i] - a0[i]) / 4;
      t.ok(rate > 0.005 && rate < 0.12, `boat ${i} trawl rate ${rate.toFixed(3)} rad/s — expected slow circling (0.005–0.12)`);
    }
  });

  // moored-trim convergence needs several seconds of real easing (k = dt*0.8
  // per tick in updateShrimpers) — a single 0.05s tick can't close tens of
  // units of gap, so this drives the ease to steady state rather than one
  // literal frame (mechanical test-parameter call, not a contract change)
  await t.check('W2 moored trim: an idle fleet eases back onto its seeded mooring spot', async () => {
    await t.ev(`(() => { g.sky.t = 0.95; for (const b of g.maritime.shrimpers) { b.p = 0; b.r = 0; } })()`);
    await t.step(8, 'g.maritime.updateShrimpers(dt, 0);');
    const dists = await t.ev(`g.maritime.shrimpers.map((b) => Math.hypot(b.g.position.x - b.moorX, b.g.position.z - b.moorZ))`);
    for (const [i, d] of dists.entries()) t.ok(d < 6, `boat ${i} is ${d.toFixed(1)}u from its mooring spot after easing home`);
  });

  await t.check('W2 fleet placards: parking at a working shrimp boat\'s ground toasts "shrimp boat"', async () => {
    await t.ev(`(g.sky.t = 0.5, g.maritime.forceShrimpDay())`);
    const gx = await t.ev(`(() => { const b = g.maritime.shrimpers.find((b) => b.port.id === 'galveston'); return b.path.pts[b.path.pts.length - 1]; })()`);
    await t.tp(gx[0], gx[1]);
    await t.step(1, 'g.maritime.update(dt, 0, g.player);');
    await t.until(`document.getElementById('toast').textContent.includes('shrimp boat')`, 8000);
    const toast = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(toast.includes('shrimp boat'), `toast reads "${toast}" — expected a shrimp-boat placard`);
  });
}
