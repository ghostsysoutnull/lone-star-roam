// Night light decals (vehicle.js): headlight ground pool + beam cones (DRIVE),
// landing light gated on height above ground (FLY), brake glow. All fakes —
// no scene lights — driven by ATMOS.night/rain, following headlights.visible.
// Set SHOT=1 to grab the one allowed screenshot for the visual judgment.

export default async function lights(t) {
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);

  await t.check('daylight: no pools, no beams', async () => {
    await t.setDay();
    await t.tp(austin.x, austin.z + 12);
    await t.wait(0.3);
    const s = await t.ev(`({ pool: g.player.lightPool.visible, beams: g.player.truck.userData.beams.visible })`);
    t.ok(!s.pool && !s.beams, `lit by day: ${JSON.stringify(s)}`);
  });

  await t.check('night drive: beams on, pool ahead on the terrain', async () => {
    await t.setNight();
    await t.ev('g.player.heading = 3.87'); // natural mid-drive value
    await t.wait(0.4);
    const s = await t.ev(`(() => {
      const p = g.player, pool = p.lightPool;
      return {
        beams: p.truck.userData.beams.visible, pool: pool.visible, op: pool.material.opacity,
        dist: Math.hypot(pool.position.x - p.pos.x, pool.position.z - p.pos.z),
        // pool must sit AHEAD: forward = (-sin h, -cos h)
        ahead: (pool.position.x - p.pos.x) * -Math.sin(p.heading) + (pool.position.z - p.pos.z) * -Math.cos(p.heading),
      };
    })()`);
    t.ok(s.beams && s.pool, `not lit at night: ${JSON.stringify(s)}`);
    t.ok(s.op > 0.05, `pool too dim: ${s.op.toFixed(3)}`);
    t.near(s.dist, 5.2, 0.3, 'pool distance');
    t.ok(s.ahead > 4, `pool not in front (ahead=${s.ahead.toFixed(1)})`);
  });

  await t.check('brake glow appears while braking at night', async () => {
    await t.ev('g.player.speed = 20');
    await t.hold('KeyS');
    let seen = false;
    for (let i = 0; i < 10 && !seen; i++) {
      const s = await t.ev(`({ br: g.player.braking, glow: g.player.brakePool.visible })`);
      if (s.br) { seen = s.glow; if (!s.glow) break; }
      await t.wait(0.15);
    }
    await t.release();
    t.ok(seen, 'no brake glow while braking');
  });

  await t.check('landing light gates on height above ground (not raw y)', async () => {
    // low pass: lit; climb out: dark. Assert consistency against live AGL.
    const gy = await t.ev(`g.hAt(g.player.pos.x, g.player.pos.z)`);
    await t.tp(austin.x, austin.z + 12, 'FLY', gy + 8);
    await t.wait(0.35);
    const low = await t.ev(`(() => {
      const p = g.player, agl = p.pos.y - g.hAt(p.pos.x, p.pos.z);
      return { agl, landing: p.wings.userData.landing.visible, pool: p.lightPool.visible };
    })()`);
    t.ok(low.landing === (low.agl < 16) && low.landing, `low pass wrong: ${JSON.stringify(low)}`);
    t.ok(low.pool === low.landing, `pool desynced from landing light: ${JSON.stringify(low)}`);
    if (process.env.SHOT) await t.shot('night-lights-fly-low');

    await t.ev(`g.player.pos.y = g.hAt(g.player.pos.x, g.player.pos.z) + 45`);
    await t.wait(0.35);
    const high = await t.ev(`(() => {
      const p = g.player, agl = p.pos.y - g.hAt(p.pos.x, p.pos.z);
      return { agl, landing: p.wings.userData.landing.visible, pool: p.lightPool.visible };
    })()`);
    t.ok(!high.landing && !high.pool, `still lit high up: ${JSON.stringify(high)}`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('freight locos run a headlight after dark', async () => {
    // mainlines cross Austin; spawner ticks every ~4s of wall time
    await t.until('g.trains.trains.length > 0', 45000, 500);
    await t.wait(0.5);
    const s = await t.ev(`({ n: g.trains.trains.length, beams: g.trains.beams.filter((b) => b.visible).length })`);
    t.ok(s.beams >= 1, `no loco beam among ${s.n} trains`);
    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`g.trains.beams.filter((b) => b.visible).length`);
    t.ok(day === 0, `${day} beams still lit by day`);
    await t.setNight(); // the rain check below judges beams at night
  });

  await t.check('rain brightens the beams', async () => {
    const beamOp = `g.player.truck.userData.beams.children[0].material.opacity`;
    await t.setWeather('clear');
    await t.until(`${beamOp} < 0.08`, 8000); // material updates a frame behind ATMOS
    const clear = await t.ev(beamOp);
    await t.setWeather('rain');
    await t.until(`${beamOp} > ${clear + 0.08}`, 8000);
    const wet = await t.ev(beamOp);
    t.ok(wet > clear + 0.08, `rain didn't brighten beams: ${clear.toFixed(3)} → ${wet.toFixed(3)}`);
    if (process.env.SHOT) await t.shot('night-lights-drive-rain');
    await t.setWeather('clear');
    await t.setDay(); // leave the world in daylight
  });
}
