// Delivery-mission loop end to end: accept → load at origin → haul → deliver,
// with exact payout math (missions.js deliver(): late ×0.5, road bonus ×1.5,
// rounded to $5). Deadlines tick in raw dt (wall time), arrivals check at 4 Hz
// on the ground — teleports land in DRIVE at agl 0, so t.until covers both.

const cityXZ = (t, name) =>
  t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === ${JSON.stringify(name)}); return { x: c.x, z: c.z }; })()`);

export default async function missions(t) {
  await t.check('job board offers 4 ground + 3 energy + 4 charter + 2 sea resolvable jobs', async () => {
    const { n, nGround, nEnergy, nCharter, nSea, bad, badEnergy, badCharter, badSea } = await t.ev(`(() => {
      const offers = g.missions.offers;
      const ground = offers.filter((o) => !o.kind);
      const energy = offers.filter((o) => o.kind === 'energy');
      const charter = offers.filter((o) => o.kind === 'charter');
      const sea = offers.filter((o) => o.kind === 'sea');
      const bad = ground.filter((o) =>
        o.from === o.to || !g.missions.city(o.from) || !g.missions.city(o.to) || o.pay <= 0 || o.deadline <= 0).length;
      // energy endpoints resolve as a hero site (by id) or a city (by name)
      const end = (siteId, name) => siteId ? g.missions.site(siteId) : g.missions.city(name);
      const badEnergy = energy.filter((o) =>
        o.from === o.to || !end(o.siteFrom, o.from) || !end(o.siteTo, o.to) || o.pay <= 0 || o.deadline <= 0).length;
      const badCharter = charter.filter((o) =>
        o.fromId === o.toId || !g.AIRPORTS.find((a) => a.id === o.fromId) || !g.AIRPORTS.find((a) => a.id === o.toId) || o.pay <= 0 || o.deadline <= 0).length;
      const badSea = sea.filter((o) =>
        o.fromId === o.toId || !g.GEO.sea.ports.find((p) => p.id === o.fromId) || !g.GEO.sea.ports.find((p) => p.id === o.toId) || o.pay <= 0 || o.deadline <= 0).length;
      return { n: offers.length, nGround: ground.length, nEnergy: energy.length, nCharter: charter.length, nSea: sea.length, bad, badEnergy, badCharter, badSea };
    })()`);
    t.ok(n === 13 && nGround === 4 && nEnergy === 3 && nCharter === 4 && nSea === 2, `${n} offers (${nGround} ground, ${nEnergy} energy, ${nCharter} charter, ${nSea} sea)`);
    t.ok(bad === 0, `${bad} malformed ground offers`);
    t.ok(badEnergy === 0, `${badEnergy} malformed energy offers`);
    t.ok(badCharter === 0, `${badCharter} malformed charter offers`);
    t.ok(badSea === 0, `${badSea} malformed sea offers`);
  });

  const offer = await t.ev('({ ...g.missions.offers[0] })');

  await t.check('accept → pickup phase, persisted, no crate yet', async () => {
    await t.ev('g.missions.accept(g.missions.offers[0])');
    t.ok((await t.ev('g.missions.job.phase')) === 'pickup', 'phase not pickup');
    const stored = await t.ev(`JSON.parse(localStorage['lonestar-roam-save-v1:1']).job?.phase`);
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
    t.ok((await t.ev('g.missions.offers.length')) === 13, 'offers not regenerated');
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

  // --- sea jobs: dock-to-dock hauls, BOAT-only arrival (Sea-Industry W3) ---
  const dockXZ = (t, id) => t.ev(`(() => {
    const p = g.GEO.sea.ports.find((p) => p.id === ${JSON.stringify(id)});
    const d = p.berth ?? p.roadstead;
    return { x: d[0], z: d[1] };
  })()`);

  await t.check('every SEA_RUNS from/to port id resolves in GEO.sea.ports', async () => {
    const bad = await t.ev(`(async () => {
      const { POOLS } = await import('/src/missions.js');
      const ids = new Set(g.GEO.sea.ports.map((p) => p.id));
      const bad = [];
      for (const r of POOLS.SEA_RUNS) {
        for (const id of r.from) if (!ids.has(id)) bad.push(r.cargo + ':from:' + id);
        for (const id of r.to) if (!ids.has(id)) bad.push(r.cargo + ':to:' + id);
      }
      return bad;
    })()`);
    t.ok(bad.length === 0, `SEA_RUNS ids not in GEO.sea.ports: ${bad.join(' ')}`);
  });

  await t.check('sea job: forceSea pins houston→corpus, docked+slow loads, speeding past does not', async () => {
    const offer = await t.ev("g.missions.forceSea('houston', 'corpus')");
    t.ok(offer && offer.kind === 'sea', 'forceSea did not create a sea job');
    t.ok((await t.ev('g.missions.job.fromId')) === 'houston' && (await t.ev('g.missions.job.toId')) === 'corpus',
      'pinned endpoints drifted');
    const houston = await dockXZ(t, 'houston');
    // docked but still making way (≥3) — must NOT load
    await t.tp(houston.x, houston.z, 'BOAT');
    await t.ev('g.player.speed = 5');
    await t.wait(0.4);
    t.ok((await t.ev('g.missions.job.phase')) === 'pickup', 'load fired while still under way at the dock');
    // slow to a stop at the dock — loads
    await t.ev('g.player.speed = 0');
    await t.until(`g.missions.job && g.missions.job.phase === 'haul'`, 8000);
    t.ok(await t.ev('g.player.skiff.userData.cargo.visible'), 'skiff crate not visible after sea load');
    t.ok(!(await t.ev('g.player.truck.userData.cargo.visible')), 'truck bed crate visible for a sea haul');
  });

  await t.check('sea job: travel lock holds mid-haul', async () => {
    const { allLocked, hint } = await t.ev(`(() => {
      g.travel.tab = 'Cities'; g.travel.render();
      const btns = [...document.querySelectorAll('#travel .poi-list button')];
      return { allLocked: btns.length > 0 && btns.every((b) => b.disabled),
               hint: document.querySelector('#travel .hint').textContent };
    })()`);
    t.ok(allLocked, 'some city button still enabled mid-sea-haul');
    t.ok(hint.includes('Cargo aboard'), `hint: "${hint}"`);
  });

  await t.check('sea job: deliver at the destination dock pays the all-water bonus', async () => {
    const corpus = await dockXZ(t, 'corpus');
    const bank0 = await t.ev('g.gameplay.save.bank');
    await t.tp(corpus.x, corpus.z, 'BOAT');
    await t.ev('g.player.speed = 0');
    await t.until(`document.getElementById('toast').textContent.includes('all-water bonus')`, 8000);
    const toast = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(toast.includes('×1.5 all-water bonus'), `delivery toast missing the all-water bonus note: "${toast}"`);
    t.ok(!(await t.ev('g.missions.job')), 'job survived a delivered sea haul');
    const bank1 = await t.ev('g.gameplay.save.bank');
    t.ok(bank1 > bank0, `sea delivery did not pay: ${bank0} → ${bank1}`);
    t.ok(!(await t.ev('g.player.skiff.userData.cargo.visible')), 'skiff crate still visible after delivery');
  });

  // W7 — every name on the board must resolve. An unresolvable `from` silently
  // falls back to the nearest-15 cities (the cargo just loses its origin); an
  // unresolvable `to` drops the row out of circulation entirely and NOTHING
  // fails. Both are invisible in play, so assert the tables directly.
  await t.check('every city and airport named in the board tables resolves', async () => {
    const r = await t.ev(`(async () => {
      const { POOLS } = await import('/src/missions.js');
      const ids = new Set(g.AIRPORTS.map((a) => a.id));
      const badFrom = [], badTo = [], badRoute = [], milRoute = [];
      for (const c of POOLS.CARGO) {
        for (const n of c.from ?? []) if (!g.missions.city(n)) badFrom.push(c.name + ':' + n);
        for (const n of c.to ?? []) if (!g.missions.city(n)) badTo.push(c.name + ':' + n);
      }
      for (const r of POOLS.REAL_ROUTES) for (const id of [r.a, r.b]) {
        if (!ids.has(id)) badRoute.push(r.manifest + ':' + id);
        else if (g.AIRPORTS.find((a) => a.id === id).military) milRoute.push(r.manifest + ':' + id);
      }
      return { badFrom, badTo, badRoute, milRoute,
        noted: POOLS.CARGO.filter((c) => c.note).length,
        toPref: POOLS.CARGO.filter((c) => c.to).length };
    })()`);
    t.ok(r.badFrom.length === 0, `CARGO origins not in GEO.cities: ${r.badFrom.join(' ')}`);
    t.ok(r.badTo.length === 0, `CARGO destinations not in GEO.cities: ${r.badTo.join(' ')}`);
    t.ok(r.badRoute.length === 0, `REAL_ROUTES ids not in AIRPORTS: ${r.badRoute.join(' ')}`);
    t.ok(r.milRoute.length === 0, `REAL_ROUTES routes cargo to a military field: ${r.milRoute.join(' ')}`);
    t.ok(r.noted >= 6, `${r.noted} cargo rows carry a note (want ≥6)`);
    t.ok(r.toPref >= 3, `${r.toPref} cargo rows name a destination (want ≥3)`);
  });

  // The whole point of the `to` preference: a cargo that names its destination
  // KEEPS it. Falling back to a random city would leave the note talking about
  // the Malaquite nest walk on a Houston→Beaumont run — flavor that contradicts
  // the job it's printed on. Regenerate a lot of boards and assert it never slips.
  await t.check('a cargo that names its destination never ships anywhere else', async () => {
    const r = await t.ev(`(async () => {
      const { POOLS } = await import('/src/missions.js');
      const pref = new Map(POOLS.CARGO.filter((c) => c.to).map((c) => [c.name, c.to]));
      const noteOf = new Map(POOLS.CARGO.map((c) => [c.name, c.note ?? null]));
      const violations = [], noteMismatch = [];
      let seen = 0, prefSeen = 0;
      for (let i = 0; i < 400; i++) {
        for (const o of g.missions.genGroundOffers()) {
          seen++;
          if (o.note !== noteOf.get(o.cargo)) noteMismatch.push(o.cargo);
          if (!pref.has(o.cargo)) continue;
          prefSeen++;
          if (!pref.get(o.cargo).includes(o.to)) violations.push(o.cargo + '→' + o.to);
          if (o.from === o.to) violations.push(o.cargo + ' from==to');
        }
      }
      return { violations: [...new Set(violations)], noteMismatch: [...new Set(noteMismatch)], seen, prefSeen };
    })()`);
    t.ok(r.seen > 1000, `only ${r.seen} offers generated — the board is not filling`);
    // if the preference silently killed those rows they'd never appear at all,
    // and a zero-violation pass would be meaningless
    t.ok(r.prefSeen > 20, `destination-preferenced cargo appeared ${r.prefSeen} times in ${r.seen} offers — the rows are being dropped, not honored`);
    t.ok(r.violations.length === 0, `cargo delivered off its named destination: ${r.violations.slice(0, 5).join(' ')}`);
    t.ok(r.noteMismatch.length === 0, `offer note doesn't match its cargo row: ${r.noteMismatch.slice(0, 5).join(' ')}`);
  });
}
