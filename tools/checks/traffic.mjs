// Ambient traffic: density follows local road supply, cars ride real polylines
// and actually move. Candidates refresh every 2s (wall dt), spawns fill toward
// targetAlive next frames — waits are wall-time here, not physics-time.

const aliveCount = (t) => t.ev('g.traffic.cars.filter((c) => c.alive).length');

export default async function traffic(t) {
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);

  await t.tp(austin.x, austin.z + 12);
  await t.wait(4); // candidate refresh (2s cadence) + pool fill
  const metro = await aliveCount(t);

  await t.check('metro roads fill the pool', async () => {
    t.ok(metro >= 8, `only ${metro} cars alive in Austin`);
  });

  await t.check('cars sit on real roads', async () => {
    const off = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 12)
      .filter((c) => { const r = g.nearestRoad(c.cx, c.cz, 6); return !r || r.dist > 2; }).length`);
    t.ok(off === 0, `${off} cars off the centerline`);
  });

  await t.check('cars actually move', async () => {
    const before = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 8).map((c) => [c.cx, c.cz])`);
    await t.wait(2);
    const after = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 8).map((c) => [c.cx, c.cz])`);
    const moved = before.filter((p, i) => after[i] && Math.hypot(after[i][0] - p[0], after[i][1] - p[1]) > 0.5).length;
    t.ok(moved >= Math.min(4, before.length), `only ${moved}/${before.length} sampled cars moved`);
  });

  await t.check('desert gets a trickle, not a metro pool', async () => {
    // road-poor Big Bend country — supply-based density should starve the pool
    const spot = await t.ev(`(() => {
      for (let x = -3816; x > -4400; x -= 40)
        if (!g.nearestRoad(x, 1558, 120) && g.inTexas(x, 1558)) return { x, z: 1558 };
      return null;
    })()`);
    t.ok(spot, 'no road-poor spot found');
    await t.tp(spot.x, spot.z);
    await t.wait(5); // old cars despawn (>DESPAWN), candidates refresh
    const desert = await aliveCount(t);
    t.ok(desert < Math.max(3, metro * 0.4), `desert has ${desert} cars vs metro ${metro}`);
  });
}
