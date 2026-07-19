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
      g.trains.onNamed = (n) => { window.__named = n; };
      const tr = g.trains.startNamed('laredo');
      const [x, z] = g.trains.at(tr.rail, tr.s);
      return { s: tr.s, inTx: g.inTexas(x, z), name: tr.named, locos: tr.cars.filter((c) => c.type === 'loco').length + 1 };
    })()`);
    t.ok(t0.inTx === false, 'forced Interchange should start south of the river');
    t.ok(t0.name === 'the Tex-Mex Interchange' && t0.locos === 2, `consist wrong: ${JSON.stringify(t0)}`);
    // no day arg — schedule idle, only the forced train moves
    await t.step(14, 'g.trains.update(dt, g.player.pos.x, g.player.pos.z)');
    const t1 = await t.ev(`(() => {
      const tr = g.trains.trains.find((x) => x.named);
      const [x, z] = g.trains.at(tr.rail, tr.s);
      return { s: tr.s, inTx: g.inTexas(x, z), toast: window.__named ?? null };
    })()`);
    t.ok(t1.s - t0.s > 14 * 16 * 0.8, `advanced ${(t1.s - t0.s).toFixed(1)} u in 14 s — expected ~224`);
    t.ok(t1.inTx === true, 'Interchange never made it into Texas');
    t.ok(t1.toast === 'the Tex-Mex Interchange', `named toast: ${t1.toast}`);
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
}
