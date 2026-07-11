// Shop economy end to end: broke buyers bounce, purchases deduct exact prices
// and persist, and every upgrade line changes *measured* behavior — top speed
// driven on I-10, offroad speed in a road-free bubble, headlight intensity
// after dark — not just the perks numbers. Lacy is verified by distance over
// time in WALK (the flee-heading lesson: a wrong sign sends her running away).

// keep the truck on the motorway while flooring it (same trick as drive.mjs)
async function motorwayTopSpeed(t) {
  await t.tp(-2767, 334); // empty I-10 west of Fort Stockton — no cross streets
  await t.ev(`(() => {
    const p = g.player, r = g.nearestRoad(p.pos.x, p.pos.z, 400, (ty) => ty === 'motorway');
    p.pos.set(r.x, 0, r.z);
    p.heading = Math.atan2(-r.tx, -r.tz);
  })()`);
  await t.hold('KeyW');
  let maxSpeed = 0;
  const t0 = await t.ev('g.player.simT');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const s = await t.ev(`(() => {
      const p = g.player, r = g.nearestRoad(p.pos.x, p.pos.z, 12, (ty) => ty === 'motorway');
      if (r) {
        let ax = r.x + r.tx * 8, az = r.z + r.tz * 8;
        let h = Math.atan2(-(ax - p.pos.x), -(az - p.pos.z));
        const d = ((h - p.heading) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        if (Math.abs(d) > Math.PI / 2) {
          ax = r.x - r.tx * 8; az = r.z - r.tz * 8;
          h = Math.atan2(-(ax - p.pos.x), -(az - p.pos.z));
        }
        p.heading = h;
      }
      return { spd: r && r.dist < 4 ? p.speed : 0, tm: p.simT };
    })()`);
    maxSpeed = Math.max(maxSpeed, s.spd);
    if (s.tm - t0 > 5) break;
    await t.wait(0.06);
  }
  await t.release();
  return maxSpeed;
}

// buy one shop line to max through the real travel-menu path
const buyOut = (t, id, times) => t.ev(`(() => {
  for (let i = 0; i < ${times}; i++) g.travel.buyItem('${id}');
  return g.gameplay.save.bank;
})()`);

export default async function shop(t) {
  await t.check('broke buyer: buttons disabled, purchase bounces', async () => {
    const r = await t.ev(`(() => {
      g.gameplay.save.bank = 0;
      g.travel.tab = 'Shop'; g.travel.render();
      const btns = [...document.querySelectorAll('#travel .poi-list button')];
      g.travel.buyItem('engine');
      return { n: btns.length, disabled: btns.every((b) => b.disabled),
               lvl: g.gameplay.save.gear.engine ?? 0, bank: g.gameplay.save.bank };
    })()`);
    t.ok(r.n === 4, `${r.n} shop items rendered, expected 4`);
    t.ok(r.disabled, 'an unaffordable item was clickable');
    t.ok(r.lvl === 0 && r.bank === 0, `broke purchase went through (lvl ${r.lvl}, bank ${r.bank})`);
  });

  await t.check('engine III: measured top speed rises 24%', async () => {
    await t.setWeather('clear');
    const stock = await motorwayTopSpeed(t);
    t.near(stock, 46, 3, 'stock top speed'); // baseline sanity before comparing
    await t.ev('g.gameplay.save.bank = 3050');
    const bank = await buyOut(t, 'engine', 3);
    t.ok(bank === 0, `tiers should cost exactly $3050, $${3050 - bank} spent`);
    const tuned = await motorwayTopSpeed(t);
    const cap = 46 * 1.24;
    t.ok(tuned > stock + 6, `no felt gain: ${stock.toFixed(1)} → ${tuned.toFixed(1)}`);
    t.ok(tuned <= cap + 0.5, `over tuned cap: ${tuned.toFixed(1)} > ${cap.toFixed(1)}`);
    t.ok(tuned >= cap * 0.85, `never neared tuned cap: ${tuned.toFixed(1)}`);
  });

  await t.check('ranch tires III: offroad speed reaches 32', async () => {
    await t.ev('g.gameplay.save.bank = 3050');
    await buyOut(t, 'tires', 3);
    // road-free bubble wide enough for a 32 u/s run (~75 units in 2.3 s)
    const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);
    const spot = await t.ev(`(() => {
      for (const dz of [-40, -160, -280, -400, 80])
        for (let x = ${austin.x} - 120; x > ${austin.x} - 1500; x -= 30) {
          const z = ${austin.z} + dz;
          if (!g.nearestRoad(x, z, 140) && g.inTexas(x, z)) return { x, z };
        }
      return null;
    })()`);
    t.ok(spot, 'no road-free bubble found');
    await t.tp(spot.x, spot.z);
    await t.ev('g.player.heading = 3.7');
    await t.hold('KeyW');
    await t.simWait(2.3);
    const spd = await t.ev('g.player.speed');
    await t.release();
    const cap = 32 * (1 - Math.min(1, await t.ev('g.ATMOS.rain')) * 0.08);
    t.near(spd, cap, 1.5, 'upgraded offroad speed');
  });

  await t.check('headlights III: the real lamp burns at 80 after dark', async () => {
    await t.ev('g.gameplay.save.bank = 3050');
    await buyOut(t, 'lights', 3);
    await t.setNight();
    await t.ev(`(g.player.setMode('DRIVE'), g.player.speed = 0)`);
    // UFO flicker can blink headlights.visible off for a frame — poll for the lit one
    await t.until('g.player.headLight.intensity > 0', 8000);
    const i = await t.ev('g.player.headLight.intensity');
    const rain = Math.min(1, await t.ev('g.ATMOS.rain'));
    t.near(i, 80 + rain * 12, 4, 'upgraded headlight intensity');
    await t.setDay();
  });

  await t.check('Lacy rides the bed, perches on cargo crates, yips after the horn', async () => {
    await t.ev('g.gameplay.save.bank = 750');
    const bank = await buyOut(t, 'dog', 1);
    t.ok(bank === 0, 'dog price not deducted exactly');
    await t.wait(0.3);
    const bed = await t.ev(`({ owned: g.dog.owned, inTruck: g.dog.g.parent === g.player.truck,
      visible: g.dog.g.visible, y: g.dog.g.position.y })`);
    t.ok(bed.owned && bed.visible, 'dog not owned/visible after purchase');
    t.ok(bed.inTruck, 'dog not riding in the truck in DRIVE');
    t.near(bed.y, 0.93, 0.05, 'bed-floor perch height');
    await t.ev('g.player.truck.userData.cargo.visible = true');
    await t.wait(0.3);
    t.near(await t.ev('g.dog.g.position.y'), 1.48, 0.05, 'crate perch height');
    await t.ev('g.player.truck.userData.cargo.visible = false');
    await t.key('Space'); // horn in DRIVE
    const barks = await t.ev('g.dog.barks');
    t.ok(barks >= 1 && barks <= 2, `expected 1–2 queued yips, got ${barks}`);
  });

  await t.check('Lacy follows on foot: tracks a walking player, settles behind', async () => {
    const pos = await t.ev('({ x: g.player.pos.x, z: g.player.pos.z })');
    await t.tp(pos.x, pos.z, 'WALK');
    await t.ev('g.player.heading = 2.1'); // ugly natural heading
    await t.hold('KeyW');
    const t0 = await t.ev('g.player.simT');
    let maxD = 0;
    while ((await t.ev('g.player.simT')) - t0 < 6) {
      maxD = Math.max(maxD, await t.ev(
        'Math.hypot(g.dog.g.position.x - g.player.pos.x, g.dog.g.position.z - g.player.pos.z)'));
      await t.wait(0.15);
    }
    await t.release();
    t.ok(maxD < 10, `dog lost the cowboy mid-walk (gap hit ${maxD.toFixed(1)})`); // inverted heading ⇒ runs away
    t.ok(await t.ev('g.dog.g.parent !== g.player.truck'), 'dog still parented to the hidden truck');
    await t.simWait(2.5); // player stopped — she comes to heel
    const d = await t.ev('Math.hypot(g.dog.g.position.x - g.player.pos.x, g.dog.g.position.z - g.player.pos.z)');
    t.ok(d > 1.2 && d < 4.5, `settled ${d.toFixed(1)} units away, expected ≈2.6`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('gear levels persist in the save', async () => {
    const gear = await t.ev(`JSON.parse(localStorage['lonestar-roam-save-v1']).gear`);
    for (const [id, lvl] of [['engine', 3], ['tires', 3], ['lights', 3], ['dog', 1]])
      t.ok(gear?.[id] === lvl, `gear.${id} = ${gear?.[id]}, expected ${lvl}`);
  });
}
