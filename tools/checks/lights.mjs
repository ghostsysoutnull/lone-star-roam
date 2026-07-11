// Night vehicle lights (vehicle.js): DRIVE runs a real PointLight ahead of the
// truck nose (player.headLight) + fake beam cones; FLY keeps the decal landing
// pool gated on height above ground; brake glow decal. All driven by
// ATMOS.night/rain, following headlights.visible.
// Set SHOT=1 to grab the one allowed screenshot for the visual judgment.

export default async function lights(t) {
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);

  await t.check('daylight: no headlight, no pools, no beams', async () => {
    await t.setDay();
    await t.tp(austin.x, austin.z + 12);
    await t.wait(0.3);
    const s = await t.ev(`({ head: g.player.headLight.visible, pool: g.player.lightPool.visible, beams: g.player.truck.userData.beams.visible })`);
    t.ok(!s.head && !s.pool && !s.beams, `lit by day: ${JSON.stringify(s)}`);
  });

  await t.check('night drive: beams on, real headlight ahead at lamp height', async () => {
    await t.setNight();
    await t.ev('g.player.heading = 3.87'); // natural mid-drive value
    await t.wait(0.4);
    const s = await t.ev(`(() => {
      const p = g.player, hl = p.headLight;
      return {
        beams: p.truck.userData.beams.visible, head: hl.visible, i: hl.intensity,
        agl: hl.position.y - g.hAt(hl.position.x, hl.position.z),
        dist: Math.hypot(hl.position.x - p.pos.x, hl.position.z - p.pos.z),
        // light must sit AHEAD: forward = (-sin h, -cos h)
        ahead: (hl.position.x - p.pos.x) * -Math.sin(p.heading) + (hl.position.z - p.pos.z) * -Math.cos(p.heading),
        pool: p.lightPool.visible, // the decal pool must stay retired in DRIVE
      };
    })()`);
    t.ok(s.beams && s.head, `not lit at night: ${JSON.stringify(s)}`);
    t.ok(s.i > 10, `headlight too dim: ${s.i.toFixed(1)}`);
    t.near(s.dist, 4.6, 0.4, 'headlight lead (speed 0)');
    t.ok(s.ahead > 4, `headlight not in front (ahead=${s.ahead.toFixed(1)})`);
    t.near(s.agl, 1.4, 0.3, 'headlight height above ground');
    t.ok(!s.pool, 'decal pool resurfaced in DRIVE');
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

  await t.check('rain brightens the beams and the headlight', async () => {
    const beamOp = `g.player.truck.userData.beams.children[0].material.opacity`;
    await t.setWeather('clear');
    await t.until(`${beamOp} < 0.08`, 8000); // material updates a frame behind ATMOS
    const clear = await t.ev(beamOp);
    const clearI = await t.ev(`g.player.headLight.intensity`);
    await t.setWeather('rain');
    await t.until(`${beamOp} > ${clear + 0.08}`, 8000);
    const wet = await t.ev(beamOp);
    const wetI = await t.ev(`g.player.headLight.intensity`);
    t.ok(wet > clear + 0.08, `rain didn't brighten beams: ${clear.toFixed(3)} → ${wet.toFixed(3)}`);
    t.ok(wetI > clearI + 5, `rain didn't boost headlight: ${clearI.toFixed(1)} → ${wetI.toFixed(1)}`);
    if (process.env.SHOT) await t.shot('night-lights-drive-rain');
    await t.setWeather('clear');
    await t.setDay(); // leave the world in daylight
  });
}
