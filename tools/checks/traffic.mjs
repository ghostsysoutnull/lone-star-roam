// Ambient traffic: density follows local road supply, cars ride real polylines
// and actually move. Candidates refresh every 2s (of traffic-sim dt), so the
// pool-fill waits step traffic.update synchronously; "cars actually move" stays
// on the real render loop as this system's wiring sentinel.

const aliveCount = (t) => t.ev('g.traffic.cars.filter((c) => c.alive).length');
const stepTraffic = (t, s) => t.step(s, 'g.traffic.update(dt, g.player.pos.x, g.player.pos.z, g.player.pos.y)');

export default async function traffic(t) {
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);

  await t.tp(austin.x, austin.z + 12);
  await stepTraffic(t, 4); // candidate refresh (2s cadence) + pool fill
  const metro = await aliveCount(t);

  await t.check('metro roads fill the pool', async () => {
    t.ok(metro >= 8, `only ${metro} cars alive in Austin`);
  });

  await t.check('cars sit on real roads', async () => {
    const off = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 12)
      .filter((c) => { const r = g.nearestRoad(c.cx, c.cz, 6); return !r || r.dist > 2; }).length`);
    t.ok(off === 0, `${off} cars off the centerline`);
  });

  await t.check('cars actually move (real render loop)', async () => {
    const before = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 8).map((c) => [c.cx, c.cz])`);
    await t.wait(2); // deliberately wall time — the frame-loop wiring sentinel
    const after = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 8).map((c) => [c.cx, c.cz])`);
    const moved = before.filter((p, i) => after[i] && Math.hypot(after[i][0] - p[0], after[i][1] - p[1]) > 0.5).length;
    t.ok(moved >= Math.min(4, before.length), `only ${moved}/${before.length} sampled cars moved`);
  });

  await t.check('grounding: traffic.groundYAt is wired to airport+brand pad height (main.js callback)', async () => {
    // Katy's Bucky's pad — brands.js can't be imported by traffic.js directly
    // (brands.js already imports traffic.js for tinted/merge, so that would
    // cycle), so main.js wires traffic.groundYAt as a callback instead. This
    // proves the wiring, not just the underlying pure function (already
    // covered by tools/checks/brands.mjs).
    const katy = await t.ev(`(() => {
      // resolved (post-legalize) pad center — the raw OSM node sits off the slab
      const s = g.brands.buckySites.find((s) => s.name === 'Katy');
      return { x: s.at[0], z: s.at[1] };
    })()`);
    const r = await t.ev(`(() => ({
      expect: g.brandGroundYAt(${katy.x}, ${katy.z}),
      wired: typeof g.traffic.groundYAt === 'function' ? g.traffic.groundYAt(${katy.x}, ${katy.z}) : null,
    }))()`);
    t.ok(r.expect !== null, "brandGroundYAt returned null standing on Bucky's own pad at Katy");
    t.near(r.wired, r.expect, 0.001, `traffic.groundYAt not wired to brandGroundYAt: ${JSON.stringify(r)}`);
  });

  await t.check('band roads (W2b): traffic reaches GEO.bandHighways, off any Texas road', async () => {
    // US 64 in the OK panhandle strip — 800+u from the nearest Texas highway
    // (well past SPAWN_MAX), sits directly on a band road
    await t.tp(-523.8, -6515.9);
    await stepTraffic(t, 4); // candidate refresh + pool fill
    const band = await aliveCount(t);
    t.ok(band >= 3, `only ${band} cars alive on the band road`);
    // membership in GEO.bandHighways, not a nearestBandRoad distance check —
    // car.h IS the exact polyline object the car interpolates along (traffic.js
    // spawn/junctionHop), so this is direct ground truth. nearestBandRoad's
    // grid indexes each segment by its MIDPOINT cell only; a query near one
    // end of a 400+u unsplit band-highway segment (US 270 here) can land
    // several cells from that midpoint and read back null within a small
    // radius even though the point sits exactly on the road — a real gap in
    // that index for long segments, not a traffic placement bug.
    const res = await t.ev(`(() => {
      const alive = g.traffic.cars.filter((c) => c.alive).slice(0, 12);
      return {
        onBandRoad: alive.filter((c) => g.GEO.bandHighways.includes(c.h)).length,
        onTexasRoad: alive.filter((c) => g.GEO.highways.includes(c.h)).length,
        total: alive.length,
      };
    })()`);
    t.ok(res.onBandRoad === res.total, `${res.total - res.onBandRoad}/${res.total} cars not riding a GEO.bandHighways polyline`);
    t.ok(res.onTexasRoad === 0, `${res.onTexasRoad} band cars riding a GEO.highways polyline (impossible this far out)`);
    const before = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 6).map((c) => [c.cx, c.cz])`);
    await t.wait(2); // real-loop sentinel, matches the Austin "cars actually move" check
    const after = await t.ev(`g.traffic.cars.filter((c) => c.alive).slice(0, 6).map((c) => [c.cx, c.cz])`);
    const moved = before.filter((p, i) => after[i] && Math.hypot(after[i][0] - p[0], after[i][1] - p[1]) > 0.5).length;
    t.ok(moved >= Math.min(3, before.length), `only ${moved}/${before.length} band cars moved`);
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
    await stepTraffic(t, 5); // old cars despawn (>DESPAWN), candidates refresh
    const desert = await aliveCount(t);
    t.ok(desert < Math.max(3, metro * 0.4), `desert has ${desert} cars vs metro ${metro}`);
  });
}
