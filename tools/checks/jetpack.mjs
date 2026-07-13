// Jetpack (WALK sub-state, shop.js `jetpack` perk) wave 1 — physics + shop
// only, no VFX/audio yet (JETPACK_SPEC.md). Every check runs in a road-free
// flat bubble (caps/behaviors change within 4 units of any road) and restores
// DRIVE at the end — later checks in this suite and other suites depend on
// ambient DRIVE mode. Assert AGL (pos.y - hAt), never raw pos.y.

async function roadFreeSpot(t) {
  const spot = await t.ev(`(() => {
    const c = g.GEO.cities.find((c) => c.name === 'Austin');
    for (const dz of [-40, -160, -280, -400, 80])
      for (let x = c.x - 120; x > c.x - 1500; x -= 30) {
        const z = c.z + dz;
        if (!g.nearestRoad(x, z, 140) && g.inTexas(x, z)) return { x, z };
      }
    return null;
  })()`);
  return spot;
}

const buyOut = (t, id, times) => t.ev(`(() => {
  for (let i = 0; i < ${times}; i++) g.travel.buyItem('${id}');
  return g.gameplay.save.bank;
})()`);

const agl = (t) => t.ev('g.player.pos.y - g.hAt(g.player.pos.x, g.player.pos.z)');

export default async function jetpack(t) {
  const spot = await roadFreeSpot(t);
  t.ok(spot, 'no road-free bubble found near Austin');

  await t.check('no perk: holding Space in WALK never leaves the ground', async () => {
    await t.tp(spot.x, spot.z, 'WALK');
    await t.hold('Space');
    await t.simStep(2);
    await t.release();
    t.near(await agl(t), 0, 0.5, 'AGL after holding Space with no jetpack');
    t.ok(!(await t.ev('g.player.hovering')), 'hovering flag set with no perk owned');
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('tier I: liftoff gains AGL through the real loop (wiring sentinel)', async () => {
    await t.ev('g.gameplay.save.bank = 900');
    const bank = await buyOut(t, 'jetpack', 1);
    t.ok(bank === 0, `tier I should cost exactly $900, $${900 - bank} spent`);
    await t.tp(spot.x, spot.z, 'WALK');
    const agl0 = await agl(t);
    await t.hold('Space');
    await t.wait(1.2); // real rAF ticks, not a stepper — this is the sentinel
    const agl1 = await agl(t);
    t.ok(agl1 > agl0 + 3, `no measured climb through the real loop (AGL ${agl0.toFixed(1)} to ${agl1.toFixed(1)})`);
    t.ok(await t.ev('g.player.hovering'), 'hovering flag never set on liftoff');
    await t.release();
    await t.simStep(3); // settle back down before the next check
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('tier I vs tier III: higher tier climbs higher and faster (measured)', async () => {
    await t.tp(spot.x, spot.z, 'WALK');
    await t.hold('Space');
    await t.simStep(1);
    const climb1 = await agl(t);
    await t.release();
    await t.ev(`g.player.setMode('DRIVE')`); // full reset, including hovering

    await t.ev('g.gameplay.save.bank = 5000');
    const bank = await buyOut(t, 'jetpack', 2); // tier I -> tier III
    t.ok(bank === 0, `tiers II+III should cost exactly $5000, $${5000 - bank} spent`);

    await t.tp(spot.x, spot.z, 'WALK');
    await t.hold('Space');
    await t.simStep(1);
    const climb3 = await agl(t);
    await t.release();
    await t.simStep(4); // settle back down
    t.ok(climb3 > climb1 * 1.3, `tier III didn't measurably out-climb tier I in 1s (${climb1.toFixed(1)} vs ${climb3.toFixed(1)})`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('tier III: ceiling caps at jetAlt without overshoot', async () => {
    const jetAlt = await t.ev('g.player.perks.jetAlt');
    t.near(jetAlt, 70, 0.01, 'tier III jetAlt perk');
    await t.tp(spot.x, spot.z, 'WALK');
    await t.hold('Space');
    await t.simStep(6); // plenty long enough to hit the ceiling
    const a = await agl(t);
    await t.release();
    t.ok(a <= jetAlt + 0.5, `overshot the ceiling: AGL ${a.toFixed(1)} > cap ${jetAlt}`);
    t.ok(a >= jetAlt - 3, `never reached the ceiling: AGL ${a.toFixed(1)}, cap ${jetAlt}`);
    await t.simStep(4); // settle back down
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('descent + land: AGL falls monotonically, hovering clears on touchdown', async () => {
    await t.tp(spot.x, spot.z, 'WALK');
    await t.hold('Space');
    await t.simStep(6); // climb to the ceiling
    const aTop = await agl(t);
    t.ok(aTop > 30, `never got airborne enough to test descent (AGL ${aTop.toFixed(1)})`);
    await t.release();
    await t.simStep(1);
    const aMid = await agl(t);
    await t.simStep(4);
    const aEnd = await agl(t);
    t.ok(aMid < aTop - 1, `no fall after releasing Space: ${aTop.toFixed(1)} -> ${aMid.toFixed(1)}`);
    t.ok(aEnd < aMid, `descent stalled mid-air: ${aMid.toFixed(1)} -> ${aEnd.toFixed(1)}`);
    t.near(aEnd, 0, 0.5, 'AGL after landing');
    t.ok(!(await t.ev('g.player.hovering')), 'hovering flag still set after touchdown');
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('tier III: horizontal air speed reaches jetSpeed, not the 4.5 walk cap', async () => {
    const jetSpeed = await t.ev('g.player.perks.jetSpeed');
    t.near(jetSpeed, 15, 0.01, 'tier III jetSpeed perk');
    await t.tp(spot.x, spot.z, 'WALK');
    await t.ev('g.player.heading = 2.1'); // ugly natural heading, not a tick-grid value
    await t.hold('Space');
    await t.hold('KeyW');
    const { maxSpeed } = await t.simStep(3);
    await t.release();
    t.ok(maxSpeed > 6, `air speed never beat the 4.5 walk cap: ${maxSpeed.toFixed(1)}`);
    t.near(maxSpeed, jetSpeed, 1.5, 'tier III horizontal air speed');
    await t.simStep(4); // settle back down
    await t.ev(`g.player.setMode('DRIVE')`);
  });
}
