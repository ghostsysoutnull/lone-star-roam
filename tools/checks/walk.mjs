// WALK-mode sprint: builds up after a sustained straight-line forward walk
// (no modifier key), drains stamina while active, and drops instantly on any
// turn/stop/back-up. This is a *cyclic* state machine (build -> sprint ->
// drain -> relock), unlike e.g. the jetpack's monotonic climb — so the usual
// t.hold()/t.simStep()/t.release() pattern (separate command round trips)
// left a gap where the real render loop could silently advance the cycle
// between commands and land on a different phase under load, flaking. Every
// check here instead runs setup + key phases + physics entirely inside ONE
// evaluate call (runWalk), which removes that gap.

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

// phases: [{keys: {KeyW: true, ...}, duration: seconds}, ...], applied in
// order within one synchronous loop. Returns a snapshot after each phase
// plus maxSpeed/maxLegAmp accumulated across the whole run.
const runWalk = (t, x, z, heading, phases) => t.ev(`(() => {
  const p = g.player;
  p.setMode('WALK');
  p.pos.set(${x}, 0, ${z});
  p.speed = 0; p.vy = 0; p.heading = ${heading};
  p.stamina = 1; p.sprinting = false; p.sprintBuildup = 0;
  const dt = 0.05;
  const phases = ${JSON.stringify(phases)};
  const snaps = [];
  let maxSpeed = 0, maxLegAmp = 0;
  for (const ph of phases) {
    p.keys = ph.keys;
    for (let i = 0, n = Math.round(ph.duration / dt); i < n; i++) {
      p.update(dt);
      maxSpeed = Math.max(maxSpeed, Math.abs(p.speed));
      maxLegAmp = Math.max(maxLegAmp, Math.abs(p.cowboy.userData.ll.rotation.x));
    }
    snaps.push({ speed: p.speed, sprinting: p.sprinting, stamina: p.stamina });
  }
  p.keys = {};
  return { snaps, maxSpeed, maxLegAmp };
})()`);

export default async function walk(t) {
  const spot = await roadFreeSpot(t);
  t.ok(spot, 'no road-free bubble found near Austin');

  await t.check('sustained straight walk builds sprint past the 6 walk cap', async () => {
    const { snaps, maxSpeed } = await runWalk(t, spot.x, spot.z, 2.1, [
      { keys: { KeyW: true }, duration: 3 },
    ]);
    t.ok(maxSpeed > 9, `never measurably exceeded the 6 walk cap: ${maxSpeed.toFixed(2)}`);
    t.ok(snaps[0].sprinting, 'sprinting flag never set after 3s of straight walking');
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('turning cancels sprint immediately, before stamina depletes', async () => {
    const { snaps } = await runWalk(t, spot.x, spot.z, 0, [
      { keys: { KeyW: true }, duration: 2 },
      { keys: { KeyW: true, KeyA: true }, duration: 0.05 }, // one tick — cancel is same-frame
    ]);
    t.ok(snaps[0].sprinting, 'never reached sprint before testing the turn-cancel');
    t.ok(!snaps[1].sprinting, 'sprinting survived a steer input');
    t.ok(snaps[1].stamina >= snaps[0].stamina - 0.02,
      `stamina kept draining after the turn should have cancelled sprint: ${snaps[0].stamina.toFixed(2)} -> ${snaps[1].stamina.toFixed(2)}`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('releasing forward cancels sprint immediately; holding back never sprints', async () => {
    const release = await runWalk(t, spot.x, spot.z, 0, [
      { keys: { KeyW: true }, duration: 2 },
      { keys: {}, duration: 0.05 },
    ]);
    t.ok(release.snaps[0].sprinting, 'never reached sprint before testing the release-cancel');
    t.ok(!release.snaps[1].sprinting, 'sprinting survived releasing forward');

    const backup = await runWalk(t, spot.x, spot.z, 0, [
      { keys: { KeyS: true }, duration: 2 },
    ]);
    t.ok(backup.maxSpeed <= 2.6, `backing up exceeded the -2.5 back cap: ${backup.maxSpeed.toFixed(2)}`);
    t.ok(!backup.snaps[0].sprinting, 'sprinting flag set while only backing up');
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('stamina drains while sprinting and regenerates once not sprinting', async () => {
    const { snaps } = await runWalk(t, spot.x, spot.z, 0, [
      { keys: { KeyW: true }, duration: 2 },
      { keys: {}, duration: 2 },
    ]);
    t.ok(snaps[0].stamina < 0.9, `stamina barely drained after 2s of sprinting: ${snaps[0].stamina.toFixed(2)}`);
    t.ok(snaps[1].stamina > snaps[0].stamina,
      `stamina didn't regenerate after stopping: ${snaps[0].stamina.toFixed(2)} -> ${snaps[1].stamina.toFixed(2)}`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('exhausting stamina forces back to walk speed and re-locks sprint', async () => {
    const { snaps } = await runWalk(t, spot.x, spot.z, 0, [
      // trigger sprint (~0.9s), fully drain it (~5.6s more, done by ~6.5s),
      // then land before it re-locks and builds a second sprint (~7.4s) —
      // 6.9s sits in the middle of that ~0.9s-wide window
      { keys: { KeyW: true }, duration: 6.9 },
    ]);
    t.ok(!snaps[0].sprinting, 'still sprinting after stamina should have hit 0');
    t.near(snaps[0].speed, 6, 1, 'speed after forced drop-out (expected back near the walk cap)');
    t.ok(snaps[0].stamina < 0.5, `stamina should still be low right after depletion: ${snaps[0].stamina.toFixed(2)}`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('leg-swing amplitude keeps growing into sprint range instead of saturating at the old cap', async () => {
    const walking = await runWalk(t, spot.x, spot.z, 0, [
      { keys: { KeyW: true }, duration: 0.6 }, // well under the 0.9s sprint buildup
    ]);
    const sprinting = await runWalk(t, spot.x, spot.z, 0, [
      { keys: { KeyW: true }, duration: 2.6 }, // comfortably sprinting at full speed by the end
    ]);
    t.ok(sprinting.maxLegAmp > walking.maxLegAmp * 1.3,
      `leg-swing amplitude didn't grow from walk to sprint: ${walking.maxLegAmp.toFixed(3)} -> ${sprinting.maxLegAmp.toFixed(3)}`);
    await t.ev(`g.player.setMode('DRIVE')`);
  });
}
