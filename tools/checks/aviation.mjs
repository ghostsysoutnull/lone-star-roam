// Aviation wave 1 — fields. Layout must be pure (two evals agree), pads must
// cover the real terrain under them (asserted at low-discrepancy interior
// points, not the builder's own grid), airportClear must block runway points
// and admit the surroundings, and the exclusion must hold where it matters:
// Dallas' real spawned buildings vs Love Field's footprint. The windsock and
// beacon are the live bits — wind response through real ATMOS, beacon spin
// through the real rAF loop (this suite's wiring sentinel).

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
  }
}
