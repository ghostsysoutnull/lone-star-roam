// Delivery-mission loop end to end: accept → load at origin → haul → deliver,
// with exact payout math (missions.js deliver(): late ×0.5, road bonus ×1.5,
// rounded to $5). Deadlines tick in raw dt (wall time), arrivals check at 4 Hz
// on the ground — teleports land in DRIVE at agl 0, so t.until covers both.

const cityXZ = (t, name) =>
  t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === ${JSON.stringify(name)}); return { x: c.x, z: c.z }; })()`);

export default async function missions(t) {
  await t.check('job board offers 4 ground + 4 charter resolvable jobs', async () => {
    const { n, nGround, nCharter, bad, badCharter } = await t.ev(`(() => {
      const offers = g.missions.offers;
      const ground = offers.filter((o) => o.kind !== 'charter');
      const charter = offers.filter((o) => o.kind === 'charter');
      const bad = ground.filter((o) =>
        o.from === o.to || !g.missions.city(o.from) || !g.missions.city(o.to) || o.pay <= 0 || o.deadline <= 0).length;
      const badCharter = charter.filter((o) =>
        o.fromId === o.toId || !g.AIRPORTS.find((a) => a.id === o.fromId) || !g.AIRPORTS.find((a) => a.id === o.toId) || o.pay <= 0 || o.deadline <= 0).length;
      return { n: offers.length, nGround: ground.length, nCharter: charter.length, bad, badCharter };
    })()`);
    t.ok(n === 8 && nGround === 4 && nCharter === 4, `${n} offers (${nGround} ground, ${nCharter} charter)`);
    t.ok(bad === 0, `${bad} malformed ground offers`);
    t.ok(badCharter === 0, `${badCharter} malformed charter offers`);
  });

  const offer = await t.ev('({ ...g.missions.offers[0] })');

  await t.check('accept → pickup phase, persisted, no crate yet', async () => {
    await t.ev('g.missions.accept(g.missions.offers[0])');
    t.ok((await t.ev('g.missions.job.phase')) === 'pickup', 'phase not pickup');
    const stored = await t.ev(`JSON.parse(localStorage['lonestar-roam-save-v1']).job?.phase`);
    t.ok(stored === 'pickup', `not persisted (got ${stored})`);
    t.ok(!(await t.ev('g.player.truck.userData.cargo.visible')), 'crate visible before loading');
  });

  await t.check('crates load at the origin city', async () => {
    const from = await cityXZ(t, offer.from);
    await t.tp(from.x, from.z);
    await t.until(`g.missions.job && g.missions.job.phase === 'haul'`, 20000);
    t.ok(await t.ev('g.player.truck.userData.cargo.visible'), 'crate not visible after load');
  });

  await t.check('fast travel locks while hauling', async () => {
    const { allLocked, hint } = await t.ev(`(() => {
      g.travel.tab = 'Cities'; g.travel.render();
      const btns = [...document.querySelectorAll('#travel .poi-list button')];
      return { allLocked: btns.length > 0 && btns.every((b) => b.disabled),
               hint: document.querySelector('#travel .hint').textContent };
    })()`);
    t.ok(allLocked, 'some city button still enabled mid-haul');
    t.ok(hint.includes('Cargo aboard'), `hint: "${hint}"`);
  });

  await t.check('deadline ticks down in wall time', async () => {
    const l0 = await t.ev('g.missions.job.left');
    await t.wait(2);
    const l1 = await t.ev('g.missions.job.left');
    t.ok(l0 - l1 > 1.4 && l0 - l1 < 3.5, `ticked ${(l0 - l1).toFixed(1)}s over 2s wall`);
  });

  await t.check('HUD shows the haul line', async () => {
    await t.until(`g.hud.els.job.textContent.includes(${JSON.stringify(offer.to)})`, 8000);
  });

  await t.check('going airborne voids the road bonus', async () => {
    t.ok(!(await t.ev('g.missions.job.flew')), 'flew already set');
    await t.ev(`g.player.setMode('FLY')`);
    await t.until('g.missions.job.flew', 8000);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('on-time delivery pays ×1 (bonus voided), new offers', async () => {
    const bank0 = await t.ev('g.gameplay.save.bank');
    const to = await cityXZ(t, offer.to);
    await t.tp(to.x, to.z);
    await t.until('!g.missions.job', 20000);
    const bank1 = await t.ev('g.gameplay.save.bank');
    const expected = Math.round(offer.pay / 5) * 5; // on time, no ×1.5 (we flew)
    t.ok(bank1 - bank0 === expected, `paid $${bank1 - bank0}, expected $${expected}`);
    t.ok((await t.ev('g.gameplay.save.jobsDone')) >= 1, 'jobsDone not bumped');
    t.ok(!(await t.ev('g.player.truck.userData.cargo.visible')), 'crate still visible');
    t.ok((await t.ev('g.missions.offers.length')) === 8, 'offers not regenerated');
  });

  await t.check('late road delivery pays ×0.5×1.5', async () => {
    const o = await t.ev('({ ...g.missions.offers[0] })');
    await t.ev('g.missions.accept(g.missions.offers[0])');
    const from = await cityXZ(t, o.from);
    await t.tp(from.x, from.z);
    await t.until(`g.missions.job && g.missions.job.phase === 'haul'`, 20000);
    await t.ev('g.missions.job.left = -1'); // blow the deadline; stay on the ground
    const bank0 = await t.ev('g.gameplay.save.bank');
    const to = await cityXZ(t, o.to);
    await t.tp(to.x, to.z);
    await t.until('!g.missions.job', 20000);
    const paid = (await t.ev('g.gameplay.save.bank')) - bank0;
    const expected = Math.round((o.pay * 0.5 * 1.5) / 5) * 5;
    t.ok(paid === expected, `paid $${paid}, expected $${expected} (pay $${o.pay})`);
  });

  await t.check('abandon clears the job and the crate', async () => {
    await t.ev('g.missions.accept(g.missions.offers[0])');
    await t.ev('g.missions.abandon()');
    t.ok(!(await t.ev('g.missions.job')), 'job survived abandon');
    t.ok(!(await t.ev('g.player.truck.userData.cargo.visible')), 'crate survived abandon');
  });

  // --- charter jobs: airport-pair offers requiring a real touchdown at both ends ---
  const rwCenter = (t, id) => t.ev(`(() => { const a = g.AIRPORTS.find((x) => x.id === '${id}'); return { cx: a.rws[0].cx, cz: a.rws[0].cz }; })()`);
  const landAt = async (t, id, mode = 'FLY') => {
    const rw = await rwCenter(t, id);
    const h = await t.ev(`g.hAt(${rw.cx}, ${rw.cz})`);
    await t.tp(rw.cx, rw.cz, mode, h + 1);
  };

  await t.check('charter: pickup logs an actual landing, not proximity', async () => {
    await t.ev("g.missions.force('DFW', 'HOU')");
    t.ok((await t.ev('g.missions.job.kind')) === 'charter', 'force() did not create a charter job');
    const rw = await rwCenter(t, 'DFW');
    const h = await t.ev(`g.hAt(${rw.cx}, ${rw.cz})`);
    await t.tp(rw.cx, rw.cz, 'FLY', h + 20); // airborne over the field, not landed
    await t.wait(0.6);
    t.ok((await t.ev('g.missions.job.phase')) === 'pickup', 'arrival fired from altitude alone');
    await landAt(t, 'DFW');
    await t.until("g.missions.job && g.missions.job.phase === 'haul'", 8000);
    await t.ev('g.missions.abandon()');
  });

  await t.check('charter: does not fire in DRIVE mode even on the runway pavement', async () => {
    await t.ev("g.missions.force('DFW', 'HOU')");
    await landAt(t, 'DFW', 'DRIVE');
    await t.wait(0.6);
    t.ok((await t.ev('g.missions.job.phase')) === 'pickup', 'arrival fired while driving on the runway');
    await t.ev('g.missions.abandon()');
  });

  await t.check('charter: full pickup→deliver cycle at a tier-3 strip (Armstrong Ranch)', async () => {
    await t.ev("g.missions.force('ARM', 'DFW')");
    await landAt(t, 'ARM');
    await t.until("g.missions.job && g.missions.job.phase === 'haul'", 8000);
    const bank0 = await t.ev('g.gameplay.save.bank');
    await landAt(t, 'DFW');
    await t.until('!g.missions.job', 8000);
    const paid = (await t.ev('g.gameplay.save.bank')) - bank0;
    t.ok(paid > 0, `tier-3 charter delivery paid $${paid}`);
  });

  await t.check('charter livery applies on accept and reverts on abandon', async () => {
    const stock = await t.ev('g.player.wings.userData.stockColor');
    t.ok((await t.ev('g.player.wings.userData.mat.color.getHex()')) === stock, 'wings not stock color before a charter job');
    await t.ev("g.missions.force('DAL', 'HOU')");
    t.ok((await t.ev('g.player.wings.userData.mat.color.getHex()')) !== stock, 'livery did not apply on accept');
    await t.ev('g.missions.abandon()');
    t.ok((await t.ev('g.player.wings.userData.mat.color.getHex()')) === stock, 'livery did not revert on abandon');
  });

  await t.check('charter fast-travel lock holds during haul (regression)', async () => {
    await t.ev("g.missions.force('DAL', 'HOU')");
    await landAt(t, 'DAL');
    await t.until("g.missions.job && g.missions.job.phase === 'haul'", 8000);
    const { allLocked, hint } = await t.ev(`(() => {
      g.travel.tab = 'Cities'; g.travel.render();
      const btns = [...document.querySelectorAll('#travel .poi-list button')];
      return { allLocked: btns.length > 0 && btns.every((b) => b.disabled),
               hint: document.querySelector('#travel .hint').textContent };
    })()`);
    t.ok(allLocked, 'city buttons not locked mid-charter-haul');
    t.ok(hint.includes('Cargo aboard'), `hint: "${hint}"`);
    await t.ev('g.missions.abandon()');
  });

  await t.check('charter late delivery pays half', async () => {
    await t.ev("g.missions.force('LBB', 'AMA')");
    await landAt(t, 'LBB');
    await t.until("g.missions.job && g.missions.job.phase === 'haul'", 8000);
    const pay = await t.ev('g.missions.job.pay');
    await t.ev('g.missions.job.left = -1');
    const bank0 = await t.ev('g.gameplay.save.bank');
    await landAt(t, 'AMA');
    await t.until('!g.missions.job', 8000);
    const paid = (await t.ev('g.gameplay.save.bank')) - bank0;
    const expected = Math.round((pay * 0.5) / 5) * 5;
    t.ok(paid === expected, `paid $${paid}, expected $${expected}`);
  });
}
