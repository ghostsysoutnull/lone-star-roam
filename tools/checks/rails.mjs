// Rails W1 — operator surfacing: liveries from the baked operator field,
// commuter passenger sets (TRE/TEXRail; DART is real-or-absent), rails on the
// map layer, and the deterministic force hook (lights.mjs leans on it too).
// The random-fallback loco path is dormant in Texas data — every rail passing
// the freight filter carries UP/BNSF/CPKC — and wakes with W3 band rails.

// mid-vertex of an eligible rail for a given operator, found in live data so
// a rebake never stales this suite
const pick = (op) => `(() => {
  const r = g.trains.rails.find((r) => r.operator === '${op}' &&
    Math.max(r.maxX - r.minX, r.maxZ - r.minZ) > 350);
  if (!r) return null;
  const p = r.pts[(r.pts.length / 2) | 0];
  return { x: p[0], z: p[1] };
})()`;

// clear the roster, force at the player, return the interesting facts
const FORCE = `(() => {
  g.trains.trains.length = 0;
  const tr = g.trains.force(g.player.pos.x, g.player.pos.z);
  return tr && {
    op: tr.rail.operator, commuter: tr.rail.commuter, loco: tr.locoColor,
    n: tr.cars.length, types: [...new Set(tr.cars.map((c) => c.type))].sort(),
    carColor: tr.cars[0].color, s: tr.s,
  };
})()`;

export default async function rails(t) {
  await t.check('freight locos wear their operator livery (UP / BNSF / CPKC)', async () => {
    for (const op of ['Union Pacific Railroad', 'BNSF Railway', 'CPKC']) {
      const spot = await t.ev(pick(op));
      t.ok(spot, `no eligible ${op} rail in data`);
      await t.tp(spot.x + 2.5, spot.z - 1.5, 'DRIVE'); // parked beside, not on, the track
      const got = await t.ev(FORCE);
      const want = await t.ev(`g.trains.LIVERY['${op}']`);
      t.ok(got && got.op === op, `${op}: forced train landed on ${got && got.op}`);
      t.ok(got.loco === want, `${op}: loco 0x${got.loco.toString(16)} != livery 0x${want.toString(16)}`);
      t.ok(!got.commuter && got.n >= 14 && !got.types.includes('coach'),
        `${op}: expected a freight consist, got ${JSON.stringify(got)}`);
    }
  });

  await t.check('TRE runs a short passenger set in TRE livery, never freight', async () => {
    const spot = await t.ev(`(() => {
      let best = null, be = 0;
      for (const r of g.trains.rails) {
        if (r.operator !== 'Trinity Railway Express') continue;
        const e = Math.max(r.maxX - r.minX, r.maxZ - r.minZ);
        if (e > be) { be = e; best = r; }
      }
      const p = best.pts[(best.pts.length / 2) | 0];
      return { x: p[0], z: p[1] };
    })()`);
    await t.tp(spot.x + 1.5, spot.z + 2, 'DRIVE');
    const got = await t.ev(FORCE);
    const want = await t.ev(`g.trains.LIVERY['Trinity Railway Express']`);
    t.ok(got && got.op === 'Trinity Railway Express', `landed on ${got && got.op}`);
    t.ok(got.commuter && got.types.length === 1 && got.types[0] === 'coach',
      `expected coaches only, got ${JSON.stringify(got.types)}`);
    t.ok(got.n >= 3 && got.n <= 5, `commuter set length ${got.n} outside 3–5`);
    t.ok(got.loco === want && got.carColor === want,
      `set not in TRE livery: loco 0x${got.loco.toString(16)}, coach 0x${got.carColor.toString(16)}`);
  });

  await t.check('DART is real-or-absent: no livery, no commuter flag, nothing spawnable', async () => {
    const d = await t.ev(`(() => {
      const rs = g.trains.rails.filter((r) => r.operator === 'Dallas Area Rapid Transit');
      return {
        n: rs.length,
        commuter: rs.some((r) => r.commuter),
        livery: 'Dallas Area Rapid Transit' in g.trains.LIVERY,
        eligible: rs.some((r) => Math.max(r.maxX - r.minX, r.maxZ - r.minZ) > 350),
      };
    })()`);
    t.ok(d.n > 0, 'DART fragments vanished from the bake — retune this check');
    t.ok(!d.commuter && !d.livery && !d.eligible, `DART leaked into play: ${JSON.stringify(d)}`);
  });

  await t.check('both maps carry the rail layer (numeric, not pixels)', async () => {
    // W2's defrag bake merged 560 fragments into ~187 real polylines; W3 adds
    // the band rails, wide-layer only — mapStats.rails reflects the last
    // renderMapLayer call (the wide one), so it counts both
    const m = await t.ev(`({
      drawn: g.hud.mapStats.rails,
      total: g.GEO.rails.length + g.GEO.bandRails.length,
    })`);
    t.ok(m.drawn === m.total && m.total > 150, `map rails ${m.drawn} != data ${m.total}`);
  });

  await t.check('the defrag bake healed the commuter lines (TRE was 17 shreds)', async () => {
    const d = await t.ev(`(() => {
      const rs = g.trains.rails.filter((r) => r.operator === 'Trinity Railway Express');
      return { n: rs.length, ext: Math.max(...rs.map((r) => Math.max(r.maxX - r.minX, r.maxZ - r.minZ))) };
    })()`);
    t.ok(d.n < 10, `TRE still shredded: ${d.n} pieces`);
    t.ok(d.ext > 350, `TRE longest extent ${d.ext} — the full DFW run should exceed 350`);
  });

  await t.check('border spurs are baked, bridged, and shut out of random spawn', async () => {
    const d = await t.ev(`(() => {
      const spurs = g.trains.rails.filter((r) => r.spur);
      return spurs.map((r) => ({
        spur: r.spur, op: r.operator, bridge: r.bridge,
        southInTx: g.inTexas(r.pts[0][0], r.pts[0][1]),
        northInTx: g.inTexas(r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1]),
      }));
    })()`);
    t.ok(d.length === 2 && d.map((s) => s.spur).sort().join() === 'eaglepass,laredo',
      `spurs baked: ${JSON.stringify(d.map((s) => s.spur))}`);
    for (const s of d) {
      t.ok(s.bridge && typeof s.bridge.ang === 'number', `${s.spur}: no baked bridge point`);
      t.ok(!s.southInTx && s.northInTx, `${s.spur}: route does not span the river (${s.southInTx}→${s.northInTx})`);
    }
    // force() at the Laredo bridge must land on a mainline, never the spur
    const b = d.find((s) => s.spur === 'laredo').bridge;
    await t.tp(b.x + 3, b.z + 3, 'DRIVE');
    const got = await t.ev(FORCE);
    t.ok(got && !(await t.ev(`g.trains.trains[0].rail.spur`)), `force at the bridge landed on the spur`);
  });

  await t.check('crossing schedule is seeded per game day — deterministic, 3 slots', async () => {
    const d = await t.ev(`(() => {
      const a = g.trains.crossingTimes('laredo', 7), b = g.trains.crossingTimes('laredo', 7);
      const c = g.trains.crossingTimes('laredo', 8), z = g.trains.crossingTimes('ztrain', 7);
      return { a, b, c, z };
    })()`);
    t.ok(d.a.length === 3 && d.a.join() === d.b.join(), `same day differs: ${d.a} vs ${d.b}`);
    t.ok(d.a.join() !== d.c.join(), 'day 7 and day 8 rolled identical times');
    t.ok(d.a.join() !== d.z.join(), 'laredo and ztrain share a stream — they must not');
    t.ok(d.a.every((x, i) => x >= i / 3 && x < (i + 1) / 3), `slots not one-per-third: ${d.a}`);
  });

  await t.check('the Tex-Mex Interchange actually crosses the river (position over time)', async () => {
    const b = await t.ev(`g.trains.rails.find((r) => r.spur === 'laredo').bridge`);
    await t.tp(b.x + 4, b.z + 2, 'DRIVE');
    const t0 = await t.ev(`(() => {
      g.trains.trains.length = 0;
      window.__toasts = [];
      g.trains.onIdentity = (t) => { window.__toasts.push(t); };
      const tr = g.trains.startNamed('laredo');
      const [x, z] = g.trains.at(tr.rail, tr.s);
      return { s: tr.s, inTx: g.inTexas(x, z), name: tr.named, locos: tr.cars.filter((c) => c.type === 'loco').length + 1 };
    })()`);
    t.ok(t0.inTx === false, 'forced Interchange should start south of the river');
    t.ok(t0.name === 'the Tex-Mex Interchange' && t0.locos === 2, `consist wrong: ${JSON.stringify(t0)}`);
    // no day arg — schedule idle, only the forced train moves (an unrelated
    // random freight may still spawn+toast near the player in this window
    // now that every train identifies itself — window.__toasts collects all
    // of them, we only assert the Interchange's own line is among them)
    await t.step(14, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const t1 = await t.ev(`(() => {
      const tr = g.trains.trains.find((x) => x.named);
      const [x, z] = g.trains.at(tr.rail, tr.s);
      return { s: tr.s, inTx: g.inTexas(x, z), toasts: window.__toasts };
    })()`);
    t.ok(t1.s - t0.s > 14 * 16 * 0.8, `advanced ${(t1.s - t0.s).toFixed(1)} u in 14 s — expected ~224`);
    t.ok(t1.inTx === true, 'Interchange never made it into Texas');
    t.ok(t1.toasts.some((tx) => tx.includes('the Tex-Mex Interchange')), `named toast never fired: ${JSON.stringify(t1.toasts)}`);
  });

  await t.check('a scheduled window spawns exactly one crossing, mid-run when late', async () => {
    const d = await t.ev(`(() => {
      g.trains.trains.length = 0;
      g.trains.crossingsRun.clear();
      const r = g.trains.rails.find((x) => x.spur === 'eaglepass');
      g.player.pos.set(r.bridge.x, 0, r.bridge.z);
      const day = 11, t0 = g.trains.crossingTimes('eaglepass', day)[1];
      const mid = day + t0 + 5 / 720; // 5 game-seconds into the window
      g.trains.updateCrossings(g.player.pos.x, g.player.pos.z, mid);
      const n1 = g.trains.trains.filter((t) => t.named).length;
      const s1 = g.trains.trains.find((t) => t.named)?.s;
      g.trains.updateCrossings(g.player.pos.x, g.player.pos.z, mid + 0.001);
      return { n1, s1, n2: g.trains.trains.filter((t) => t.named).length };
    })()`);
    t.ok(d.n1 === 1 && d.n2 === 1, `window spawned ${d.n1} then ${d.n2} — want exactly 1, once`);
    t.ok(d.s1 > 5 * 16 * 0.9 + 60, `mid-window arrival not mid-run: s=${d.s1}`);
  });

  await t.check('the Interchange hops the junction onto the Laredo Sub — no dead stop in town', async () => {
    const b = await t.ev(`g.trains.rails.find((r) => r.spur === 'laredo').bridge`);
    await t.tp(b.x + 4, b.z + 2, 'DRIVE');
    await t.ev(`(g.trains.trains.length = 0, g.trains.startNamed('laredo').s)`);
    // spur len ≈ 456, spawn s ≈ 71 — 30 s at 16 u/s reaches the end and hops
    await t.step(30, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const d1 = await t.ev(`(() => {
      const tr = g.trains.trains.find((x) => x.named);
      return tr && { spur: tr.rail.spur, op: tr.rail.operator, s: tr.s };
    })()`);
    t.ok(d1, 'the Interchange retired instead of hopping');
    t.ok(!d1.spur, 'still on the spur after 30 s — junction hop never fired');
    await t.step(2, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const s2 = await t.ev(`g.trains.trains.find((x) => x.named).s`);
    t.ok(Math.abs(s2 - d1.s) > 2 * 16 * 0.8, `stopped after the hop: ds=${(s2 - d1.s).toFixed(1)}`);
  });

  await t.check('the Manifest clears the Eagle Pass Sub junction — no ping-pong stall', async () => {
    const b = await t.ev(`g.trains.rails.find((r) => r.spur === 'eaglepass').bridge`);
    await t.tp(b.x + 4, b.z + 2, 'DRIVE');
    await t.ev(`(g.trains.trains.length = 0, void g.trains.startNamed('eaglepass'))`);
    // spur ≈ 390 u, spawn s ≈ 71: 26 s reaches the spur end and hops; keep the
    // player near the loco so the despawn law never fires during the run
    await t.step(26, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const d1 = await t.ev(`(() => {
      const tr = g.trains.trains.find((x) => x.named);
      if (!tr) return null;
      const [x, z] = g.trains.at(tr.rail, tr.s);
      g.player.pos.set(x, 0, z);
      return { spur: tr.rail.spur, s: tr.s, rail: tr.rail.name };
    })()`);
    t.ok(d1 && !d1.spur, `still on the spur (or gone) after 26 s: ${JSON.stringify(d1)}`);
    // 10 more seconds must be ~160 u of forward motion — a junction stall isn't
    await t.step(10, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const d2 = await t.ev(`(() => {
      const tr = g.trains.trains.find((x) => x.named);
      return { s: tr.s, rail: tr.rail.name };
    })()`);
    const ds = d2.rail === d1.rail ? Math.abs(d2.s - d1.s) : 10 * 16; // rail changed = another clean hop
    t.ok(ds > 10 * 16 * 0.8, `Manifest stalled near the junction: ${ds.toFixed(1)} u in 10 s`);
  });

  await t.check('an open window never teleports the train the player is watching', async () => {
    const d = await t.ev(`(() => {
      g.trains.trains.length = 0;
      g.trains.crossingsRun.clear();
      const r = g.trains.rails.find((x) => x.spur === 'laredo');
      g.player.pos.set(r.bridge.x, 0, r.bridge.z);
      const live = g.trains.startNamed('laredo');
      live.s = 200; // mid-run, player following
      const day = 21, t0 = g.trains.crossingTimes('laredo', day)[0];
      g.trains.updateCrossings(g.player.pos.x, g.player.pos.z, day + t0 + 0.001);
      return { n: g.trains.trains.filter((t) => t.named).length, s: g.trains.trains.find((t) => t.named).s };
    })()`);
    t.ok(d.n === 1 && d.s === 200, `live train disturbed by the window: ${JSON.stringify(d)}`);
  });

  await t.check('the forced Z is a BNSF double-stack on the longest main', async () => {
    const spot = await t.ev(`(() => {
      const r = g.trains.namedRails.ztrain;
      const p = r.pts[(r.pts.length / 2) | 0];
      return { x: p[0], z: p[1] };
    })()`);
    await t.tp(spot.x + 3, spot.z - 3, 'DRIVE');
    const d = await t.ev(`(() => {
      g.trains.trains.length = 0;
      const tr = g.trains.startNamed('ztrain', 0, g.player.pos.x, g.player.pos.z);
      const [x, z] = g.trains.at(tr.rail, tr.s);
      return {
        name: tr.named, op: tr.rail.operator, spur: tr.rail.spur, loco: tr.locoColor,
        types: [...new Set(tr.cars.map((c) => c.type))].sort(),
        near: Math.hypot(x - g.player.pos.x, z - g.player.pos.z),
      };
    })()`);
    const bnsf = await t.ev(`g.trains.LIVERY['BNSF Railway']`);
    t.ok(d.name === 'the Z' && d.op === 'BNSF Railway' && !d.spur, `route wrong: ${JSON.stringify(d)}`);
    t.ok(d.loco === bnsf, `Z loco 0x${d.loco.toString(16)} not BNSF orange`);
    t.ok(d.types.join() === 'loco,well', `consist types ${d.types} — want a second loco + well cars only`);
    t.ok(d.near < 80, `forced Z spawned ${d.near.toFixed(0)} u away — should start where the player is`);
  });

  await t.check('band rails join the spawn candidate list — one force-spawn per strip with track', async () => {
    const bySite = await t.ev(`(() => {
      const inPoly = (x, z, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        }
        return inside;
      };
      const stateAt = (x, z) => {
        for (const c of g.GEO.neighborCounties) if (inPoly(x, z, c.ring)) return c.state;
        return null;
      };
      const out = {};
      for (const r of g.trains.rails) {
        if (!r.band) continue;
        g.trains.arcInit(r);
        const ext = Math.max(r.maxX - r.minX, r.maxZ - r.minZ);
        if (ext <= 350 || r.len < 500) continue;
        const mid = r.pts[(r.pts.length / 2) | 0];
        const st = stateAt(mid[0], mid[1]);
        if (st && !out[st]) out[st] = { x: mid[0], z: mid[1] };
      }
      return out;
    })()`);
    for (const state of ['LA', 'AR', 'OK', 'NM']) {
      const spot = bySite[state];
      t.ok(spot, `no eligible band rail found for ${state}`);
      if (!spot) continue;
      await t.tp(spot.x + 2, spot.z + 2, 'DRIVE');
      const got = await t.ev(FORCE);
      t.ok(got, `${state}: force-spawn on band rail failed`);
      const band = await t.ev('g.trains.trains[0].rail.band');
      t.ok(band === true, `${state}: forced train landed off the band rail (band=${band})`);
    }
  });

  await t.check('nearestRail resolves band track — the placard works across the state line', async () => {
    const sample = await t.ev(`(() => {
      for (const r of g.GEO.bandRails) {
        if (!(r.operator || r.name)) continue;
        const pt = r.pts[Math.floor(r.pts.length / 2)];
        return { pt, label: [r.operator, r.name].filter((v, i, a) => v && a.findIndex((x) => x?.toLowerCase() === v.toLowerCase()) === i).join(' · ') };
      }
      return null;
    })()`);
    t.ok(sample, 'no labeled band rail found');
    await t.tp(sample.pt[0] + 2, sample.pt[1] + 2, 'WALK');
    await t.until('!!g.hud.railInfo', 8000);
    const name = await t.ev('g.hud.railInfo.name');
    t.ok(name === sample.label, `band rail placard "${name}" != OSM label "${sample.label}"`);
  });

  await t.check('the Z stays a Texas mainline — band track never wins "longest BNSF"', async () => {
    const band = await t.ev('g.trains.namedRails.ztrain?.band');
    t.ok(band === false, `Z rail band=${band} — band track stole the named route`);
  });

  await t.check('the W3 band-railroad tour spots each force a real band train', async () => {
    const spots = await t.ev(`g.debug.tours
      .find((tr) => tr.track === 'Railroads (2026-07)').waves
      .find((w) => w.wave === 'W3 — band railroads').spots`);
    t.ok(spots.length === 4, `expected 4 W3 tour spots, found ${spots.length}`);
    for (const spot of spots) {
      await t.ev(`(g.trains.trains.length = 0, g.debug.visit(${JSON.stringify(spot)}))`);
      const band = await t.ev('g.trains.trains[0]?.rail.band');
      t.ok(band === true, `${spot.label}: trainHere did not land on a band rail (band=${band})`);
    }
  });

  await t.check('a forced train moves down the line under the real loop', async () => {
    const spot = await t.ev(pick('Union Pacific Railroad'));
    await t.tp(spot.x - 3, spot.z + 3, 'DRIVE');
    const s0 = (await t.ev(FORCE)).s;
    // SPEED=16 u/s on the real rAF loop — 8 units needs ~0.5 s of sim
    await t.until(`g.trains.trains[0] && g.trains.trains[0].s - ${s0} > 8`, 10000, 250);
    const ds = await t.ev(`g.trains.trains[0].s - ${s0}`);
    t.ok(ds > 8, `train advanced ${ds} units`);
  });

  // --- Rails Ops W1: identity + chatter ------------------------------------

  await t.check('freight identity: seeded fields present, no undefined/NaN in the rendered toast', async () => {
    const spot = await t.ev(pick('BNSF Railway'));
    await t.tp(spot.x + 2.5, spot.z - 1.5, 'DRIVE');
    const d = await t.ev(`(() => {
      g.trains.trains.length = 0;
      window.__toast = null;
      g.trains.onIdentity = (t) => { window.__toast = t; };
      const tr = g.trains.force(g.player.pos.x, g.player.pos.z, 19);
      return tr && tr.id;
    })()`);
    t.ok(d, 'no freight train forced');
    t.ok(d.sym && d.cargo && Number.isFinite(d.cars) && d.orig && d.dest && d.sub && Number.isFinite(d.mp)
      && d.voice && Number.isFinite(d.voice.p) && Number.isFinite(d.voice.r), `identity fields missing: ${JSON.stringify(d)}`);
    t.ok(d.cars >= 15 && d.cars <= 40, `freight identity cars ${d.cars} outside 15–40`);
    t.ok(d.sym.includes('-19'), `sym day suffix wrong: ${d.sym}`);
    await t.step(1, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const toast = await t.ev('window.__toast');
    t.ok(toast && !/undefined|NaN|null/.test(toast), `identity toast malformed: ${toast}`);
    t.ok([d.sym, d.cargo, d.orig, d.dest, d.sub].every((f) => toast.includes(f)), `toast missing a field: ${toast}`);
  });

  await t.check('identity is deterministic across two force spawns from a reset trainSeq (simulated fresh boot)', async () => {
    const spot = await t.ev(pick('Union Pacific Railroad'));
    await t.tp(spot.x + 2.5, spot.z - 1.5, 'DRIVE');
    const d = await t.ev(`(() => {
      g.trains.trainSeq = 0; g.trains.trains.length = 0;
      const a = g.trains.force(g.player.pos.x, g.player.pos.z, 19).id;
      g.trains.trainSeq = 0; g.trains.trains.length = 0;
      const b = g.trains.force(g.player.pos.x, g.player.pos.z, 19).id;
      return { a, b };
    })()`);
    t.ok(JSON.stringify(d.a) === JSON.stringify(d.b), `identity differs across a reset trainSeq: ${JSON.stringify(d.a)} vs ${JSON.stringify(d.b)}`);
  });

  await t.check('commuter identity reads "commuter coaches" at the real 3–5 consist length', async () => {
    const spot = await t.ev(`(() => {
      let best = null, be = 0;
      for (const r of g.trains.rails) {
        if (r.operator !== 'Trinity Railway Express') continue;
        const e = Math.max(r.maxX - r.minX, r.maxZ - r.minZ);
        if (e > be) { be = e; best = r; }
      }
      const p = best.pts[(best.pts.length / 2) | 0];
      return { x: p[0], z: p[1] };
    })()`);
    await t.tp(spot.x + 1.5, spot.z + 2, 'DRIVE');
    const id = await t.ev(`(() => {
      g.trains.trains.length = 0;
      const tr = g.trains.force(g.player.pos.x, g.player.pos.z, 8);
      return tr.id;
    })()`);
    t.ok(id.commuter && id.cargo === 'commuter coaches', `commuter cargo wrong: ${JSON.stringify(id)}`);
    t.ok(id.cars >= 3 && id.cars <= 5, `commuter identity cars ${id.cars} outside the real 3–5 length`);
    t.ok(id.sym.startsWith('T-'), `commuter sym letter wrong: ${id.sym}`);
  });

  await t.check('radio chatter fires within a sim window at CHAT_R, seeded per-train voice, no malformed slot', async () => {
    const spot = await t.ev(pick('BNSF Railway'));
    await t.tp(spot.x + 2.5, spot.z - 1.5, 'DRIVE');
    const d = await t.ev(`(() => {
      g.trains.trains.length = 0;
      window.__chat = null; window.__voice = null;
      g.trains.onChatter = (text, voice) => { window.__chat = text; window.__voice = voice; };
      const tr = g.trains.force(g.player.pos.x, g.player.pos.z, 12);
      if (tr) { tr.id.chatT = 0; g.trains.chatFloor = 0; }
      return tr && tr.id;
    })()`);
    t.ok(d, 'no train forced for the chatter check');
    await t.step(1, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const chat = await t.ev('window.__chat'), voice = await t.ev('window.__voice');
    t.ok(chat && !/undefined|NaN|null/.test(chat), `chatter line malformed: ${chat}`);
    t.ok(voice && Number.isFinite(voice.p) && Number.isFinite(voice.r), `chatter voice missing: ${JSON.stringify(voice)}`);
  });

  await t.check('the weather-radio perk doubles chatter range, never gates it', async () => {
    // A hand-built dead-straight synthetic rail, not real OSM track: a real
    // consist can span kilometers and curve enough that a perpendicular offset
    // from the loco isn't actually the closest car. On a straight line every
    // trailing car shares the loco's z, so a perpendicular player offset is
    // exactly 65u from the *nearest* point of the whole consist — isolates the
    // CHAT_R/radioPerk arithmetic from real-geometry noise.
    const ok = await t.ev(`(() => {
      const rail = {
        idx: -1, pts: [[0, 0], [1000, 0]], minX: 0, maxX: 1000, minZ: -5, maxZ: 5,
        cum: null, len: 0, name: 'Test Sub', operator: 'Test Railway',
        livery: null, commuter: false, spur: null, bridge: null, band: false,
      };
      g.trains.arcInit(rail);
      g.trains.trains.length = 0;
      const cars = Array.from({ length: 18 }, () => ({ type: 'boxcar', color: 0 }));
      const id = g.trains.buildId(rail, 1, 3, cars);
      id.chatT = 0;
      g.trains.trains.push({ rail, dir: 1, s: 500, locoColor: 0xffffff, cars, id });
      g.trains.chatFloor = 0;
      g.player.pos.set(500, 0, 65); // 65u out — beyond stock CHAT_R (40), inside the perked 80
      return true;
    })()`);
    t.ok(ok, 'synthetic-rail setup failed');
    await t.ev(`(window.__chat = null, g.trains.onChatter = (t) => { window.__chat = t; }, 0)`);
    await t.step(1, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z, undefined, false)');
    const withoutPerk = await t.ev('window.__chat');
    t.ok(!withoutPerk, `chatter fired without the radio perk at 65u — CHAT_R leaked: ${withoutPerk}`);
    await t.step(1, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z, undefined, true)');
    const withPerk = await t.ev('window.__chat');
    t.ok(withPerk && !/undefined|NaN|null/.test(withPerk), `chatter did not fire with the radio perk at 65u: ${withPerk}`);
  });

  // --- Rails Ops W2: journeys ----------------------------------------------

  // A rail end where a forced freight is guaranteed to hop: force-eligible,
  // non-commuter, hopAt resolves at the +1 end, and force() at that end picks
  // this rail (its own pick loop replicated, list order + strict <, so a
  // junction vertex of the target rail can't steal the spawn). Found in live
  // data — a rebake never stales this.
  const JUNCTION = `(() => {
    const minRun = 19 * 3.3 + 20;
    const eligible = (r) => !r.spur &&
      Math.max(r.maxX - r.minX, r.maxZ - r.minZ) > (r.commuter ? 40 : 350) &&
      (g.trains.arcInit(r), r.len >= (r.commuter ? 60 : 500));
    for (const r of g.trains.rails) {
      if (!eligible(r) || r.commuter) continue;
      if (!g.trains.hopAt(r, 1, minRun)) continue;
      const [ex, ez] = r.pts[r.pts.length - 1];
      let bestR = null, bd = Infinity;
      for (const q of g.trains.rails) {
        if (!eligible(q)) continue;
        for (const p of q.pts) {
          const d = Math.hypot(p[0] - (ex + 2), p[1] - (ez + 2));
          if (d < bd) { bd = d; bestR = q; }
        }
      }
      if (bestR !== r) continue;
      return { x: ex, z: ez, idx: r.idx };
    }
    return null;
  })()`;

  await t.check('every freight journeys: a forced train hops the junction and keeps rolling', async () => {
    const j = await t.ev(JUNCTION);
    t.ok(j, 'no hoppable junction found in the baked network — retune this check');
    await t.tp(j.x + 2, j.z + 2, 'DRIVE');
    const before = await t.ev(`(() => {
      g.trains.trains.length = 0;
      const tr = window.__jt = g.trains.force(g.player.pos.x, g.player.pos.z, 19);
      return tr && { idx: tr.rail.idx, s: tr.s, len: tr.rail.len,
        dest: tr.id.dest, sym: tr.id.sym, sub: tr.id.sub, orig: tr.id.orig };
    })()`);
    t.ok(before && before.idx === j.idx, `force landed on rail ${before && before.idx}, junction scout said ${j.idx}`);
    t.ok(before.len - before.s < 4, `forced spawn not at the rail end: s=${before.s} len=${before.len}`);
    // s ≈ len−2 at 16 u/s — the hop fires within a second; 6 s proves onward motion
    await t.step(6, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const after = await t.ev(`(() => {
      const tr = window.__jt;
      if (!g.trains.trains.includes(tr)) return null;
      return { idx: tr.rail.idx, s: tr.s };
    })()`);
    t.ok(after, 'the forced train retired at the junction instead of hopping');
    t.ok(after.idx !== before.idx, 'still on the origin rail after 6 s — the generalized hop never fired');
    await t.step(2, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const a2 = await t.ev(`({ idx: window.__jt.rail.idx, s: window.__jt.s })`);
    const ds = a2.idx === after.idx ? Math.abs(a2.s - after.s) : 2 * 16; // rail changed again = still rolling
    t.ok(ds > 2 * 16 * 0.8, `train stalled after the hop: ${ds.toFixed(1)} u in 2 s`);
  });

  await t.check('the trip line stays true across the hop: dest, sym, sub all track the new rail', async () => {
    const d = await t.ev(`(() => {
      const tr = window.__jt;
      if (!tr || !g.trains.trains.includes(tr)) return null;
      const [ex, ez] = tr.rail.pts[tr.dir > 0 ? tr.rail.pts.length - 1 : 0];
      return { id: tr.id, name: tr.rail.name, operator: tr.rail.operator,
        endCity: g.nearestCity(ex, ez).city.name };
    })()`);
    t.ok(d, 'hopped train from the journey check is gone — cannot verify trip sync');
    const dd3 = (s) => s.slice(0, 3).toUpperCase();
    t.ok(d.id.dest === d.endCity, `dest "${d.id.dest}" != course end "${d.endCity}"`);
    t.ok(d.id.sub === (d.name ?? d.operator ?? 'the line'), `sub "${d.id.sub}" != current rail "${d.name}"`);
    const [letter, od, day] = d.id.sym.split('-');
    t.ok(od === dd3(d.id.orig) + dd3(d.id.dest), `sym cities "${od}" != ${dd3(d.id.orig)}${dd3(d.id.dest)}`);
    t.ok(letter.length === 1 && day === '19', `sym letter/day corrupted by the hop: ${d.id.sym}`);
    // a fresh approach re-toasts the updated identity
    await t.ev(`(() => {
      const tr = window.__jt, [x, z] = g.trains.at(tr.rail, tr.s);
      g.player.pos.set(x, 0, z);
      tr.toasted = false;
      window.__toast2 = null;
      g.trains.onIdentity = (t) => { window.__toast2 = t; };
    })()`);
    await t.step(1, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const toast = await t.ev('window.__toast2');
    t.ok(toast && toast.includes(d.id.dest) && toast.includes(d.id.sub), `post-hop toast stale: ${toast}`);
  });

  await t.check('spawn exclusivity: a burst never yields opposing or overlapping trains on one rail', async () => {
    const spot = await t.ev(pick('Union Pacific Railroad'));
    await t.tp(spot.x + 2, spot.z + 2, 'DRIVE');
    // one synchronous eval: direct spawn() calls bypass the MAX_TRAINS gate
    // (harder stress than play), and the real loop never ticks mid-burst
    const d = await t.ev(`(() => {
      g.trains.trains.length = 0;
      for (let i = 0; i < 60; i++) g.trains.spawn(g.player.pos.x, g.player.pos.z, 5);
      const byRail = new Map();
      for (const tr of g.trains.trains) {
        if (!byRail.has(tr.rail)) byRail.set(tr.rail, []);
        byRail.get(tr.rail).push(tr);
      }
      let pairs = 0, opposing = 0, overlap = 0;
      for (const list of byRail.values()) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          pairs++;
          const a = list[i], b = list[j];
          if (a.dir !== b.dir) opposing++;
          if (Math.abs(a.s - b.s) < (a.cars.length + b.cars.length + 2) * 3.3) overlap++;
        }
      }
      const n = g.trains.trains.length;
      g.trains.trains.length = 0;
      return { n, rails: byRail.size, pairs, opposing, overlap };
    })()`);
    t.ok(d.n >= 4 && d.pairs >= 1, `burst too thin to exercise exclusivity: ${JSON.stringify(d)}`);
    t.ok(d.opposing === 0, `${d.opposing} opposing pairs share a rail after the burst`);
    t.ok(d.overlap === 0, `${d.overlap} pairs spawned overlapping on one rail`);
  });

  await t.check('a commuter set terminates at end-of-line — no hop onto the freight net', async () => {
    const spot = await t.ev(`(() => {
      let best = null, be = 0;
      for (const r of g.trains.rails) {
        if (r.operator !== 'Trinity Railway Express') continue;
        const e = Math.max(r.maxX - r.minX, r.maxZ - r.minZ);
        if (e > be) { be = e; best = r; }
      }
      const p = best.pts[(best.pts.length / 2) | 0];
      return { x: p[0], z: p[1] };
    })()`);
    await t.tp(spot.x + 1.5, spot.z + 2, 'DRIVE');
    const before = await t.ev(`(() => {
      g.trains.trains.length = 0;
      const tr = window.__ct = g.trains.force(g.player.pos.x, g.player.pos.z, 8);
      if (!tr || !tr.id.commuter) return null;
      tr.s = tr.rail.len - 2; // put the set on final approach to its terminus
      const [x, z] = g.trains.at(tr.rail, tr.s);
      g.player.pos.set(x, 0, z); // watching — the hold law keeps it alive
      return { idx: tr.rail.idx, len: tr.rail.len };
    })()`);
    t.ok(before, 'no commuter set forced for the terminus check');
    await t.step(4, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const after = await t.ev(`(() => {
      const tr = window.__ct;
      if (!g.trains.trains.includes(tr)) return null;
      return { idx: tr.rail.idx, s: tr.s, op: tr.rail.operator };
    })()`);
    t.ok(after, 'watched commuter set retired at its terminus — the hold law broke');
    t.ok(after.idx === before.idx && after.op === 'Trinity Railway Express',
      `commuter set hopped off its line: ${JSON.stringify(after)}`);
    t.ok(after.s === before.len, `set not held at the buffer: s=${after.s} len=${before.len}`);
  });

  await t.check('a hop prefers the unoccupied connection over a head-on one (synthetic junction)', async () => {
    // far outside the world (x ≈ 21000) so no real rail enters the candidate
    // scan; built, tested, and torn down inside one eval so the live rAF loop
    // never ticks a bare synthetic train
    const d = await t.ev(`(() => {
      const mk = (tag, pts) => {
        let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
        for (const [x, z] of pts) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        return { idx: -1, tag, pts, minX, maxX, minZ, maxZ, cum: null, len: 0,
          name: tag, operator: 'Test Railway', livery: null, commuter: false,
          spur: null, bridge: null, band: false };
      };
      const A = mk('A', [[20000, 0], [21000, 0]]);          // heading +x into the junction
      const B = mk('B', [[21000, 0], [22000, 0]]);          // straight on (dot 1.0)
      const C = mk('C', [[21000, 10], [21800, 410]]);       // diagonal branch (dot ~0.89)
      const n0 = g.trains.rails.length;
      g.trains.rails.push(B, C);
      g.trains.arcInit(A);
      const saved = g.trains.trains;
      g.trains.trains = [{ rail: B, dir: -1, s: 500, cars: [] }]; // head-on occupant on B
      const blocked = g.trains.hopAt(A, 1, 100);
      g.trains.trains = [];
      const open = g.trains.hopAt(A, 1, 100);
      g.trains.trains = saved;
      g.trains.rails.length = n0;
      return { blocked: blocked && blocked.rail.tag, open: open && open.rail.tag };
    })()`);
    t.ok(d.blocked === 'C', `occupied straight route not avoided — hop chose ${d.blocked}, want the C branch`);
    t.ok(d.open === 'B', `with clear track the best-tangent route must win — hop chose ${d.open}, want B`);
  });

  // --- Rails Ops W3: meets --------------------------------------------------

  await t.check('the siding mesh ships: one merged ribbon, hundreds of spans', async () => {
    const d = await t.ev(`(() => {
      const m = g.scene.getObjectByName('sidings');
      return m && { verts: m.geometry.attributes.position.count, tris: m.geometry.index.count / 3 };
    })()`);
    t.ok(d, 'no mesh named "sidings" in the scene');
    // 719 spans × ≥4 ribbon cross-sections each — thousands of verts, not a stub
    t.ok(d.verts > 4000, `sidings mesh only ${d.verts} vertices — spans missing`);
  });

  await t.check('a staged meet resolves: hold + clear pass + release, chatter voiced', async () => {
    // the W3 tour spot — a feasible Baird Sub span with the player parked at
    // the span center, inside stock CHAT_R of the hold point
    await t.tp(1459.9, -1973.6, 'DRIVE');
    const staged = await t.ev(`(() => {
      const m = window.__meet = g.trains.forceMeet(g.player.pos.x, g.player.pos.z, 19);
      if (!m) return null;
      window.__mm = { minD: 1e9, chat: [] };
      g.trains.onChatter = (t) => window.__mm.chat.push(t);
      return { holdS: m.span.s1, hs: m.holder.s, os: m.opposer.s, side: m.span.side,
        hSym: m.holder.id.sym, oSym: m.opposer.id.sym, rail: m.holder.rail.name };
    })()`);
    t.ok(staged, 'forceMeet found no sided rail at the Baird tour spot');
    t.ok(staged.os - staged.hs === 230, `staged geometry off: holder ${staged.hs}, opposer ${staged.os}`);
    // every frame: tick trains, track the min distance between any two cars of
    // the pair (both consists, holder offset applied — the interpenetration
    // sentinel the spec demands)
    const BODY = `
      g.trains.update(dt, g.player.pos.x, g.player.pos.z, 19);
      const m = window.__meet;
      if (g.trains.trains.includes(m.holder) && g.trains.trains.includes(m.opposer)) {
        const pos = (tr) => { const out = []; for (let c = 0; c <= tr.cars.length; c++) {
          const s = tr.s - tr.dir * c * 3.3; if (s < 0 || s > tr.rail.len) continue;
          let [x, z, dx, dz] = g.trains.at(tr.rail, s);
          if (tr.meet && tr.meet.off) { x += -dz * tr.meet.off * tr.meet.span.side; z += dx * tr.meet.off * tr.meet.span.side; }
          out.push([x, z]); } return out; };
        const A = pos(m.holder), B = pos(m.opposer);
        for (const a of A) for (const b of B) {
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (d < window.__mm.minD) window.__mm.minD = d;
        }
      }`;
    // holder run: 60 u with the decel tail ≈ 6–7 s — sample the hold window
    await t.step(9, BODY);
    const mid = await t.ev(`(() => {
      const m = window.__meet;
      return { phase: m.holder.meet && m.holder.meet.phase, off: m.holder.meet && m.holder.meet.off,
        hs: m.holder.s, os: m.opposer.s };
    })()`);
    t.ok(mid.phase === 'hold', `holder not holding after 9 s — phase ${mid.phase}`);
    t.ok(mid.off === 3, `holder offset ${mid.off} != SIDING_OFF at hold`);
    await t.step(1, BODY);
    const mid2 = await t.ev(`({ hs: window.__meet.holder.s, os: window.__meet.opposer.s })`);
    t.ok(Math.abs(mid2.hs - mid.hs) < 0.01, `holder crept while holding: ${mid.hs} → ${mid2.hs}`);
    t.ok(mid.os - mid2.os > 12, `opposer not at track speed during the hold: ${(mid.os - mid2.os).toFixed(1)} u/s`);
    // opposer pass + 25 u clear + 3 s dwell + pull-out — generous window
    await t.step(14, BODY);
    const done = await t.ev(`(() => {
      const m = window.__meet, mm = window.__mm;
      return { meet: m.holder.meet && m.holder.meet.phase, hs: m.holder.s,
        minD: mm.minD, chat: mm.chat };
    })()`);
    t.ok(done.hs > mid2.hs + 5 || done.meet === 'dwell' || done.meet === 'out',
      `holder never released: phase ${done.meet}, s ${mid2.hs} → ${done.hs}`);
    await t.step(3, BODY);
    const end = await t.ev(`({ s: window.__meet.holder.s, meet: window.__meet.holder.meet })`);
    t.ok(end.s > done.hs + 10, `holder not back to speed after release: ${done.hs} → ${end.s}`);
    // interpenetration sentinel: the pass happened (close approach) but the
    // lateral siding offset kept daylight between the consists
    t.ok(done.minD < 8, `no close pass recorded (minD ${done.minD.toFixed(1)}) — the meet never met`);
    t.ok(done.minD > 1.85, `consists interpenetrated: min pairwise distance ${done.minD.toFixed(2)} u`);
    // the scripted three-line sequence, voiced because the player stands at the span
    const chat = done.chat.join(' | ');
    t.ok(done.chat.length >= 3, `expected the 3-line meet sequence, got ${done.chat.length}: ${chat}`);
    t.ok(chat.includes(`take the siding at`) && chat.includes(staged.hSym) && chat.includes(staged.oSym),
      `dispatcher call garbled: ${chat}`);
    t.ok(chat.includes('in the clear') && chat.includes('highball'), `sequence incomplete: ${chat}`);
    await t.ev(`(g.trains.trains.length = 0, g.trains.onChatter = null, 0)`);
  });

  await t.check('meets are sd-gated: an opposing pair on a sidingless rail never engages', async () => {
    const d = await t.ev(`(() => {
      const mk = (pts) => {
        let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
        for (const [x, z] of pts) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        return { idx: -1, pts, minX, maxX, minZ, maxZ, cum: null, len: 0,
          name: 'Test Sub', operator: 'Test Railway', livery: null,
          commuter: false, spur: null, bridge: null, band: false };
      };
      const rail = mk([[20000, 0], [21000, 0]]); // far outside the world
      g.trains.arcInit(rail);
      const id = (sym) => ({ sym, voice: { p: 1, r: 1 } });
      const saved = g.trains.trains;
      const up = { rail, dir: 1, s: 50, cars: [], id: id('UP-TEST') };
      const dn = { rail, dir: -1, s: 350, cars: [], id: id('DN-TEST') };
      g.trains.trains = [up, dn];
      g.trains.updateMeets();
      const bare = !!(up.meet || dn.meet);
      rail.sd = [{ s0: 60, s1: 100, side: 1 }]; // now a siding sits just ahead of the up train
      g.trains.updateMeets();
      const sided = up.meet && up.meet.phase === 'pull' && up.meet.holdS === 100 && !dn.meet;
      g.trains.trains = saved;
      return { bare, sided };
    })()`);
    t.ok(!d.bare, 'a meet engaged on a rail with no baked sidings — the sd gate leaked');
    t.ok(d.sided, 'with a qualifying span the up train must hold at s1 (margin rule picks it)');
  });
}
