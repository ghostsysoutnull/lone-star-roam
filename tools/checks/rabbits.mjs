// Maggy & Chowns — the Georgetown rabbits (src/rabbits.js). Mirrors the
// module's own constants (ROAM_R=30, APPROACH_R=20) since they aren't
// exported — same idiom as springer.mjs asserting Sky's constants by value.
const ROAM_R = 30, APPROACH_R = 20;

// force both rabbits to a known position/state before a check drives them —
// checks in a suite share one live game, so each one arranges its own precondition
async function resetRabbits(t, x, z) {
  await t.ev(`(() => {
    for (const r of g.rabbits.rabbits) {
      r.g.position.set(${x}, g.hAt(${x}, ${z}), ${z});
      r.state = 'wander';
    }
    return true;
  })()`);
}

export default async function rabbits(t) {
  const home = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Georgetown'); return { x: c.x, z: c.z }; })()`);

  await t.check('two named rabbits exist, independently positioned', async () => {
    const r = await t.ev('g.rabbits.rabbits.map((x) => x.name)');
    t.ok(r.length === 2, `expected 2 rabbits, got ${r.length}`);
    t.ok(r.includes('Maggy') && r.includes('Chowns'), `expected Maggy & Chowns, got ${r.join(',')}`);
  });

  await t.check('never leaves the leash: a WALK player far outside ROAM_R does not pull them past it', async () => {
    await resetRabbits(t, home.x, home.z);
    await t.tp(home.x + ROAM_R + 200, home.z, 'WALK');
    for (let i = 0; i < 8; i++) {
      await t.step(1.5, 'g.rabbits.update(dt, g.player.pos, g.player.mode)');
      const ds = await t.ev(`g.rabbits.rabbits.map((r) => Math.hypot(r.g.position.x - ${home.x}, r.g.position.z - ${home.z}))`);
      for (const d of ds) t.ok(d <= ROAM_R + 0.5, `a rabbit drifted ${d.toFixed(1)} units from home (leash is ${ROAM_R}) on sample ${i}`);
    }
  });

  await t.check('ignores vehicles: a DRIVE player deep in range does not trigger frolic', async () => {
    await resetRabbits(t, home.x, home.z);
    await t.tp(home.x + 10, home.z, 'DRIVE');
    await t.step(3, 'g.rabbits.update(dt, g.player.pos, g.player.mode)');
    const states = await t.ev("g.rabbits.rabbits.map((r) => r.state)");
    t.ok(states.every((s) => s === 'wander'), `expected wander while DRIVE-adjacent, got ${states.join(',')}`);
  });

  await t.check('frolics only once the player switches to WALK, and closes distance', async () => {
    await resetRabbits(t, home.x, home.z);
    await t.tp(home.x + 20, home.z, 'DRIVE');
    await t.step(2, 'g.rabbits.update(dt, g.player.pos, g.player.mode)');
    let states = await t.ev("g.rabbits.rabbits.map((r) => r.state)");
    t.ok(states.every((s) => s === 'wander'), `frolicked while still in DRIVE: ${states.join(',')}`);
    await t.ev("g.player.setMode('WALK')");
    const gap0 = await t.ev('Math.hypot(g.rabbits.rabbits[0].g.position.x - g.player.pos.x, g.rabbits.rabbits[0].g.position.z - g.player.pos.z)');
    await t.step(5, 'g.rabbits.update(dt, g.player.pos, g.player.mode)');
    states = await t.ev("g.rabbits.rabbits.map((r) => r.state)");
    t.ok(states.every((s) => s === 'frolic'), `expected frolic once WALK, got ${states.join(',')}`);
    const gap1 = await t.ev('Math.hypot(g.rabbits.rabbits[0].g.position.x - g.player.pos.x, g.rabbits.rabbits[0].g.position.z - g.player.pos.z)');
    t.ok(gap1 < gap0 - 5, `gap to Maggy didn't meaningfully close: ${gap0.toFixed(1)} → ${gap1.toFixed(1)}`);
  });

  await t.check('frolicking is continuous motion, not a settle-and-stop', async () => {
    await resetRabbits(t, home.x, home.z);
    await t.tp(home.x, home.z, 'WALK');
    await t.step(4, 'g.rabbits.update(dt, g.player.pos, g.player.mode)'); // let them arrive and start orbiting
    const p0 = await t.ev('({ x: g.rabbits.rabbits[0].g.position.x, z: g.rabbits.rabbits[0].g.position.z })');
    await t.step(1.5, 'g.rabbits.update(dt, g.player.pos, g.player.mode)');
    const p1 = await t.ev('({ x: g.rabbits.rabbits[0].g.position.x, z: g.rabbits.rabbits[0].g.position.z })');
    const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    t.ok(moved > 0.3, `Maggy went still while "frolicking" near the player (moved ${moved.toFixed(2)})`);
    const d = Math.hypot(p1.x - home.x, p1.z - home.z);
    t.ok(d <= ROAM_R + 0.5, `frolic orbit pushed a rabbit past the leash: ${d.toFixed(1)}`);
  });

  await t.check('fence-line frolic: a WALK player outside ROAM_R keeps them at the boundary, not past it', async () => {
    await resetRabbits(t, home.x, home.z);
    await t.tp(home.x + ROAM_R + 15, home.z, 'WALK'); // inside detection range, outside the leash
    let last;
    for (let i = 0; i < 8; i++) {
      await t.step(1.5, 'g.rabbits.update(dt, g.player.pos, g.player.mode)');
      last = await t.ev(`g.rabbits.rabbits.map((r) => Math.hypot(r.g.position.x - ${home.x}, r.g.position.z - ${home.z}))`);
    }
    for (const d of last) t.ok(d <= ROAM_R + 0.5, `a rabbit crossed the fence to ${d.toFixed(1)} (leash is ${ROAM_R})`);
  });

  await t.check('real-loop sentinel: main.js’s render loop actually drives rabbits.update, not just the test stepper', async () => {
    await resetRabbits(t, home.x + 12, home.z); // inside frolic range once WALK
    await t.tp(home.x, home.z, 'WALK');
    const before = await t.ev('({ x: g.rabbits.rabbits[0].g.position.x, z: g.rabbits.rabbits[0].g.position.z })');
    await t.wait(1.5); // real wall time only — no t.step calls touching rabbits
    const after = await t.ev('({ x: g.rabbits.rabbits[0].g.position.x, z: g.rabbits.rabbits[0].g.position.z })');
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    t.ok(moved > 0.5, `rabbits didn't move over 1.5 real seconds (moved ${moved.toFixed(2)}) — is main.js still calling rabbits.update?`);
  });
}
