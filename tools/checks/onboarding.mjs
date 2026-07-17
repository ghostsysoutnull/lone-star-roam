// New Player wave 1: title screen (Continue/New game), resume-in-place
// (save.at), Save & quit to title. The harness auto-enters (window.__harness,
// tools/verify.mjs) so the actual DOM title screen never shows in these
// tests — logic is driven directly through __game.title/gameplay, same
// pattern as debug.js actions (always built, only presentation gated).
//
// Note: an actual location.reload() can't be exercised here — the harness's
// own context-level addInitScript clears localStorage on every navigation
// (including reload), which would wipe the very save.at a real reload is
// supposed to carry forward. The quit test below drives the write half only
// (gameplay.snapshotAt + persist, the same two calls the button/debug action
// make before reload) and asserts localStorage directly.

export default async function onboarding(t) {
  await t.check('title always built, hidden under harness auto-enter', async () => {
    const missing = await t.ev(`['hasSave','apply','awaitChoice','show','hide'].filter((k) => !(k in g.title))`);
    t.ok(!missing.length, `missing on __game.title: ${missing.join(', ')}`);
    const shown = await t.ev(`document.getElementById('title').style.display`);
    t.ok(shown !== 'flex', `title screen visible after harness boot (display: ${shown})`);
  });

  await t.check('hasSave reflects save.at', async () => {
    // fresh harness context: addInitScript clears localStorage every run
    t.ok(!(await t.ev('g.title.hasSave')), 'hasSave true on a fresh save');
    await t.ev(`g.gameplay.snapshotAt(g.player, g.sky)`);
    t.ok(await t.ev('g.title.hasSave'), 'hasSave false after snapshotAt wrote save.at');
  });

  await t.check('Continue restores exact position/heading/mode/altitude/clock', async () => {
    // distinctive, ugly mid-flight pose — not a convenient axis-aligned value.
    // t.tp settles for 0.15s of sim time (FLY drifts on residual speed/vy), so
    // capture the settled pose as ground truth rather than the raw tp args.
    await t.tp(-1234.5, 6789.25, 'FLY', 210.75);
    await t.ev(`g.player.heading = 2.317`);
    await t.ev(`g.sky.t = 0.6231`);
    const want = await t.ev(`({ x: g.player.pos.x, z: g.player.pos.z, y: g.player.pos.y, heading: g.player.heading, skyT: g.sky.t })`);
    await t.ev(`g.gameplay.snapshotAt(g.player, g.sky)`);
    const at = await t.ev('g.gameplay.save.at');
    t.near(at.x, want.x, 0.01, 'save.at.x');
    t.near(at.z, want.z, 0.01, 'save.at.z');
    t.near(at.y, want.y, 0.01, 'save.at.y');
    t.near(at.heading, want.heading, 0.001, 'save.at.heading');
    t.ok(at.mode === 'FLY', `save.at.mode: ${at.mode}`);
    t.near(at.skyT, want.skyT, 0.0001, 'save.at.skyT');

    // move away, then let the title's Continue seam restore it
    await t.tp(0, 0, 'DRIVE');
    await t.ev(`g.sky.t = 0.1`);
    await t.ev(`g.title.apply('continue')`);
    const p = await t.ev(`({ x: g.player.pos.x, z: g.player.pos.z, y: g.player.pos.y, heading: g.player.heading, mode: g.player.mode, skyT: g.sky.t })`);
    t.near(p.x, want.x, 0.01, 'restored x');
    t.near(p.z, want.z, 0.01, 'restored z');
    t.near(p.y, want.y, 0.01, 'restored y (FLY altitude)');
    t.near(p.heading, want.heading, 0.001, 'restored heading');
    t.ok(p.mode === 'FLY', `restored mode: ${p.mode}`);
    t.near(p.skyT, want.skyT, 0.0001, 'restored clock');
  });

  await t.check('New game spawns at the curated San Antonio approach', async () => {
    // an ugly prior state — WALK, far corner — must not leak into the fresh game
    await t.tp(9999, -9999, 'WALK');
    await t.ev(`g.title.apply('new')`);
    const r = await t.ev(`(() => {
      const p = g.player.pos;
      const road = g.nearestRoad(p.x, p.z, 6);
      const sa = g.GEO.cities.find((c) => c.name === 'San Antonio');
      return { mode: g.player.mode, heading: g.player.heading, inTx: g.inTexas(p.x, p.z),
        roadD: road ? Math.hypot(road.x - p.x, road.z - p.z) : 99,
        saD: Math.hypot(p.x - sa.x, p.z - sa.z) };
    })()`);
    t.ok(r.mode === 'DRIVE', `fresh game mode: ${r.mode}`);
    t.ok(r.inTx, 'curated spot outside Texas');
    t.ok(r.roadD < 2, `spawned ${r.roadD.toFixed(2)} units off the road centerline`);
    t.ok(r.saD > 15 && r.saD < 45, `San Antonio ${r.saD.toFixed(1)} units away (want an approach, not downtown)`);
    t.near(r.heading, 1.582, 0.05, 'heading down the I-35 approach');
  });

  await t.check('intro card seam: fresh save pends it, Start and Skip mark seen', async () => {
    await t.ev(`g.gameplay.save.seen = {}`);
    t.ok(await t.ev('g.title.needsIntro'), 'needsIntro false on a fresh save');
    await t.ev(`g.title.finishIntro(false)`);
    const started = await t.ev(`({ intro: g.gameplay.save.seen.intro, all: g.gameplay.save.seen.all,
      persisted: JSON.parse(localStorage.getItem('lonestar-roam-save-v1')).seen.intro })`);
    t.ok(started.intro === true && !started.all, `Start: intro=${started.intro} all=${started.all} (want intro only)`);
    t.ok(started.persisted === true, 'seen.intro not persisted');
    t.ok(!(await t.ev('g.title.needsIntro')), 'needsIntro still true after Start');
    await t.ev(`g.gameplay.save.seen = {}`);
    await t.ev(`g.title.finishIntro(true)`);
    t.ok(await t.ev('g.gameplay.save.seen.all === true'), 'Skip: seen.all not set');
    t.ok(!(await t.ev('g.tutorial.pending')), 'tips still pending after Skip');
  });

  await t.check('tips fire in play order, once each, and skip() silences the rest', async () => {
    // finishIntro above armed the tutorial via onEnter — reset to a clean slate
    await t.ev(`(g.gameplay.save.seen = {}, g.tutorial.fired.length = 0, g.tutorial.begin())`);
    await t.step(11, 'g.tutorial.update(dt)');
    t.ok(await t.ev(`g.gameplay.save.seen.tipV === true`), 'tipV not fired after 11 s of play');
    await t.ev(`g.gameplay.save.cities.push('Testville')`);
    await t.step(9, 'g.tutorial.update(dt)');
    t.ok(await t.ev(`g.gameplay.save.seen.tipMap === true`), 'tipMap not fired after first city');
    await t.ev(`g.gameplay.save.landmarks.push('Test Marker')`);
    await t.step(9, 'g.tutorial.update(dt)');
    t.ok(await t.ev(`g.gameplay.save.seen.tipCollect === true`), 'tipCollect not fired after first find');
    await t.step(120, 'g.tutorial.update(dt)');
    const fired = await t.ev('g.tutorial.fired');
    t.ok(fired.join(',') === 'tipV,tipMap,tipCollect,tipHelp', `fired order: ${fired.join(',')}`);
    // re-arm and re-step: seen flags must hold, nothing fires twice
    await t.ev(`g.tutorial.begin()`);
    await t.step(150, 'g.tutorial.update(dt)');
    t.ok((await t.ev('g.tutorial.fired')).length === 4, 'a tip fired twice after re-arm');
    // mid-stream skip: pending goes false and stays false
    await t.ev(`(g.gameplay.save.seen = {}, g.tutorial.begin(), g.tutorial.skip())`);
    t.ok(!(await t.ev('g.tutorial.pending')), 'pending after mid-stream skip()');
    await t.step(30, 'g.tutorial.update(dt)');
    t.ok((await t.ev('g.tutorial.fired')).length === 4, 'a tip fired after skip()');
  });

  await t.check('title facts rotate from the landmark/critter/census pools', async () => {
    const f = await t.ev(`({ n: g.title.facts.length,
      bad: g.title.facts.filter((s) => typeof s !== 'string' || s.length < 10).length,
      alamo: g.title.facts.some((s) => s.includes('1718')),
      critter: g.title.facts.some((s) => s.includes('quadruplets')),
      census: g.title.facts.filter((s) => s.includes('2022 census')).length })`);
    t.ok(f.n > 50, `only ${f.n} facts pooled`);
    t.ok(!f.bad, `${f.bad} malformed facts in the pool`);
    t.ok(f.alamo && f.critter, `pool missing landmarks (${f.alamo}) or critters (${f.critter})`);
    t.ok(f.census >= 4, `only ${f.census} census facts (want cattle + crop leaders)`);
    const seq = await t.ev(`(() => { const out = [];
      for (let i = 0; i < 3; i++) { g.title.rotateFact(); out.push(document.getElementById('title-fact').textContent); }
      return { out, inPool: out.every((s) => g.title.facts.includes(s.replace('💡 ', ''))) }; })()`);
    t.ok(new Set(seq.out).size === 3, 'rotation repeated a fact back-to-back');
    t.ok(seq.inPool, 'rotated text left the pool');
  });

  await t.check('attract: world lives behind the title, player frozen', async () => {
    await t.tp(985, 1737, 'DRIVE');
    await t.ev(`g.sky.t = 0.35`);
    const before = await t.ev(`({ simT: g.player.simT, x: g.player.pos.x, z: g.player.pos.z, skyT: g.sky.t, angle: g.title.angle })`);
    await t.ev(`g.title.show()`);
    // wait on the drift itself (player.simT is frozen here, so t.simWait would hang);
    // bounded — resolves at 3 s regardless and the asserts below catch a dead drift
    await t.ev(`new Promise((res) => { const a = g.title.angle, t0 = performance.now();
      const id = setInterval(() => { if (g.title.angle > a + 0.006 || performance.now() - t0 > 3000) { clearInterval(id); res(); } }, 50); })`);
    const after = await t.ev(`({ simT: g.player.simT, x: g.player.pos.x, z: g.player.pos.z, skyT: g.sky.t, angle: g.title.angle })`);
    t.ok(after.angle > before.angle + 0.005, `drift never advanced (Δangle ${(after.angle - before.angle).toFixed(4)})`);
    t.ok(after.simT === before.simT, `player sim ticked during title (ΔsimT ${(after.simT - before.simT).toFixed(3)})`);
    t.near(after.x, before.x, 0.001, 'player x moved during title');
    t.near(after.z, before.z, 0.001, 'player z moved during title');
    t.ok(after.skyT > before.skyT, `sky froze behind the title (skyT ${before.skyT} → ${after.skyT})`);
    // HUD chrome hides behind the translucent title (the Copilot shot caught it leaking)
    const hudVis = await t.ev(`getComputedStyle(document.getElementById('minimap')).visibility`);
    t.ok(hudVis === 'hidden', `minimap visible behind the title (visibility: ${hudVis})`);
    await t.ev(`g.title.hide()`);
    t.ok(!(await t.ev('g.title.active')), 'title still active after hide()');
    t.ok((await t.ev(`getComputedStyle(document.getElementById('minimap')).visibility`)) === 'visible', 'minimap still hidden after hide()');
  });

  await t.check('firstRun action stages the empty-save path', async () => {
    await t.ev(`g.gameplay.save.seen = { intro: true, all: true }`);
    await t.ev(`g.debug.actions.firstRun()`);
    const r = await t.ev(`({ active: g.title.active, intro: g.gameplay.save.seen.intro,
      shown: document.getElementById('title').style.display })`);
    t.ok(r.active, 'title not staged by firstRun');
    t.ok(!r.intro, 'seen flags not cleared by firstRun');
    t.ok(r.shown === 'flex', `title DOM not shown (display: ${r.shown})`);
    await t.ev(`g.title.hide()`);
  });

  await t.check('quit write persists save.at without a reload', async () => {
    await t.tp(555.5, -444.25, 'DRIVE');
    await t.ev(`g.player.heading = 0.789`);
    await t.ev(`g.sky.t = 0.42`);
    await t.ev(`(g.gameplay.snapshotAt(g.player, g.sky), g.gameplay.persist())`);
    const raw = await t.ev(`localStorage.getItem('lonestar-roam-save-v1')`);
    const at = JSON.parse(raw).at;
    t.near(at.x, 555.5, 0.01, 'persisted x');
    t.near(at.z, -444.25, 0.01, 'persisted z');
    t.ok(at.mode === 'DRIVE', `persisted mode: ${at.mode}`);
    t.near(at.skyT, 0.42, 0.0001, 'persisted clock');
  });
}
