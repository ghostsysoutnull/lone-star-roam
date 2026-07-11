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

  await t.check('flare: dark parabolic tracer, ignites at apex, chute sinks slow + drifts downwind', async () => {
    await t.setNight(); // physics is time-agnostic; the SHOT judgment needs the dark
    const gy = await t.ev(`g.hAt(${austin.x}, ${austin.z + 12})`);
    await t.tp(austin.x, austin.z + 12, 'FLY', gy + 40);
    await t.ev(`(g.player.heading = 2.41, g.player.speed = 60)`); // natural mid-flight values
    t.ok(await t.ev(`g.flares.fire()`), 'fire() refused with a full rack');
    await t.ev(`g.player.speed = 6`); // throttle back so the SHOT keeps the flare in frame
    const s0 = await t.ev(`(() => { const f = g.flares.flares[0]; return { phase: f.phase, vy: f.vy, y: f.y, i: f.slot.light.intensity }; })()`);
    t.ok(s0.phase === 'ballistic' && s0.vy > 0, `no upward ballistic launch: ${JSON.stringify(s0)}`);
    t.ok(s0.i === 0, `tracer already casts light: ${s0.i}`);
    // the descent is flare-internal physics — step it synchronously (the rack
    // check below keeps a real-loop recharge wait as this system's sentinel)
    await t.step(20, 'g.flares.update(dt)', `g.flares.flares[0]?.phase === 'chute'`);
    await t.step(15, 'g.flares.update(dt)', `g.flares.flares[0]?.burn > 0.5`); // past the ignition fade-in
    // sample twice in flare-internal time: sink rate, light, wind drift
    const grab = `(() => { const f = g.flares.flares[0]; return { t: f.t, x: f.x, y: f.y, z: f.z, i: f.slot.light.intensity }; })()`;
    const a = await t.ev(grab);
    t.ok(a.y > gy + 41, `never rose above the launch height: apex ${a.y.toFixed(1)} vs ${(gy + 40.5).toFixed(1)}`);
    t.ok(a.i > 15, `ignited flare too dim: ${a.i.toFixed(1)}`);
    await t.step(5, 'g.flares.update(dt)', `g.flares.flares[0]?.t > ${a.t + 2}`);
    const b = await t.ev(grab);
    t.near((a.y - b.y) / (b.t - a.t), 2.1, 0.5, 'chute sink rate');
    // wind drift matches the cloud layer's +x-biased direction (clear sky: wind 1)
    t.ok(b.x - a.x > 0.3, `no downwind drift: dx=${(b.x - a.x).toFixed(2)}`);
    // launch threw it well ahead of the plane: forward = (-sin h, -cos h)
    const fwd = (b.x - austin.x) * -Math.sin(2.41) + (b.z - (austin.z + 12)) * -Math.cos(2.41);
    t.ok(fwd > 10, `flare not ahead of the launch point (fwd=${fwd.toFixed(1)})`);
    if (process.env.SHOT) await t.shot('flare-chute-night');
    await t.setDay();
  });

  await t.check('flare rack: FLY-only, 3 charges, oldest snuffed on overflow, recharges', async () => {
    await t.ev(`(g.flares.flares.forEach((f) => g.flares.snuff(f.slot)), g.flares.flares.length = 0, g.flares.charges = 3, g.flares.recharge = 0)`);
    await t.ev(`g.player.setMode('DRIVE')`);
    t.ok(!(await t.ev(`g.flares.fire()`)), 'fired from DRIVE');
    const gy = await t.ev(`g.hAt(g.player.pos.x, g.player.pos.z)`);
    await t.tp(austin.x, austin.z + 12, 'FLY', gy + 40);
    t.ok(await t.ev(`g.flares.fire() && g.flares.fire() && g.flares.fire()`), 'rack refused a charge');
    const s = await t.ev(`({ n: g.flares.flares.length, c: g.flares.charges, used: g.flares.pool.filter((p) => p.used).length })`);
    t.ok(s.n === 3 && s.c === 0 && s.used === 3, `full volley wrong: ${JSON.stringify(s)}`);
    t.ok(!(await t.ev(`g.flares.fire()`)), 'fired on an empty rack');
    await t.ev(`g.flares.charges = 1`); // grant one: overflow must snuff the oldest, not grow past 3
    t.ok(await t.ev(`g.flares.fire()`), 'refused with a charge in the rack');
    const o = await t.ev(`({ n: g.flares.flares.length, used: g.flares.pool.filter((p) => p.used).length })`);
    t.ok(o.n === 3 && o.used === 3, `overflow grew the pool: ${JSON.stringify(o)}`);
    // recharge ticks a charge back (pre-wound: 10 s of physics time is slow headless)
    await t.ev(`(g.flares.charges = 0, g.flares.recharge = 9.9)`);
    await t.until(`g.flares.charges >= 1`, 15000);
    // the real F keydown path fires too (spends the recharged charge)
    await t.key('KeyF');
    await t.until(`g.flares.charges === 0`, 8000);
    await t.ev(`(g.flares.flares.forEach((f) => g.flares.snuff(f.slot)), g.flares.flares.length = 0, g.flares.charges = 3, g.player.setMode('DRIVE'))`);
  });
}
