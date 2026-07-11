// Aviation wave 1 — fields. Layout must be pure (two evals agree), pads must
// cover the real terrain under them (asserted at low-discrepancy interior
// points, not the builder's own grid), airportClear must block runway points
// and admit the surroundings, and the exclusion must hold where it matters:
// Dallas' real spawned buildings vs Love Field's footprint. The windsock and
// beacon are the live bits — wind response through real ATMOS, beacon spin
// through the real rAF loop (this suite's wiring sentinel).
//
// Wave 2 — departures. The schedule must be pure and shaped (night = tier-1
// red-eyes only); runway-in-use must be the argmax into windFrom's seeded
// wind; departures must MEASURABLY gain speed on the roll and AGL after it
// (charging-deer lesson), arrivals must lose AGL onto the pavement; storms
// ground-stop and go-around; parked flights retire only unwatched; the
// airborne cap holds; and plane-moves runs on the real rAF loop (this
// system's wiring sentinel — everything else uses steppers).

export default async function aviation(t) {
  await t.check('table shape: 20 fields, 7/9/4 by tier', async () => {
    const tiers = await t.ev(`g.AIRPORTS.map((a) => a.tier)`);
    t.ok(tiers.length === 20, `${tiers.length} airports`);
    const n = (k) => tiers.filter((x) => x === k).length;
    t.ok(n(1) === 7 && n(2) === 9 && n(3) === 4, `tiers ${n(1)}/${n(2)}/${n(3)}`);
  });

  await t.check('layout is pure: two evals byte-identical, live system matches', async () => {
    const [a, b, live] = await t.ev(
      `[JSON.stringify(g.airportLayout()), JSON.stringify(g.airportLayout()), JSON.stringify(g.airports.layout)]`);
    t.ok(a === b, 'two airportLayout() evals disagree');
    t.ok(a === live, 'live AirportSystem layout differs from a fresh eval');
  });

  await t.check('pads sit at max terrain over every footprint', async () => {
    const bad = await t.ev(`(() => {
      const out = [];
      for (const L of g.airports.layout) {
        const [A, B, , D] = L.corners;
        let worst = -1e9;
        for (let i = 0; i < 500; i++) { // low-discrepancy interior samples, not the builder's grid
          const s = (i * 0.7548776662467) % 1, q = (i * 0.5698402909981) % 1;
          const x = A[0] + (B[0] - A[0]) * s + (D[0] - A[0]) * q;
          const z = A[1] + (B[1] - A[1]) * s + (D[1] - A[1]) * q;
          worst = Math.max(worst, g.hAt(x, z) - L.padY);
        }
        if (worst > 0.25) out.push(\`\${L.id}:+\${worst.toFixed(2)}\`);
      }
      return out;
    })()`);
    t.ok(bad.length === 0, `terrain pokes through pads: ${bad.join(', ')}`);
  });

  await t.check('airportClear blocks runways, admits the world outside', async () => {
    const bad = await t.ev(`(() => {
      const out = [];
      for (const L of g.airports.layout) {
        for (const r of L.rws) {
          if (g.airportClear((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2)) out.push('mid-open:' + L.id);
          if (g.airportClear(r.x1, r.z1)) out.push('end-open:' + L.id);
        }
        const [A, , C] = L.corners, cx = (A[0] + C[0]) / 2, cz = (A[1] + C[1]) / 2;
        if (!g.airportClear(A[0] + (A[0] - cx) * 0.4, A[1] + (A[1] - cz) * 0.4)) out.push('outside-shut:' + L.id);
      }
      if (!g.airportClear(...g.AIRPORTS.find((a) => a.id === 'DAL').at)) {} else out.push('love-open');
      if (!g.airportClear(-2767, 334)) out.push('i10-shut'); // the empty I-10 test stretch stays usable
      return out;
    })()`);
    t.ok(bad.length === 0, bad.join(', '));
  });

  await t.check('a downward ray hits pavement at pad height over every runway', async () => {
    const bad = await t.ev(`(async () => {
      const T = await import('three');
      const ray = new T.Raycaster();
      const down = new T.Vector3(0, -1, 0), out = [];
      for (const L of g.airports.layout)
        for (const r of L.rws) {
          for (const f of [0.5, 0.15, 0.85]) { // mid + both ends, natural rollout spots
            const x = r.x1 + (r.x2 - r.x1) * f, z = r.z1 + (r.z2 - r.z1) * f;
            ray.set(new T.Vector3(x, L.padY + 50, z), down);
            const hit = ray.intersectObjects(g.airports.group.children, false)[0];
            if (!hit) { out.push(\`\${L.id}@\${f}:void\`); continue; }
            const y = L.padY + 50 - hit.distance;
            if (Math.abs(y - (L.padY + 0.1)) > 0.25) out.push(\`\${L.id}@\${f}:y\${y.toFixed(2)}\`);
          }
        }
      return out;
    })()`);
    t.ok(bad.length === 0, `runway surface missing/misplaced: ${bad.slice(0, 6).join(', ')}`);
  });

  await t.check('Dallas spawns real buildings, none inside Love Field', async () => {
    const dal = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Dallas'); return [c.x, c.z]; })()`);
    await t.tp(dal[0], dal[1]);
    await t.until(`g.cities.live.has('Dallas')`, 10000);
    const [total, inside] = await t.ev(`(() => {
      let inst = null;
      g.cities.live.get('Dallas').traverse((o) => { if (o.isInstancedMesh) inst = o; });
      const m = inst.instanceMatrix.array;
      let inside = 0;
      for (let i = 0; i < inst.count; i++) if (!g.airportClear(m[i * 16 + 12], m[i * 16 + 14])) inside++;
      return [inst.count, inside];
    })()`);
    t.ok(total > 100, `only ${total} Dallas buildings — exclusion check would be vacuous`);
    t.ok(inside === 0, `${inside}/${total} buildings stand on Love Field`);
  });

  await t.check('scenery and chapel sites keep off the ranch strips', async () => {
    const sss = await t.ev(`g.AIRPORTS.find((a) => a.id === 'SSS').at`);
    await t.tp(sss[0] + 25, sss[1]);
    await t.wait(0.8); // scenery chunks spawn on the next update
    const bad = await t.ev(`(() => {
      const out = [];
      for (const gr of g.scenery.live.values())
        for (const c of gr.children)
          if (!g.airportClear(c.position.x, c.position.z)) out.push(c.userData.kind ?? 'prop');
      for (const a of g.AIRPORTS)
        for (const s of g.chapelSitesNear(a.at[0], a.at[1], 3))
          if (!g.airportClear(s.x, s.z)) out.push('chapel:' + a.id);
      return out;
    })()`);
    t.ok(bad.length === 0, `on the field: ${bad.slice(0, 5).join(', ')}`);
  });

  await t.check('per-day wind is seeded, 10°-quantized, shared for later waves', async () => {
    const [a, b, c] = await t.ev(`[g.windFrom(17), g.windFrom(17), g.windFrom(18)]`);
    t.ok(a === b, 'same day, different wind');
    t.ok(a % 10 === 0 && a >= 0 && a < 360, `windFrom(17) = ${a}`);
    t.ok(typeof c === 'number', 'windFrom(18) not a number');
  });

  await t.check('windsock rises with a real ATMOS wind change and droops back', async () => {
    await t.setWeather('clear');
    await t.until('g.airports.droop > 0.9', 20000);   // calm: sock hangs
    await t.setWeather('storm');
    await t.until('g.airports.droop < 0.35', 20000);  // storm wind 3: sock flies
    await t.setWeather('clear');
    await t.until('g.airports.droop > 0.9', 20000);
  });

  await t.check('beacon turns through the real loop (wiring sentinel), night-gated', async () => {
    const a0 = await t.ev('g.airports.beaconAngle');
    await t.wait(0.5); // real rAF ticks, not a stepper — this is the sentinel
    t.ok((await t.ev('g.airports.beaconAngle')) > a0, 'beaconAngle frozen — airports.update not wired into main loop');
    await t.setNight();
    await t.until('g.airports.heads.visible', 8000);
    await t.setDay();
    await t.until('!g.airports.heads.visible', 8000);
  });

  await t.check('✈ glyphs land on the map layer at projected sites', async () => {
    const hits = await t.ev(`(() => {
      const ctx = g.hud.mapLayer.getContext('2d');
      let n = 0;
      for (const a of g.AIRPORTS) {
        const [px, pz] = [ (a.at[0] - g.GEO.bounds.minX) * g.hud.mapSc + 20, (a.at[1] - g.GEO.bounds.minZ) * g.hud.mapSc + 20 ];
        const d = ctx.getImageData(Math.round(px) - 8, Math.round(pz) - 8, 16, 16).data;
        for (let i = 0; i < d.length; i += 4)
          if (d[i + 2] > 180 && d[i + 2] > d[i] + 25 && d[i + 3] > 100) { n++; break; }
      }
      return n;
    })()`);
    t.ok(hits === 20, `airport glyph found at ${hits}/20 sites on the map layer`);
  });

  // ---- wave 2: departures ----

  await t.check('flight schedule is pure and well-formed; night keeps tier-1 red-eyes only', async () => {
    const [a, b] = await t.ev(`[JSON.stringify(g.daySchedule(7)), JSON.stringify(g.daySchedule(7))]`);
    t.ok(a === b, 'two daySchedule(7) evals disagree');
    const bad = await t.ev(`(() => {
      const out = [], ids = new Set(g.AIRPORTS.map((x) => x.id));
      for (const ap of g.daySchedule(7)) {
        const tier = g.AIRPORTS.find((x) => x.id === ap.id).tier;
        const night = ap.slots.filter((s) => s.u >= 0.405 && s.u <= 0.845);
        if (night.length && tier !== 1) out.push('night:' + ap.id);
        if (night.length > 2) out.push('redeyes:' + ap.id);
        if (ap.slots.length < [0, 12, 5, 2][tier]) out.push('count:' + ap.id);
        for (const s of ap.slots) {
          if (!ids.has(s.dest) || s.dest === ap.id) out.push('dest:' + ap.id + '>' + s.dest);
          if (!(s.u >= 0 && s.u < 1)) out.push('u:' + ap.id);
          const dt2 = g.AIRPORTS.find((x) => x.id === s.dest)?.tier;
          if ((s.type === 'jet') !== (tier === 1 && dt2 === 1)) out.push('type:' + ap.id + '>' + s.dest);
        }
      }
      return out;
    })()`);
    t.ok(bad.length === 0, bad.slice(0, 6).join(', '));
  });

  await t.check('runway-in-use is the end best aligned into the seeded per-day wind', async () => {
    const bad = await t.ev(`(() => {
      const D2R = Math.PI / 180, out = [];
      for (const day of [3, 17, 42])
        for (const id of ['IAH', 'HOU', 'ELP', 'DAL']) { // crossing/parallel-runway fields
          const a = g.AIRPORTS.find((x) => x.id === id);
          const u = g.runwayInUse(a, day);
          const w = g.windFrom(day) * D2R, wx = Math.sin(w), wz = -Math.cos(w);
          const got = u.dx * wx + u.dz * wz;
          for (const r of a.rws) for (const s of [1, -1])
            if ((r.dx * wx + r.dz * wz) * s > got + 1e-9) out.push(id + '@' + day);
        }
      return out;
    })()`);
    t.ok(bad.length === 0, `into-wind end not chosen: ${bad.join(', ')}`);
  });

  const aus = await t.ev(`g.AIRPORTS.find((a) => a.id === 'AUS').at`);

  await t.check('a departure accelerates down the in-use runway, then gains AGL (measured)', async () => {
    await t.setWeather('clear');
    await t.tp(aus[0] + 20, aus[1] + 16, 'WALK');
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const f = g.aviation.force('departure', 'AUS');
      if (!f) return { err: 'force returned null' };
      const dt = 0.05, agl = [], ys = [], roll = [];
      for (let i = 0; i < 3600; i++) {
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
        if (f.st.ph === 'roll') roll.push([f.st.speed, f.st.x, f.st.z]);
        if (i % 40 === 0 && (f.st.ph === 'climb' || f.st.ph === 'cruise')) {
          agl.push(f.st.y - g.hAt(f.st.x, f.st.z));
          ys.push(f.st.y);
        }
        if (f.st.ph === 'cruise' && agl.length >= 6) break;
      }
      const u = g.runwayInUse(g.AIRPORTS.find((a) => a.id === 'AUS'), f.sl.day);
      const [s0, x0, z0] = roll[0] ?? [0, 0, 0], [s1, x1, z1] = roll[roll.length - 1] ?? [0, 0, 0];
      return { rollN: roll.length, dv: s1 - s0, agl, ys, ph: f.st.ph,
        along: (x1 - x0) * u.dx + (z1 - z0) * u.dz, off: Math.abs((x1 - x0) * -u.dz + (z1 - z0) * u.dx) };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.rollN > 5 && r.dv > 8, `roll speed gain ${r.dv?.toFixed(1)} over ${r.rollN} frames`);
    t.ok(r.along > 3 && r.off < 0.5, `roll track along ${r.along?.toFixed(1)}, off-centerline ${r.off?.toFixed(2)}`);
    // altitude must climb monotonically (the profile guarantees y; AGL only at
    // the ends — terrain dips under the track would fake AGL wobble)
    const drops = r.ys.filter((v, i) => i && v < r.ys[i - 1] - 0.05).length;
    t.ok(r.agl.length >= 6 && r.agl[r.agl.length - 1] > r.agl[0] + 30 && drops === 0,
      `not climbing (ph ${r.ph}): y ${r.ys.map((v) => v.toFixed(0)).join(',')} agl ${r.agl.map((v) => v.toFixed(0)).join(',')}`);
  });

  await t.check('an arrival loses AGL to a touchdown on the runway, then slows', async () => {
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const f = g.aviation.force('arrival', 'AUS');
      if (!f) return { err: 'force returned null' };
      const dt = 0.05, agl = [], ys = [], ro = [];
      let td = null;
      for (let i = 0; i < 2400; i++) {
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
        if (i % 20 === 0 && (f.st.ph === 'descend' || f.st.ph === 'final')) {
          agl.push(f.st.y - g.hAt(f.st.x, f.st.z));
          ys.push(f.st.y);
        }
        if (f.st.ph === 'rollout') { td ??= [f.st.x, f.st.z]; ro.push(f.st.speed); }
        if (f.st.ph === 'taxiin') break;
      }
      const u = g.runwayInUse(g.AIRPORTS.find((a) => a.id === 'AUS'), f.sl.day);
      const ex = td ? (td[0] - u.r.cx) * u.dx + (td[1] - u.r.cz) * u.dz : 1e9;
      const ez = td ? Math.abs((td[0] - u.r.cx) * -u.dz + (td[1] - u.r.cz) * u.dx) : 1e9;
      return { agl, ys, onRwy: Math.abs(ex) <= u.r.hl + 1 && ez <= u.r.w / 2 + 0.5,
        roll: [ro[0] ?? -1, ro[ro.length - 1] ?? -1] };
    })()`);
    t.ok(!r.err, r.err);
    const rises = r.ys.filter((v, i) => i && v > r.ys[i - 1] + 0.05).length;
    // endpoint tolerates the 1 Hz sampling (sink ≈ 8 u/s); the true landing
    // proof is the touchdown-inside-the-runway and rollout-slows asserts below
    t.ok(r.agl.length >= 5 && r.agl[0] > 20 && r.agl[r.agl.length - 1] < 15
      && r.agl[r.agl.length - 1] < r.agl[0] - 25 && rises === 0,
      `not descending: y ${r.ys.map((v) => v.toFixed(0)).join(',')} agl ${r.agl.map((v) => v.toFixed(0)).join(',')}`);
    t.ok(r.onRwy, 'touchdown missed the runway rectangle');
    t.ok(r.roll[1] < r.roll[0] - 5, `rollout never slowed: ${r.roll[0].toFixed(0)} → ${r.roll[1].toFixed(0)}`);
  });

  await t.check('storm ground-stops a departure; clear skies release it', async () => {
    await t.setWeather('storm');
    const held = await t.ev(`(() => {
      g.aviation.despawnAll();
      const f = g.aviation.force('departure', 'AUS');
      const dt = 0.05, p0 = [f.st.x, f.st.z];
      let move = 0;
      for (let i = 0; i < 240; i++) {
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
        move = Math.max(move, Math.hypot(f.st.x - p0[0], f.st.z - p0[1]));
      }
      return move;
    })()`);
    t.ok(held < 0.5, `held flight moved ${held.toFixed(1)} under storm`);
    await t.setWeather('clear');
    const freed = await t.ev(`(() => {
      const f = g.aviation.flights.find((m) => m.sl.key.startsWith('F:'));
      const dt = 0.05;
      let agl = 0;
      for (let i = 0; i < 1600 && f; i++) {
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
        agl = Math.max(agl, f.st.y - g.hAt(f.st.x, f.st.z));
        if (agl > 8) break;
      }
      return agl;
    })()`);
    t.ok(freed > 8, `released flight never climbed (max AGL ${freed.toFixed(1)})`);
  });

  await t.check('a storm arrival goes around instead of landing', async () => {
    await t.setWeather('storm');
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const f = g.aviation.force('arrival', 'AUS');
      if (!f) return { err: 'force returned null' };
      const dt = 0.05, phases = new Set();
      let minAgl = 1e9, y0 = null;
      for (let i = 0; i < 1200; i++) {
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
        if (!g.aviation.flights.includes(f)) break; // recycled into the fog
        phases.add(f.st.ph);
        minAgl = Math.min(minAgl, f.st.y - g.hAt(f.st.x, f.st.z));
        if (f.st.ph === 'divert' && y0 == null) y0 = f.st.y;
      }
      return { minAgl, phases: [...phases], y0, y1: f.st.y };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.phases.includes('divert'), `no go-around; phases: ${r.phases}`);
    t.ok(!r.phases.includes('rollout') && !r.phases.includes('taxiin'), 'landed through a storm');
    t.ok(r.minAgl > 3, `dipped to AGL ${r.minAgl.toFixed(1)} while diverting`);
    t.ok(r.y1 > r.y0 + 5, `never climbed away (y ${r.y0?.toFixed(0)} → ${r.y1?.toFixed(0)})`);
    await t.setWeather('clear');
  });

  await t.check('a landed flight parks in sight, retires only unwatched', async () => {
    await t.tp(aus[0] + 20, aus[1] + 16, 'WALK');
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const f = g.aviation.force('arrival', 'AUS');
      const dt = 0.05;
      for (let i = 0; i < 4800 && f.st.ph !== 'park' && f.st.ph !== 'done'; i++)
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      for (let j = 0; j < 800; j++) // 40 s — well past the 25 s park window
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      return { there: g.aviation.flights.includes(f), ph: f.st.ph };
    })()`);
    t.ok(r.there && r.ph === 'done', `watched parked flight vanished (ph ${r.ph})`);
    await t.tp(aus[0] + 1500, aus[1], 'DRIVE');
    await t.ev(`(() => { const dt = 0.05; for (let i = 0; i < 100; i++) g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days); })()`);
    const left = await t.ev(`g.aviation.flights.filter((m) => m.sl.key.startsWith('F:')).length`);
    t.ok(left === 0, 'far parked flight not recycled');
  });

  await t.check('airborne fixed-wing cap holds at 4', async () => {
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      let n = 0;
      for (let i = 0; i < 6; i++) if (g.aviation.force('arrival', 'AUS')) n++;
      return [n, g.aviation.flights.length];
    })()`);
    t.ok(r[0] === 4 && r[1] === 4, `forced ${r[0]} arrivals, ${r[1]} live — cap is 4`);
  });

  await t.check('planes move through the real loop (wiring sentinel)', async () => {
    await t.tp(aus[0] + 20, aus[1] + 16, 'WALK');
    const key = await t.ev(`(() => { g.aviation.despawnAll(); return g.aviation.force('departure', 'AUS')?.sl.key; })()`);
    t.ok(key, 'no forced flight');
    const s0 = await t.ev(`(() => { const m = g.aviation.flights.find((m) => m.sl.key === '${key}'); return [g.aviation.simT, m.st.x, m.st.z]; })()`);
    await t.wait(2); // deliberately wall time — the frame-loop wiring sentinel
    const s1 = await t.ev(`(() => { const m = g.aviation.flights.find((m) => m.sl.key === '${key}'); return [g.aviation.simT, m?.st.x, m?.st.z]; })()`);
    t.ok(s1[0] > s0[0] + 0.5, 'aviation.simT frozen — update not wired into the main loop');
    t.ok(s1[1] != null && Math.hypot(s1[1] - s0[1], s1[2] - s0[2]) > 1,
      'forced departure never taxied under the real loop');
    await t.ev('g.aviation.despawnAll()');
  });

  if (process.env.SHOT) { // composition only — never the pass/fail signal
    const dal = await t.ev(`g.AIRPORTS.find((a) => a.id === 'DAL').at`);
    // frame a real approach: 30u out on the 31L extended centerline, nose NW
    await t.tp(dal[0] + 0.698 * 30, dal[1] + 0.716 * 30, 'FLY', 12);
    await t.ev('g.player.heading = 0.773');
    await t.wait(0.3);
    await t.shot('airport-love-fly');
    await t.setNight();
    await t.shot('airport-love-night');
    await t.setDay();
    const dfw = await t.ev(`g.AIRPORTS.find((a) => a.id === 'DFW').at`);
    await t.tp(dfw[0] - 8, dfw[1] + 50, 'FLY', 20);
    await t.shot('airport-dfw-fly');
    await t.tp(dfw[0] - 6, dfw[1] + 10, 'WALK');
    await t.shot('airport-dfw-walk');
    // wave 2: a jet at the hold-short point (the 4 s hold outlasts the
    // shutter), then one on the climb-out framed below-and-beside the player
    await t.setWeather('clear');
    await t.setTime(0.5); // noon — morning haze washes the pale fuselage out
    const aus2 = await t.ev(`g.AIRPORTS.find((a) => a.id === 'AUS').at`);
    await t.tp(aus2[0] + 14, aus2[1] + 10, 'WALK');
    await t.ev(`(() => {
      g.aviation.despawnAll();
      let f;
      for (let k = 0; k < 12 && (!f || f.sl.type !== 'jet'); k++) { // want the airliner mesh
        g.aviation.despawnAll();
        f = g.aviation.force('arrival', 'AUS');
      }
      const dt = 0.05; // land it and park it — a watched parked flight never leaves
      for (let i = 0; i < 4800 && f.st.ph !== 'park' && f.st.ph !== 'done'; i++)
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      // stand off on the side AWAY from the terminal (it sits at the anchor
      // right behind the gate and occludes the shot from the other side)
      const a2 = g.AIRPORTS.find((x) => x.id === 'AUS');
      let vx = a2.gate[0] - a2.anchor[0], vz = a2.gate[1] - a2.anchor[1];
      const L = Math.hypot(vx, vz);
      if (L > 0.1) { vx /= L; vz /= L; } else { vx = -f.st.hz; vz = f.st.hx; }
      g.player.pos.set(f.st.x + vx * 7, 0, f.st.z + vz * 7);
      g.player.heading = Math.atan2(-(f.st.x - g.player.pos.x), -(f.st.z - g.player.pos.z));
    })()`);
    await t.wait(0.9); // the chase camera lerps — let it settle after the jump
    await t.shot('aviation-parked');
    await t.ev(`(() => {
      g.aviation.despawnAll();
      let f;
      for (let k = 0; k < 12 && (!f || f.sl.type !== 'jet'); k++) {
        g.aviation.despawnAll();
        f = g.aviation.force('departure', 'AUS');
      }
      const dt = 0.05;
      for (let i = 0; i < 2000 && !(f.st.ph === 'climb' && f.st.y - g.hAt(f.st.x, f.st.z) > 10); i++)
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      const st = f.st, lead = st.speed * 1.15; // where it will be when the shutter fires
      g.player.setMode('FLY');
      g.player.speed = 6;
      // plane ahead, 8 below and 10 beside the camera line, clear of our avatar
      g.player.pos.set(st.x + st.hx * (lead - 26) - st.hz * 10, st.y + 8, st.z + st.hz * (lead - 26) + st.hx * 10);
      const tx2 = st.x + st.hx * lead, tz2 = st.z + st.hz * lead;
      g.player.heading = Math.atan2(-(tx2 - g.player.pos.x), -(tz2 - g.player.pos.z));
    })()`);
    await t.wait(0.3); // partial camera settle; the lead already prices in ~0.9 s
    await t.shot('aviation-climbout');
    await t.ev('g.aviation.despawnAll()');
  }
}
