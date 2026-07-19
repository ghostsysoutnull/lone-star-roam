// Shoulder & Shelf, wave 4 — Ferries and the working water: rideable Bolivar
// car ferry (position-driven crossing — ferries.js drives player.pos/heading
// directly rather than true scene-graph reparenting; see its header for why),
// bottlenose dolphins bow-riding every crossing, and the fast-travel/haul-job
// lock while aboard. Checks share one ferry's state in sequence (out, then
// back), same pattern as padre.mjs's turtle-release check driving turtles.js
// directly instead of the real render loop for the 25s-long crossing.

export default async function ferries(t) {
  await t.check('dock-proximity boards the ferry in DRIVE, freezing speed', async () => {
    const dock = await t.ev(`(() => {
      const r = g.ferries.routes.find((r) => r.key === 'bolivar');
      const d = r.side === 'a' ? r.a : r.b;
      return { x: d[0], z: d[1] };
    })()`);
    await t.tp(dock.x, dock.z); // DRIVE by default — boarding lives in the real render loop
    await t.wait(0.2);
    const res = await t.ev(`({
      aboard: g.player.aboardFerry,
      phase: g.ferries.routes.find((r) => r.key === 'bolivar').phase,
      speed: g.player.speed,
    })`);
    t.ok(res.aboard, 'parking on the dock ramp in DRIVE did not board the ferry');
    t.ok(res.phase === 'crossing', `route phase is "${res.phase}", expected crossing`);
    t.ok(res.speed === 0, `speed not frozen at boarding: ${res.speed}`);
  });

  await t.check('crossing: dolphin logs from the REAL render loop (not a bypassed stepper)', async () => {
    // wired-into-main.js sentinel — everything else in this suite drives
    // ferries.update/dolphins.update manually for speed, which would happily
    // pass even if main.js's render loop never called them at all
    const before = await t.ev(`({ x: g.player.pos.x, z: g.player.pos.z })`);
    await t.wait(5); // real frames — past SPOT_T (0.15 of 25s = 3.75s), real loop should log it
    const mid = await t.ev(`({
      x: g.player.pos.x, z: g.player.pos.z,
      aboard: g.player.aboardFerry, dolphin: g.gameplay.save.species.includes('dolphin'),
    })`);
    t.ok(mid.aboard, 'disembarked before the 25s crossing finished');
    const moved = Math.hypot(mid.x - before.x, mid.z - before.z);
    t.ok(moved > 1, `barely moved 5s into a 25s crossing under the real loop: ${moved.toFixed(2)}u`);
    t.ok(mid.dolphin, 'dolphin not logged by the real render loop — is dolphins.update wired into main.js?');
  });

  await t.check('crossing: position rides A→B over the fixed 25s; input is frozen; arrival re-arms only once the player leaves the dock', async () => {
    const STEP = 'g.ferries.update(dt, g.clock.elapsedTime); g.dolphins.update(dt, g.clock.elapsedTime); g.player.update(dt);';
    await t.ev(`g.player.keys['KeyW'] = true`); // held through the rest of the crossing — must never move the truck
    // ~5s already elapsed via the real loop in the previous check; this stays
    // short of the remaining ~20s so the crossing is still provably in progress
    await t.step(15, STEP, 'g.player.aboardFerry === false');
    const mid = await t.ev(`({ aboard: g.player.aboardFerry, speed: g.player.speed })`);
    t.ok(mid.aboard, 'crossing finished earlier than the 25s budget — timing assumption drifted');
    t.ok(mid.speed === 0, `held KeyW moved the throttle mid-crossing: speed ${mid.speed}`);
    // mid-Gulf by now (~20s of 25s, well clear of shore) — no proximity toasts
    // pending, so this is the one sanctioned SHOT: deck composition only
    await t.shot('ferry-deck-crossing');
    // finish it — once aboardFerry drops, the SAME tick's player.update() sees
    // control already returned, so held input legitimately resumes that instant
    await t.step(15, STEP, 'g.player.aboardFerry === false');
    await t.ev(`g.player.keys['KeyW'] = false`);
    const end = await t.ev(`(() => {
      const r = g.ferries.routes.find((r) => r.key === 'bolivar');
      const shore = r.side === 'a' ? r.a : r.b;
      return { aboard: g.player.aboardFerry, mode: g.player.mode, side: r.side, x: g.player.pos.x, z: g.player.pos.z, shoreX: shore[0], shoreZ: shore[1] };
    })()`);
    t.ok(!end.aboard, 'still aboard after the 25s budget — the fixed crossing never completed');
    t.ok(end.mode === 'DRIVE', `arrived in ${end.mode}, expected DRIVE`);
    t.ok(end.side === 'b', `route stuck on side "${end.side}" after the outbound crossing`);
    t.near(end.x, end.shoreX, 0.6, 'player x not at the arrival ramp');
    t.near(end.z, end.shoreZ, 0.6, 'player z not at the arrival ramp');
    // ping-pong regression guard: parked right on the just-arrived ramp, still
    // in DRIVE — a broken "armed" gate would immediately re-board here
    await t.ev(`g.player.keys['KeyW'] = false`);
    await t.ev(`(g.player.speed = 0)`);
    await t.step(3, 'g.ferries.update(dt, g.clock.elapsedTime); g.player.update(dt);');
    const still = await t.ev(`g.player.aboardFerry`);
    t.ok(!still, 'arrival re-armed boarding instantly — the ferry ping-ponged back out with the player still parked on the ramp');
  });

  await t.check('return trip: boarding again crosses B→A', async () => {
    const STEP = 'g.ferries.update(dt, g.clock.elapsedTime); g.player.update(dt);';
    await t.ev(`g.ferries.board('bolivar')`);
    const started = await t.ev(`g.player.aboardFerry`);
    t.ok(started, 'force-boarding for the return trip failed (route not docked at b?)');
    await t.step(30, STEP, 'g.player.aboardFerry === false');
    const res = await t.ev(`(() => {
      const r = g.ferries.routes.find((r) => r.key === 'bolivar');
      const shore = r.side === 'a' ? r.a : r.b;
      return { side: r.side, x: g.player.pos.x, z: g.player.pos.z, shoreX: shore[0], shoreZ: shore[1] };
    })()`);
    t.ok(res.side === 'a', `return trip left the route on side "${res.side}", expected a`);
    t.near(res.x, res.shoreX, 0.5, 'player x not back at the origin ramp');
    t.near(res.z, res.shoreZ, 0.5, 'player z not back at the origin ramp');
  });

  await t.check('fast travel and an active haul job both hold through a crossing', async () => {
    const STEP = 'g.ferries.update(dt, g.clock.elapsedTime); g.player.update(dt); g.missions.update(dt, g.player.pos, g.player.mode, 0);';
    await t.ev(`g.gameplay.save.job = { kind: 'road', phase: 'haul', left: 200, deadline: 200, from: 'Bolivar Ferry', to: 'El Paso', icon: '\u{1F4E6}' }`);
    const before = await t.ev(`g.missions.job.left`);
    await t.ev(`g.ferries.board('bolivar')`);
    await t.step(6, STEP);
    const mid = await t.ev(`(() => {
      g.travel.tab = 'Cities'; g.travel.render();
      return {
        hint: document.querySelector('#travel .hint').textContent,
        disabled: [...document.querySelectorAll('#travel .poi-list button')].every((b) => b.disabled),
        jobLeft: g.missions.job.left, aboard: g.player.aboardFerry,
      };
    })()`);
    t.ok(mid.aboard, 'not aboard mid-crossing — setup failed');
    t.ok(/Mid-crossing/.test(mid.hint), `travel hint doesn't mention the crossing lock: "${mid.hint}"`);
    t.ok(mid.disabled, 'a POI button stayed clickable while aboard the ferry');
    t.ok(mid.jobLeft < before, 'haul deadline did not tick while aboard the ferry');
    await t.step(20, STEP, 'g.player.aboardFerry === false');
    const after = await t.ev(`(() => { g.travel.render(); return document.querySelector('#travel .hint').textContent; })()`);
    t.ok(!/Mid-crossing/.test(after), 'travel menu still shows the crossing lock after disembarking');
    await t.ev(`g.gameplay.save.job = null`);
  });

  await t.check('Port Aransas Ferry: docks clear the water, gap fits the boat, a full crossing completes', async () => {
    const STEP = 'g.ferries.update(dt, g.clock.elapsedTime); g.player.update(dt);';
    const res = await t.ev(`(() => {
      const r = g.ferries.routes.find((r) => r.key === 'portaransas');
      const gap = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
      return {
        gap,
        mainlandOnIsland: g.onIsland(r.a[0], r.a[1]),
        islandOnIsland: g.onIsland(r.b[0], r.b[1]),
        hA: g.hAt(r.a[0], r.a[1]), hB: g.hAt(r.b[0], r.b[1]),
      };
    })()`);
    t.ok(res.gap > 20, `dock gap (${res.gap.toFixed(1)}u) barely clears the 15-unit boat hull — regression of the Bolivar-vs-Port-Aransas fix`);
    t.ok(!res.mainlandOnIsland, `mainland terminal reads onIsland — it drifted onto Mustang Island`);
    t.ok(res.islandOnIsland, 'island terminal is not onIsland — it drifted off Mustang Island');
    t.ok(Math.abs(res.hA) < 15 && Math.abs(res.hB) < 15, `dock terrain height out of a sane coastal range: ${res.hA.toFixed(1)} / ${res.hB.toFixed(1)}`);

    const dock = await t.ev(`(() => { const r = g.ferries.routes.find((r) => r.key === 'portaransas'); const d = r.side === 'a' ? r.a : r.b; return { x: d[0], z: d[1] }; })()`);
    await t.tp(dock.x, dock.z);
    await t.wait(0.2);
    const boarded = await t.ev(`g.player.aboardFerry`);
    t.ok(boarded, 'dock-proximity boarding failed for the Port Aransas route');
    await t.step(30, STEP, 'g.player.aboardFerry === false');
    const end = await t.ev(`(() => {
      const r = g.ferries.routes.find((r) => r.key === 'portaransas');
      const shore = r.side === 'a' ? r.a : r.b;
      return { aboard: g.player.aboardFerry, mode: g.player.mode, x: g.player.pos.x, z: g.player.pos.z, shoreX: shore[0], shoreZ: shore[1] };
    })()`);
    t.ok(!end.aboard, 'Port Aransas crossing never completed within 30s');
    t.ok(end.mode === 'DRIVE', `arrived in ${end.mode}, expected DRIVE`);
    t.near(end.x, end.shoreX, 0.5, 'player x not at the Port Aransas arrival ramp');
    t.near(end.z, end.shoreZ, 0.5, 'player z not at the Port Aransas arrival ramp');
  });

  await t.check('arrival drive-off: the BOAT waterline stop never locks the ramp', async () => {
    // Water Vehicles W1 non-interference: aim inland (away from the channel)
    // and confirm the truck rolls off the just-arrived ramp
    const p0 = await t.ev(`(() => {
      const r = g.ferries.routes.find((r) => r.key === 'portaransas');
      const here = r.side === 'a' ? r.a : r.b, other = r.side === 'a' ? r.b : r.a;
      g.player.heading = Math.atan2(-(here[0] - other[0]), -(here[1] - other[1]));
      return { x: g.player.pos.x, z: g.player.pos.z };
    })()`);
    await t.hold('KeyW');
    await t.simStep(2);
    await t.release();
    const res = await t.ev(`({ x: g.player.pos.x, z: g.player.pos.z, aboard: g.player.aboardFerry })`);
    const moved = Math.hypot(res.x - p0.x, res.z - p0.z);
    t.ok(moved > 3, `truck stuck on the arrival ramp (moved ${moved.toFixed(1)}u) — waterline stop misfiring at the dock`);
    t.ok(!res.aboard, 'driving off the ramp re-boarded the ferry');
  });
}
