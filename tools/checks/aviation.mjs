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

  // ---- wave 3: tower radio ----
  // radio.js is a pure narration layer (no import of aviation.js — it reads
  // the live aviation/airports/sky state passed into update()). Reception,
  // ATIS content and the player's own approach/landing flow are asserted at
  // ugly values (off-axis heading, real touchdown thresholds), matching the
  // charging-deer lesson from wave 2. A blocked-runway go-around is asserted
  // as a physical event (aviation.divert firing) independent of whether
  // anyone is tuned in — real safety behavior doesn't need a listener.

  await t.check('reception: FLY within range, not DRIVE without the perk, anywhere with it', async () => {
    const r = await t.ev(`(() => {
      const a = g.AIRPORTS.find((x) => x.id === 'AUS');
      g.player.perks.avionics = false;
      g.player.setMode('DRIVE');
      g.player.pos.set(a.at[0] + 42, 0, a.at[1] + 57);
      const driveClose = g.radio.receivable(g.player);
      g.player.setMode('FLY');
      g.player.pos.y = g.hAt(g.player.pos.x, g.player.pos.z) + 35;
      const flyClose = g.radio.receivable(g.player);
      g.player.pos.set(-2767, 40, 334); // the empty I-10 west stretch — clear of every field
      const flyFar = g.radio.receivable(g.player);
      g.player.perks.avionics = true;
      const flyFarPerk = g.radio.receivable(g.player);
      g.player.setMode('DRIVE');
      g.player.pos.y = 0;
      const driveFarPerk = g.radio.receivable(g.player);
      g.player.perks.avionics = false;
      return { driveClose: !!driveClose, flyClose: flyClose?.a?.id ?? null, flyCloseKind: flyClose?.kind ?? null,
        flyFar: !!flyFar, flyFarPerk: flyFarPerk?.a?.id ?? null, driveFarPerk: driveFarPerk?.a?.id ?? null };
    })()`);
    t.ok(!r.driveClose, 'receivable while driving close to a towered field, no perk');
    t.ok(r.flyClose === 'AUS' && r.flyCloseKind === 'tower', `not receivable flying close to Austin (got ${r.flyClose}/${r.flyCloseKind})`);
    t.ok(!r.flyFar, 'receivable 200+ km from every towered field, no perk');
    t.ok(r.flyFarPerk, `perk didn't grant reception far away in FLY (got ${r.flyFarPerk})`);
    t.ok(r.driveFarPerk, `perk didn't grant reception far away while driving (got ${r.driveFarPerk})`);
  });

  await t.check('UNICOM: tier-2 fields give AWOS (not ATIS) on tuning in, shorter range, no player flow, no stamp', async () => {
    const r = await t.ev(`(() => {
      const a = g.AIRPORTS.find((x) => x.id === 'ACT'); // Waco Regional — tier 2
      const day = Math.floor(g.sky.days);
      g.gameplay.save.airports = [];
      g.player.perks.avionics = false;
      g.radio.tunedField = null; g.radio.flow = 'none'; g.radio.lastTx = null;
      g.player.setMode('FLY');
      g.player.pos.set(a.at[0] + 55, g.hAt(a.at[0] + 55, a.at[1] + 35) + 35, a.at[1] + 35); // ~65u, inside UNICOM range
      const near = g.radio.receivable(g.player);
      g.radio.update(0.05, g.player, g.aviation, g.sky); // AWOS fires here — a real transmission, not silence
      const txAfterTune = g.radio.lastTx;
      g.player.pos.set(a.at[0] + 145, 40, a.at[1] + 30); // ~148u — past the 120u UNICOM ring
      const beyondUnicom = g.radio.receivable(g.player);
      // fly a "clean landing" profile at Waco: no tower, so no flow/stamp should happen
      const u = g.runwayInUse(a, day);
      g.player.pos.set(u.tx, g.hAt(u.tx, u.tz) + 1, u.tz);
      g.player.heading = -Math.atan2(u.dx, -u.dz);
      g.player.vy = -3; g.player.speed = 25;
      g.radio.update(0.05, g.player, g.aviation, g.sky);
      return { nearKind: near?.kind ?? null, nearId: near?.a?.id ?? null,
        txAfterTune, wind: g.windFrom(day), beyondUnicom: !!beyondUnicom, flowAfterLanding: g.radio.flow,
        stamps: g.gameplay.save.airports.length };
    })()`);
    t.ok(r.nearKind === 'unicom' && r.nearId === 'ACT', `Waco should be UNICOM-receivable (got ${r.nearId}/${r.nearKind})`);
    t.ok(r.txAfterTune?.kind === 'awos', `expected AWOS on tuning in, got ${r.txAfterTune?.kind}`);
    t.ok(r.txAfterTune.wind === r.wind, `AWOS wind ${r.txAfterTune.wind} !== windFrom ${r.wind}`);
    t.ok(!/Tower|cleared/i.test(r.txAfterTune.text), `AWOS used tower/controller phrasing: "${r.txAfterTune.text}"`);
    t.ok(!r.txAfterTune.rwy, 'AWOS should not include a runway (no controller to assign one)');
    t.ok(!r.beyondUnicom, 'still receivable past 120u — UNICOM range should be shorter than the tower ring');
    t.ok(r.flowAfterLanding === 'none', `a UNICOM field ran the towered approach flow (flow=${r.flowAfterLanding})`);
    t.ok(r.stamps === 0, `landing at a non-towered field stamped the logbook (${r.stamps})`);
  });

  await t.check('UNICOM self-announce phrasing on an AI departure at Waco (no controller clearance)', async () => {
    await t.tp(-2767, 334, 'FLY', 40);
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const a = g.AIRPORTS.find((x) => x.id === 'ACT');
      g.radio.tunedField = null; g.radio.flow = 'none'; g.radio.lastTx = null;
      g.radio.knownPh.clear();
      g.player.setMode('FLY');
      g.player.pos.set(a.at[0] + 40, g.hAt(a.at[0] + 40, a.at[1] + 25) + 30, a.at[1] + 25);
      const f = g.aviation.force('departure', 'ACT');
      if (!f) return { err: 'force returned null' };
      const dt = 0.05;
      for (let i = 0; i < 200 && f.st.ph !== 'roll'; i++) g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      g.radio.update(dt, g.player, g.aviation, g.sky);
      const lastTx = g.radio.lastTx;
      g.aviation.despawnAll();
      return { err: null, ph: f.st.ph, lastTx };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.ph === 'roll', `flight not on roll when narrated (ph ${r.ph})`);
    t.ok(r.lastTx?.kind === 'ops', `expected a self-announce, got ${r.lastTx?.kind}`);
    t.ok(/Waco traffic/.test(r.lastTx?.text ?? ''), `not self-announce phrasing: "${r.lastTx?.text}"`);
    t.ok(!/cleared/i.test(r.lastTx?.text ?? ''), `UNICOM shouldn't use controller phrasing: "${r.lastTx?.text}"`);
  });

  await t.check('tower radio ticks through the real loop (wiring sentinel)', async () => {
    await t.tp(-2767, 334, 'FLY', 40); // clear of every towered field first
    await t.ev(`(g.radio.tunedField = null, g.player.perks.avionics = false)`);
    await t.tp(aus[0] + 60, aus[1] + 40, 'FLY', 40); // into AUS range — no manual radio.update() calls
    await t.until(`g.radio.tunedField === 'AUS'`, 8000); // only the real rAF loop can set this
  });

  await t.check('an unforced flyby of Waco produces real audio through the real loop (the reported bug)', async () => {
    await t.tp(-2767, 334, 'FLY', 40); // clear of every field first
    const act = await t.ev(`g.AIRPORTS.find((x) => x.id === 'ACT').at`);
    await t.ev(`(g.radio.tunedField = null, g.radio.lastTx = null, g.hud.subtitleQ.length = 0, g.hud.subtitleBusy = false, clearTimeout(g.hud.subtitleTimer))`);
    await t.tp(act[0] + 55, act[1] + 35, 'FLY', 40); // fly to Waco, no debug button, no forced flight
    await t.until(`g.radio.tunedField === 'ACT'`, 8000); // real loop alone must tune in
    await t.until(`g.radio.lastTx?.kind === 'awos'`, 8000); // and produce an actual transmission
    const sub = await t.ev(`document.getElementById('radio-subtitle').textContent`);
    t.ok(sub.length > 0, 'Waco flyby tuned in but the subtitle stayed empty — still silent to the player');
  });

  await t.check('UFO nearby chops in the one spooky template', async () => {
    const r = await t.ev(`(() => {
      g.player.setMode('DRIVE'); // avoid the same-frame ATIS/contact overwrite the FLY flow has
      g.player.perks.avionics = true;
      g.radio.tunedField = null; g.radio.ufoWas = false;
      g.player.pos.set(-2767, 0, 334);
      g.radio.update(0.05, g.player, g.aviation, g.sky); // tunes in (ATIS)
      const prevUfo = g.ATMOS.ufo;
      g.ATMOS.ufo = 0.8;
      g.radio.update(0.05, g.player, g.aviation, g.sky);
      const kind = g.radio.lastTx?.kind;
      g.ATMOS.ufo = prevUfo;
      g.player.perks.avionics = false;
      return kind;
    })()`);
    t.ok(r === 'ufo', `UFO nearby didn't produce the spooky template (got ${r})`);
  });

  await t.check('ATIS on entering range matches windFrom/runwayInUse; subtitle shows the text', async () => {
    await t.tp(-2767, 334, 'FLY', 40); // clear of every towered field first, so tunedField starts null
    const r = await t.ev(`(() => {
      g.radio.tunedField = null; g.radio.flow = 'none'; g.radio.lastTx = null;
      // a prior check's subtitle may still be queued/showing — clear it so
      // this check's DOM assertion reads only what THIS transmission wrote
      g.hud.subtitleQ.length = 0; g.hud.subtitleBusy = false;
      clearTimeout(g.hud.subtitleTimer);
      const a = g.AIRPORTS.find((x) => x.id === 'AUS');
      const day = Math.floor(g.sky.days);
      const x = a.at[0] + 61, z = a.at[1] + 39;
      g.player.perks.avionics = false;
      g.player.setMode('FLY');
      g.player.pos.set(x, g.hAt(x, z) + 37, z);
      g.radio.update(0.05, g.player, g.aviation, g.sky);
      let n = Math.round((((g.runwayInUse(a, day).hdg % 360) + 360) % 360) / 10); if (n === 0) n = 36;
      return { lastTx: g.radio.lastTx, wind: g.windFrom(day), rwy: String(n).padStart(2, '0') };
    })()`);
    t.ok(r.lastTx?.kind === 'atis', `first tx on entering range should be ATIS, got ${r.lastTx?.kind}`);
    t.ok(r.lastTx.field === 'AUS', `ATIS tuned to the wrong field (${r.lastTx.field})`);
    t.ok(r.lastTx.wind === r.wind, `ATIS wind ${r.lastTx.wind} !== windFrom ${r.wind}`);
    t.ok(r.lastTx.rwy === r.rwy, `ATIS runway ${r.lastTx.rwy} !== runway-in-use ${r.rwy}`);
    t.ok(r.lastTx.text.includes(String(r.wind)), 'ATIS text missing the wind number');
    const sub = await t.ev(`document.getElementById('radio-subtitle').textContent`);
    t.ok(sub.length > 0 && sub === r.lastTx.text, `subtitle text "${sub}" doesn't match the last transmission`);
  });

  await t.check('off-axis approach: misaligned holds at "contact," aligns to "cleared," single stamp on touchdown', async () => {
    await t.tp(aus[0] + 800, aus[1] + 800, 'FLY', 40); // clear of the ring before scripting the approach
    const r = await t.ev(`(() => {
      const a = g.AIRPORTS.find((x) => x.id === 'AUS');
      const day = Math.floor(g.sky.days);
      const u = g.runwayInUse(a, day);
      g.gameplay.save.airports = [];
      g.player.perks.avionics = false;
      g.radio.tunedField = null; g.radio.flow = 'none'; g.radio.lastTx = null;
      g.player.setMode('FLY');
      const targetH = -Math.atan2(u.dx, -u.dz); // compass hdg -> player.heading convention
      const dt = 0.05, steps = 460;
      let flowAtEarly = null, clearedAt = null;
      for (let i = 0; i < steps; i++) {
        const t2 = i / (steps - 1);
        const D = 200 * (1 - Math.min(1, t2 / 0.85));
        const alignT = Math.max(0, (t2 - 0.28) / 0.5); // stays 33° off until 28% in, then eases straight
        const off = (33 * Math.PI / 180) * (1 - Math.min(1, alignT));
        const L = 26 * (1 - Math.min(1, alignT));
        const x = u.tx - D * u.dx - L * u.dz, z = u.tz - D * u.dz + L * u.dx;
        const agl = Math.max(0, 70 * (1 - Math.min(1, t2 / 0.9)));
        g.player.pos.set(x, g.hAt(x, z) + agl, z);
        g.player.heading = targetH + off;
        g.player.vy = -3;
        g.player.speed = 45 - 20 * Math.min(1, t2);
        g.radio.update(dt, g.player, g.aviation, g.sky);
        if (i === Math.floor(steps * 0.15)) flowAtEarly = g.radio.flow;
        if (clearedAt == null && g.radio.lastTx?.kind === 'cleared') clearedAt = i;
      }
      return { flowAtEarly, clearedAt, finalFlow: g.radio.flow,
        stampCount: g.gameplay.save.airports.length, lastTx: g.radio.lastTx };
    })()`);
    t.ok(r.flowAtEarly === 'contact', `still-misaligned leg should read 'contact', got ${r.flowAtEarly}`);
    t.ok(r.clearedAt != null, 'never reached "cleared to land" after aligning');
    t.ok(r.finalFlow === 'landed', `flow never reached landed (${r.finalFlow})`);
    t.ok(r.stampCount === 1, `logbook stamped ${r.stampCount} times, expected exactly 1`);
    t.ok(r.lastTx?.kind === 'landed', `last transmission wasn't the landing welcome (${r.lastTx?.kind})`);
  });

  await t.check('touchdown gate rejects too-fast, too-high, and off-pavement (no stamp)', async () => {
    const r = await t.ev(`(() => {
      const a = g.AIRPORTS.find((x) => x.id === 'AUS');
      const day = Math.floor(g.sky.days);
      const u = g.runwayInUse(a, day);
      g.player.setMode('FLY');
      const h = -Math.atan2(u.dx, -u.dz);
      const attempt = (x, z, agl, speed) => {
        g.gameplay.save.airports = [];
        g.radio.flow = 'none';
        g.player.pos.set(x, g.hAt(x, z) + agl, z);
        g.player.heading = h;
        g.player.vy = -3;
        g.player.speed = speed;
        g.radio.update(0.05, g.player, g.aviation, g.sky);
        return g.gameplay.save.airports.length;
      };
      const tooFast = attempt(u.tx, u.tz, 1, 62);
      const tooHigh = attempt(u.tx, u.tz, 21, 25);
      const offPavement = attempt(u.tx - u.dz * 40, u.tz + u.dx * 40, 1, 25);
      const clean = attempt(u.tx, u.tz, 1, 25);
      return { tooFast, tooHigh, offPavement, clean };
    })()`);
    t.ok(r.tooFast === 0, 'stamped despite touchdown speed 62 > 40');
    t.ok(r.tooHigh === 0, 'stamped despite touchdown AGL 21 > 3');
    t.ok(r.offPavement === 0, 'stamped despite landing 40u off the runway pavement');
    t.ok(r.clean === 1, 'clean touchdown never stamped');
  });

  await t.check('the logbook dedupes: landing twice at the same field stamps once', async () => {
    const r = await t.ev(`(() => {
      const a = g.AIRPORTS.find((x) => x.id === 'AUS');
      const day = Math.floor(g.sky.days);
      const u = g.runwayInUse(a, day);
      g.gameplay.save.airports = [];
      g.player.setMode('FLY');
      g.player.heading = -Math.atan2(u.dx, -u.dz);
      const land = () => {
        g.radio.flow = 'none';
        g.player.pos.set(u.tx, g.hAt(u.tx, u.tz) + 1, u.tz);
        g.player.vy = -3; g.player.speed = 25;
        g.radio.update(0.05, g.player, g.aviation, g.sky);
      };
      land();
      const after1 = g.gameplay.save.airports.length;
      land();
      const after2 = g.gameplay.save.airports.length;
      return { after1, after2 };
    })()`);
    t.ok(r.after1 === 1, `first landing didn't stamp (${r.after1})`);
    t.ok(r.after2 === 1, `second landing at the same field double-stamped (${r.after2})`);
  });

  await t.check('a player parked on the active runway forces an inbound flight to go around', async () => {
    await t.tp(aus[0] + 20, aus[1] + 16, 'WALK');
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const a = g.AIRPORTS.find((x) => x.id === 'AUS');
      const day = Math.floor(g.sky.days);
      const u = g.runwayInUse(a, day);
      const f = g.aviation.force('arrival', 'AUS');
      if (!f) return { err: 'force returned null' };
      const dt = 0.05;
      for (let i = 0; i < 4800 && f.st.ph !== 'final'; i++)
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      const phBefore = f.st.ph;
      // WALK the player onto the runway centerline — no radio, no perk: the
      // go-around must still fire (physical, not a listening-in behavior)
      g.player.setMode('WALK');
      g.player.pos.set(u.tx, g.hAt(u.tx, u.tz), u.tz);
      g.player.speed = 0;
      for (let i = 0; i < 30 && !f.divert; i++) {
        g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
        g.radio.update(dt, g.player, g.aviation, g.sky);
      }
      return { err: null, phBefore, diverted: !!f.divert };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.phBefore === 'final', `flight not on final when the runway was blocked (ph ${r.phBefore})`);
    t.ok(r.diverted, 'blocked runway never triggered a go-around');
    await t.ev('g.aviation.despawnAll()');
  });

  await t.check('the real audio synth runs without error (debug test-radio action)', async () => {
    await t.key('KeyX'); // any keydown boots the lazy AudioContext — unbound code, no side effect
    await t.tp(aus[0] + 30, aus[1] + 20, 'FLY', 40);
    await t.ev(`g.debug.actions.testRadio()`);
    await t.wait(0.3); // let the scheduled WebAudio graph actually build
    t.ok((await t.ev('!!g.radio.lastTx')).valueOf(), 'test-radio action produced no transmission');
  });

  // ---- wave 4: rotors & airships ----
  // Helicopters and the blimp follow the chapelAt/aviation lesson: pure math
  // first, meshes second. The checks below read live numbers off
  // g.heli.candidates / g.blimp — never pixels or audio waveforms — per the
  // charging-deer lesson. rotors.js's own real-rAF sentinels (heli.simT,
  // blimp.simT) close out the wave; everything else uses g.heli.update()
  // directly (a stepper, like g.aviation.update() elsewhere in this suite).

  await t.check('news heli orbits its downtown center at a steady radius, sampled over time', async () => {
    await t.setDay();
    const r = await t.ev(`(() => {
      g.heli.despawnAll();
      if (!g.heli.force('news')) return { err: 'force failed' };
      const c = g.heli.candidates.find((x) => x.kind === 'news' && x.flying);
      const dt = 0.05, radii = [], pts = [];
      // watching from nearby (baseX+50) — realistic "player is in this city" case
      for (let i = 0; i < 2000; i++) {
        g.heli.update(dt, c.baseX + 50, c.baseZ + 50);
        if (i % 40 === 0) { radii.push(Math.hypot(c.x - c.baseX, c.z - c.baseZ)); pts.push([c.x, c.z]); }
      }
      return { err: null, radii, moved: Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.radii.length > 10, `only ${r.radii.length} samples`);
    const bad = r.radii.filter((x) => Math.abs(x - 40) > 2);
    t.ok(bad.length === 0, `orbit radius drifted off 40u: ${r.radii.map((x) => x.toFixed(1)).join(',')}`);
    t.ok(r.moved > 1, 'orbit position frozen — news heli never actually circled');
    await t.ev('g.heli.despawnAll()');
  });

  await t.check('a continuous rotorcraft (coast guard) frees its cap slot once the player drives away', async () => {
    const r = await t.ev(`(() => {
      g.heli.despawnAll();
      if (!g.heli.force('coastguard')) return { err: 'force failed' };
      const c = g.heli.candidates.find((x) => x.kind === 'coastguard');
      const dt = 0.05;
      for (let i = 0; i < 20; i++) g.heli.update(dt, c.baseX, c.baseZ); // a few ticks nearby: stays airborne
      const nearCount = g.heli.airborneCount();
      for (let i = 0; i < 40; i++) g.heli.update(dt, c.baseX + 5000, c.baseZ + 5000); // player drives far inland
      const farCount = g.heli.airborneCount();
      return { err: null, nearCount, farCount };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.nearCount === 1, `coast guard should hold its slot while watched (got ${r.nearCount})`);
    t.ok(r.farCount === 0, `coast guard slot never freed after the player left (still ${r.farCount})`);
  });

  await t.check('blimp position is a pure deterministic function of the day', async () => {
    const r = await t.ev(`(() => {
      const a = g.blimp.positionAt(11, 1.3), b = g.blimp.positionAt(11, 1.3), c = g.blimp.positionAt(12, 1.3);
      return { same: a.x === b.x && a.z === b.z, diff: a.x !== c.x || a.z !== c.z };
    })()`);
    t.ok(r.same, 'two evals of the same day+angle disagree');
    t.ok(r.diff, 'a different day gave an identical position');
  });

  await t.check('rotor audio gain fades with distance to the nearest airborne heli, silent with none in range', async () => {
    const r = await t.ev(`(() => {
      g.heli.despawnAll();
      if (!g.heli.force('medical')) return { err: 'force failed' };
      const c = g.heli.candidates.find((x) => x.kind === 'medical' && x.flying);
      g.heli.update(0.05, c.baseX, c.baseZ);
      const near = g.heli.nearestAirborneDist(c.x, c.z), far = g.heli.nearestAirborneDist(c.x + 1000, c.z);
      g.audio.heli(near); const gNear = g.audio.heliTarget;
      g.audio.heli(far); const gFar = g.audio.heliTarget;
      g.audio.heli(Infinity); const gNone = g.audio.heliTarget;
      return { err: null, gNear, gFar, gNone };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.gNear > r.gFar, `gain didn't fall off with distance (near ${r.gNear}, far ${r.gFar})`);
    t.ok(r.gNone === 0, `no heli in range should be silent, got ${r.gNone}`);
    t.ok(r.gNear > 0, `near gain should be audible, got ${r.gNear}`);
    await t.ev('g.heli.despawnAll()');
  });

  await t.check('airborne rotorcraft cap holds at 2 across all four kinds', async () => {
    const r = await t.ev(`(() => {
      g.heli.despawnAll();
      const got = ['medical', 'news', 'coastguard', 'army'].map((k) => g.heli.force(k));
      return { got, count: g.heli.airborneCount() };
    })()`);
    t.ok(r.count === 2, `airborne count ${r.count}, expected the cap of 2`);
    t.ok(r.got.filter(Boolean).length <= 2, `forced ${r.got.filter(Boolean).length} kinds airborne at once`);
    await t.ev('g.heli.despawnAll()');
  });

  await t.check('rotors advance through the real loop (wiring sentinel)', async () => {
    const h0 = await t.ev('g.heli.simT'), b0 = await t.ev('g.blimp.simT'), m0 = await t.ev('g.military.simT');
    await t.wait(0.5); // real rAF ticks, not a stepper — this is the sentinel
    const h1 = await t.ev('g.heli.simT'), b1 = await t.ev('g.blimp.simT'), m1 = await t.ev('g.military.simT');
    t.ok(h1 > h0 + 0.3, 'heli.simT frozen — HeliSystem.update not wired into the main loop');
    t.ok(b1 > b0 + 0.3, 'blimp.simT frozen — BlimpSystem.update not wired into the main loop');
    t.ok(m1 > m0 + 0.3, 'military.simT frozen — MilitaryAirSystem.update not wired into the main loop');
  });

  // Rotor detail pass: per-kind body geometry (was one shared 132-tri body
  // for all four kinds) and per-kind blade counts (army = 4-blade cross, the
  // other three keep 2 blades). Same numbers-over-pixels rule as the rest of
  // this suite — poly counts and rotorCount, not a screenshot, are the
  // pass/fail signal; the one SHOT below is HELICOPTER_SPEC.md's sanctioned
  // exception for a genuine shape-differentiation gut check.
  await t.check('helicopter body poly count increased per kind (real geometry, not shared)', async () => {
    const counts = await t.ev(`(() => {
      const ks = ['medical', 'news', 'coastguard', 'army'];
      return ks.map((k) => g.heli.meshes[k].body.geometry.index.count / 3); // merge() always emits an indexed geometry — triangle count is index.count/3, not position.count/3
    })()`);
    for (const [i, k] of ['medical', 'news', 'coastguard', 'army'].entries())
      t.ok(counts[i] > 132, `${k} body still at/below the old shared 132-tri geometry (${counts[i]})`);
  });

  await t.check('all four helicopter kinds have distinct body geometries', async () => {
    const n = await t.ev(`(() => {
      const ks = ['medical', 'news', 'coastguard', 'army'];
      return new Set(ks.map((k) => g.heli.meshes[k].body.geometry)).size;
    })()`);
    t.ok(n === 4, `expected 4 distinct body geometries, got ${n} (kinds still sharing one shared mesh)`);
  });

  await t.check('rotor mast height clears the tallest point of each kind\'s own body', async () => {
    // a fixed mast height was previously shared across all four bodies, so once each
    // kind got its own (taller/shorter) geometry the rotor started sitting inside the
    // fuselage instead of on top of it for some kinds — assert real numbers, not a shot
    const r = await t.ev(`(() => {
      const ks = ['medical', 'news', 'coastguard', 'army'];
      return ks.map((k) => ({ k, rotorY: g.heli.rotorY[k], bodyTop: g.heli.meshes[k].body.geometry.boundingBox.max.y }));
    })()`);
    for (const { k, rotorY, bodyTop } of r)
      t.ok(rotorY > bodyTop, `${k} rotor mast (${rotorY}) doesn't clear its body top (${bodyTop})`);
  });

  await t.check('army rotor is a real 4-blade outlier, other kinds stay at 2 (per aircraft)', async () => {
    const r = await t.ev(`(() => {
      g.heli.despawnAll();
      if (!g.heli.force('army')) return { err: 'force army failed' };
      const army = g.heli.candidates.find((x) => x.kind === 'army' && x.flying);
      g.heli.update(0.05, army.baseX, army.baseZ);
      const armyCount = g.heli.rotorCount.army;
      g.heli.despawnAll();
      if (!g.heli.force('medical')) return { err: 'force medical failed' };
      const med = g.heli.candidates.find((x) => x.kind === 'medical' && x.flying);
      g.heli.update(0.05, med.baseX, med.baseZ);
      const medCount = g.heli.rotorCount.medical;
      return { err: null, armyCount, medCount };
    })()`);
    t.ok(!r.err, r.err);
    // the army candidate renders as a 2-aircraft pair (see rotors.js header comment on the weight-2 gate),
    // so its rotor total is 2 aircraft × 4 blades = 8 — still double medical's 1 aircraft × 2 blades, the
    // real per-kind differentiation the spec asks for.
    t.ok(r.armyCount === 8, `army rotor should render 8 blade instances (2 aircraft × 4 blades), got ${r.armyCount}`);
    t.ok(r.medCount === 2, `medical rotor should render 2 blades, got ${r.medCount}`);
    await t.ev('g.heli.despawnAll()');
  });

  if (process.env.SHOT) { // composition only — never the pass/fail signal; sanctioned by HELICOPTER_SPEC.md
    for (const k of ['medical', 'news', 'coastguard', 'army']) {
      const pos = await t.ev(`(() => {
        g.heli.despawnAll();
        if (!g.heli.force('${k}')) return null;
        const c = g.heli.candidates.find((x) => x.kind === '${k}' && x.flying);
        for (let i = 0; i < 60; i++) g.heli.update(0.05, c.baseX + 50, c.baseZ + 50);
        return { x: c.x, z: c.z, y: c.y ?? (g.hAt(c.x, c.z) + 30) };
      })()`);
      if (pos) {
        await t.tp(pos.x + 12, pos.z + 12, 'FLY', 15);
        await t.ev(`g.player.heading = Math.atan2(-(${pos.x} - g.player.pos.x), -(${pos.z} - g.player.pos.z))`);
        await t.wait(0.3);
        await t.shot(`heli-${k}`);
      }
    }
    await t.ev('g.heli.despawnAll()');
  }

  // Military color (wave 5, partial): the two flavor pairs are aviation.js
  // movers wearing rotors.js's candidate idiom — same rule applies (assert
  // numbers over time, never pixels). The load-bearing invariant is the
  // shared MAX_AIR fixed-wing budget: these pairs must never make the sky
  // busier than the design stance allows.
  await t.check('military pair shares the fixed-wing cap with scheduled traffic (never exceeds MAX_AIR)', async () => {
    const r = await t.ev(`(() => {
      g.military.despawnAll(); g.aviation.despawnAll();
      const apt = g.AIRPORTS.find((a) => a.id === 'DFW');
      g.aviation.px = apt.at[0]; g.aviation.pz = apt.at[1];
      let n = 0;
      while (g.aviation.force('arrival') && n < 8) n++;
      const before = g.aviation.airborneCount();
      const ok = g.military.force('nasa', g.aviation);
      const total = g.aviation.airborneCount() + g.military.airborneCount();
      return { before, ok, total };
    })()`);
    t.ok(r.before >= 4, `expected the aviation cap (4) to be fillable via forced arrivals, got ${r.before}`);
    t.ok(!r.ok, 'military pair launched even though the fixed-wing sky was already full');
    t.ok(r.total <= 4, `combined airborne fixed-wing exceeded MAX_AIR: ${r.total}`);
    await t.ev('(g.aviation.despawnAll(), g.military.despawnAll())');
  });

  await t.check('NASA T-38 pair closes on Ellington and lands (arrival, not a stalk-and-loiter)', async () => {
    const r = await t.ev(`(() => {
      g.military.despawnAll(); g.aviation.despawnAll();
      const ok = g.military.force('nasa', g.aviation);
      if (!ok) return { err: 'force failed' };
      const c = g.military.candidates.find((x) => x.kind === 'nasa');
      const d0 = Math.hypot(c.x0 - c.baseX, c.z0 - c.baseZ);
      for (let i = 0; i < 160; i++) g.military.update(0.05, c.baseX, c.baseZ, g.aviation); // 8s sim — spawn radius 280 / NASA_SPD 46 ≈ 6.1s to arrive
      const d1 = Math.hypot(c.x - c.baseX, c.z - c.baseZ);
      return { err: null, d0, d1, stillFlying: c.flying };
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.d1 < r.d0 * 0.5, `NASA pair should have closed most of the distance to Ellington (${r.d0} → ${r.d1})`);
    t.ok(!r.stillFlying, 'NASA pair never touched down — it should land and go quiet, not loiter');
    await t.ev('g.military.despawnAll()');
  });

  await t.check('low-level trainer pair only rolls over the Trans-Pecos by day, never elsewhere or at night', async () => {
    const rollOnce = (px, pz) => `(() => {
      g.military.despawnAll(); g.aviation.despawnAll();
      const orig = Math.random; Math.random = () => 0; // guarantee the odds roll fires
      const low = g.military.candidates.find((x) => x.kind === 'lowlevel');
      low.rollT = 0;
      g.military.update(0.016, ${px}, ${pz}, g.aviation);
      const flew = low.flying;
      Math.random = orig;
      return flew;
    })()`;
    await t.setDay();
    const east = await t.ev(rollOnce(-1000, 300));    // east of the gate — should NOT fly
    const westDay = await t.ev(rollOnce(-2600, 300));  // west, daytime — SHOULD fly
    await t.setNight();
    const westNight = await t.ev(rollOnce(-2600, 300)); // west, dark — should NOT fly
    await t.ev('g.military.despawnAll()');
    t.ok(!east, 'low-level pair rolled east of the Trans-Pecos gate (x < -2200)');
    t.ok(westDay, 'low-level pair never rolled over the West Texas box by day');
    t.ok(!westNight, 'low-level pair rolled at night');
  });

  // ---- aviation observability wave A, session 1: identity foundations ----
  // A2 (callsigns) and A6 (airlines) are built together: jets fly for a
  // hub-weighted carrier and inherit its callsign/tint, GA gets a tail
  // number. force() shares aviation.js's identityFor() with the seeded
  // schedule, so every forced flight — what these checks exercise — carries
  // the same real cs/tint/airline fields a scheduled one would.

  await t.check("A2: a forced departure narrates the slot's own callsign, not a hardcoded one", async () => {
    await t.tp(aus[0] + 20, aus[1] + 16, 'WALK');
    const r = await t.ev(`(() => {
      g.player.perks.avionics = true; // WALK reception needs the perk (FLY-in-range is the other path)
      g.radio.tunedField = null;
      g.radio.update(0.05, g.player, g.aviation, g.sky); // tune in (consumes the ATIS transmission)
      g.aviation.despawnAll();
      g.radio.knownPh.clear();
      const f = g.aviation.force('departure', 'AUS');
      if (!f) return { err: 'force returned null' };
      const dt = 0.05;
      for (let i = 0; i < 3600 && f.st.ph !== 'roll'; i++) g.aviation.update(dt, g.player.pos.x, g.player.pos.z, g.sky.days);
      g.radio.update(dt, g.player, g.aviation, g.sky); // already tuned — only narrateOps can fire here
      const out = { err: null, cs: f.sl.cs, text: g.radio.lastTx?.text };
      g.player.perks.avionics = false;
      return out;
    })()`);
    t.ok(!r.err, r.err);
    t.ok(r.text?.includes(r.cs), `narration "${r.text}" doesn't contain the slot's own callsign "${r.cs}"`);
    await t.ev('g.aviation.despawnAll()');
  });

  await t.check('A2: GA tail numbers match FAA N-number shape and are stable across a schedule rebuild', async () => {
    const r = await t.ev(`(() => {
      const day = 9;
      const a1 = JSON.stringify(g.daySchedule(day)), a2 = JSON.stringify(g.daySchedule(day));
      const sched = g.daySchedule(day);
      const gaSlots = sched.flatMap((ap) => ap.slots.filter((s) => s.type === 'ga'));
      const bad = gaSlots.filter((s) => !/^N\\d{2,3}[A-Z]{2}$/.test(s.cs)).map((s) => s.key + ':' + s.cs);
      const noAirline = gaSlots.filter((s) => s.airline !== null).map((s) => s.key);
      return { same: a1 === a2, n: gaSlots.length, bad, noAirline };
    })()`);
    t.ok(r.same, 'two daySchedule evals of the same day disagree (tail: stream not deterministic)');
    t.ok(r.n > 0, 'no GA slots to check — assertion would be vacuous');
    t.ok(r.bad.length === 0, `GA tail(s) not FAA-shaped: ${r.bad.slice(0, 5).join(', ')}`);
    t.ok(r.noAirline.length === 0, `GA slot(s) carry an airline: ${r.noAirline.join(', ')}`);
  });

  await t.check('A6: airline assignment is deterministic and hub-weighted to an exact majority', async () => {
    const r = await t.ev(`(() => {
      const day = 9;
      const s1 = g.daySchedule(day), s2 = g.daySchedule(day);
      const same = JSON.stringify(s1) === JSON.stringify(s2);
      const jetsOf = (id) => s1.find((ap) => ap.id === id).slots.filter((s) => s.type === 'jet');
      const dal = jetsOf('DAL'), dfw = jetsOf('DFW');
      const majority = (slots, key) => slots.filter((s) => s.airline === key).length > slots.length / 2;
      return { same, dalN: dal.length, dfwN: dfw.length,
        dalSweetheart: majority(dal, 'sweetheart'), dfwTexan: majority(dfw, 'texan') };
    })()`);
    t.ok(r.same, 'two daySchedule evals disagree (airline: stream not deterministic)');
    t.ok(r.dalN > 0 && r.dfwN > 0, 'no jet slots at DAL/DFW to check — assertion would be vacuous');
    t.ok(r.dalSweetheart, 'DAL jet slots are not majority SWEETHEART');
    t.ok(r.dfwTexan, 'DFW jet slots are not majority TEXAN');
  });

  await t.check('A6: forced flights always carry a real carrier/tail callsign; jet tint matches its airline', async () => {
    const r = await t.ev(`(() => {
      g.aviation.despawnAll();
      const bad = [], tintBad = [];
      for (let i = 0; i < 20; i++) {
        const f = g.aviation.force('departure', 'DAL');
        if (!f) continue;
        const s = f.sl;
        if (s.type === 'jet') {
          if (!/^(SWEETHEART|TEXAN|INTERCON|BRAVO|Lone Star) \\d+$/.test(s.cs)) bad.push(s.cs);
          const al = g.AIRLINES.find((x) => x.key === s.airline);
          if (!al) bad.push('no-airline:' + s.cs);
          else if (al.tint != null && s.tint !== al.tint) tintBad.push(s.cs + ':' + s.tint);
          else if (al.tint == null && s.tint == null) tintBad.push(s.cs + ':no-bravo-tint');
        } else if (!/^N\\d{2,3}[A-Z]{2}$/.test(s.cs)) bad.push(s.cs);
        g.aviation.despawnAll();
      }
      return { bad, tintBad };
    })()`);
    t.ok(r.bad.length === 0, `malformed callsign(s): ${r.bad.join(', ')}`);
    t.ok(r.tintBad.length === 0, `tint didn't match the assigned airline: ${r.tintBad.join(', ')}`);
  });

  await t.check('A5: exactly one gate sign per tier-1/2 field, positioned at its gate, none at tier-3', async () => {
    const r = await t.ev(`(() => {
      const info = g.airports.signInfo;
      const tier12 = g.AIRPORTS.filter((a) => a.tier <= 2).map((a) => a.id);
      const tier3 = g.AIRPORTS.filter((a) => a.tier === 3).map((a) => a.id);
      const ids = info.map((s) => s.id);
      const missing = tier12.filter((id) => !ids.includes(id));
      const dup = ids.length !== new Set(ids).size;
      const wrongTier = ids.filter((id) => tier3.includes(id));
      const farFromGate = info.filter((s) => {
        const a = g.AIRPORTS.find((x) => x.id === s.id);
        return Math.hypot(s.x - a.gate[0], s.z - a.gate[1]) > 3;
      }).map((s) => s.id);
      return { n: info.length, missing, dup, wrongTier, farFromGate };
    })()`);
    t.ok(r.n === 16, `expected 16 gate signs, got ${r.n}`);
    t.ok(r.missing.length === 0, `missing signs for: ${r.missing.join(', ')}`);
    t.ok(!r.dup, 'duplicate sign entries');
    t.ok(r.wrongTier.length === 0, `tier-3 field got a sign: ${r.wrongTier.join(', ')}`);
    t.ok(r.farFromGate.length === 0, `sign far from its field's gate: ${r.farFromGate.join(', ')}`);
  });

  await t.check('A5: gate sign mesh is the 9th global mesh, modestly emissive after dark', async () => {
    await t.setDay(); // the preceding low-level-trainer check leaves the clock at night
    await t.until('g.airports.signs.material.emissiveIntensity === 0', 8000);
    const r0 = await t.ev(`({ inGroup: g.airports.group.children.includes(g.airports.signs),
      childCount: g.airports.group.children.length, day: g.airports.signs.material.emissiveIntensity })`);
    await t.setNight();
    await t.until('g.airports.signs.material.emissiveIntensity > 0', 8000);
    const night = await t.ev('g.airports.signs.material.emissiveIntensity');
    await t.setDay();
    await t.until('g.airports.signs.material.emissiveIntensity === 0', 8000);
    t.ok(r0.inGroup, 'sign mesh not attached to the airport group');
    t.ok(r0.childCount === 9, `expected 9 global airport meshes, got ${r0.childCount}`);
    t.ok(r0.day === 0, `signs already emissive by day (${r0.day})`);
    t.ok(night > 0 && night <= 1, `signs not emissive at night (${night})`);
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
