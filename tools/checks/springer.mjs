// Sky — the Cedar Park springer spaniel (src/springer.js). Mirrors the
// module's own constants (ROAM_R=70, APPROACH_R=45, PET_R=4) since they
// aren't exported — same idiom as dog.js's FOLLOW_D=2.6 being asserted by
// value in shop.mjs rather than imported.
const ROAM_R = 70, APPROACH_R = 45, PET_R = 4;

// force Sky to a known position/state before a check drives her — checks in
// a suite share one live game, so each one arranges the precondition it needs
async function resetSky(t, x, z, y) {
  await t.ev(`(() => { g.springer.g.position.set(${x}, ${y ?? `g.hAt(${x}, ${z})`}, ${z});
    g.springer.state = 'wander'; g.springer.hop = 0; return true; })()`);
}

export default async function springer(t) {
  const home = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Cedar Park'); return { x: c.x, z: c.z }; })()`);

  await t.check('never leaves the leash: a player far outside ROAM_R does not pull Sky past it', async () => {
    await resetSky(t, home.x, home.z);
    // player parked well past the boundary, off to one side
    await t.tp(home.x + ROAM_R + 200, home.z, 'WALK');
    for (let i = 0; i < 8; i++) {
      await t.step(1.5, 'g.springer.update(dt, g.player.pos)');
      const d = await t.ev(`Math.hypot(g.springer.g.position.x - ${home.x}, g.springer.g.position.z - ${home.z})`);
      t.ok(d <= ROAM_R + 0.5, `Sky drifted ${d.toFixed(1)} units from home (leash is ${ROAM_R}) on sample ${i}`);
    }
  });

  await t.check('approaches when in range: gap to the player strictly closes', async () => {
    await resetSky(t, home.x, home.z);
    // inside ROAM_R itself (not the fence-clamp case) but well outside PET_R,
    // so the approach target is the player directly
    await t.tp(home.x + ROAM_R - 30, home.z, 'WALK');
    const gaps = [];
    for (let i = 0; i < 6; i++) {
      await t.step(1.5, 'g.springer.update(dt, g.player.pos)');
      gaps.push(await t.ev('Math.hypot(g.springer.g.position.x - g.player.pos.x, g.springer.g.position.z - g.player.pos.z)'));
    }
    t.ok(await t.ev("g.springer.state === 'approach'"), 'Sky never switched to approach within the engage band');
    t.ok(gaps[gaps.length - 1] < gaps[0] - 5, `gap didn't meaningfully close: ${gaps.map((g) => g.toFixed(1)).join(' → ')}`);
    t.ok(gaps[gaps.length - 1] <= PET_R + 1, `Sky didn't settle near the player: final gap ${gaps[gaps.length - 1].toFixed(1)}`);
  });

  await t.check('fence-line wait: a player outside ROAM_R pulls Sky to the boundary, not past it', async () => {
    await resetSky(t, home.x, home.z);
    await t.tp(home.x + ROAM_R + 20, home.z, 'WALK'); // inside detection range, outside the leash
    let last = -1;
    for (let i = 0; i < 8; i++) {
      await t.step(1.5, 'g.springer.update(dt, g.player.pos)');
      last = await t.ev(`Math.hypot(g.springer.g.position.x - ${home.x}, g.springer.g.position.z - ${home.z})`);
    }
    t.ok(last > ROAM_R - PET_R - 3 && last <= ROAM_R + 0.5, `Sky settled at ${last.toFixed(1)} from home, expected ≈${ROAM_R} (fence line)`);
    // one more step shouldn't move her further — she's parked, not oscillating
    await t.step(1.5, 'g.springer.update(dt, g.player.pos)');
    const after = await t.ev(`Math.hypot(g.springer.g.position.x - ${home.x}, g.springer.g.position.z - ${home.z})`);
    t.near(after, last, 1.0, 'Sky kept drifting after reaching the fence line — not settled');
  });

  await t.check('pet interaction: E near Sky triggers a happy hop and the HUD prompts for it', async () => {
    // 40 units off downtown Cedar Park — well clear of any procedurally
    // spawned townsfolk (bounded within cityRadius, ~14u here), so the pet
    // hint isn't shadowed by an unrelated NPC hint (see the priority check below)
    await resetSky(t, home.x + 40, home.z);
    const pos = await t.ev('({ x: g.springer.g.position.x, z: g.springer.g.position.z })');
    await t.tp(pos.x + 1.5, pos.z, 'WALK');
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — pet Sky', `expected the pet-Sky hint, got "${hint}"`);
    await t.key('KeyE');
    const hop = await t.ev('g.springer.hop');
    t.ok(hop > 0, `interact() didn't trigger a happy hop (hop=${hop})`);
  });

  await t.check('hint priority: an NPC nearby wins over Sky’s pet prompt', async () => {
    const willie = await t.ev(`(() => { const n = g.npcs.named.find((x) => x.name === 'Willie'); return { x: n.g.position.x, z: n.g.position.z }; })()`);
    await resetSky(t, willie.x + 1, willie.z); // force Sky right on top of an NPC for this check
    await t.tp(willie.x + 1.5, willie.z, 'WALK');
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — talk to Willie', `NPC hint didn't win over Sky's: got "${hint}"`);
  });

  await t.check('real-loop sentinel: main.js’s render loop actually drives springer.update, not just the test stepper', async () => {
    await resetSky(t, home.x + 15, home.z); // outside PET_R, inside approach range
    await t.tp(home.x, home.z, 'WALK');
    const before = await t.ev('({ x: g.springer.g.position.x, z: g.springer.g.position.z })');
    await t.wait(1.5); // real wall time only — no t.step calls touching springer
    const after = await t.ev('({ x: g.springer.g.position.x, z: g.springer.g.position.z })');
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    t.ok(moved > 0.5, `Sky didn't move over 1.5 real seconds (moved ${moved.toFixed(2)}) — is main.js still calling springer.update?`);
  });
}
