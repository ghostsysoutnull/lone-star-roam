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
    const m = await t.ev('({ drawn: g.hud.mapStats.rails, total: g.GEO.rails.length })');
    t.ok(m.drawn === m.total && m.total > 500, `map rails ${m.drawn} != data ${m.total}`);
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
