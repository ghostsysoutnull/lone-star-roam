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
      persisted: JSON.parse(localStorage.getItem('lonestar-roam-save-v1:1')).seen.intro })`);
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

  // ---- W3: contextual hints, help restructure, Guide, Settings ----

  await t.check('hints fire once from signals; hintCity absorbs tipMap; seen.all silences', async () => {
    // a fresh Tutorial instance sharing the save: the live one stays inactive,
    // so the real loop can't interleave fires between these evals
    await t.ev(`(g.tutorial.active = false, g.gameplay.save.seen = {},
      window.__tut = new g.tutorial.constructor(g.gameplay, () => {}), __tut.begin())`);
    // priority: npc outranks a simultaneous city edge
    await t.ev(`__tut.update(0.2, { npc: true, cityEdge: true })`);
    t.ok(await t.ev('g.gameplay.save.seen.hintNpc === true'), 'hintNpc not fired');
    t.ok(!(await t.ev('g.gameplay.save.seen.hintCity')), 'hintCity fired in the same tick (cooldown ignored)');
    // cooldown holds, then the city hint lands and takes tipMap with it
    await t.ev(`__tut.update(0.2, { cityEdge: true })`);
    t.ok(!(await t.ev('g.gameplay.save.seen.hintCity')), 'hintCity fired inside the 8 s cooldown');
    await t.ev(`(__tut.cd = 0, __tut.update(0.2, { cityEdge: true }))`);
    const city = await t.ev(`({ hint: g.gameplay.save.seen.hintCity, tip: g.gameplay.save.seen.tipMap,
      persisted: JSON.parse(localStorage.getItem('lonestar-roam-save-v1:1')).seen.hintCity })`);
    t.ok(city.hint === true, 'hintCity not fired after cooldown');
    t.ok(city.tip === true, 'hintCity did not absorb tipMap');
    t.ok(city.persisted === true, 'hintCity not persisted');
    // remaining three, one per cleared cooldown
    for (const sig of ['dusk', 'apron', 'band']) {
      await t.ev(`(__tut.cd = 0, __tut.update(0.2, { ${sig}: true }))`);
    }
    const fired = await t.ev('__tut.fired');
    t.ok(fired.join(',') === 'hintNpc,hintCity,hintDusk,hintAirport,hintBand', `fired order: ${fired.join(',')}`);
    // once each: every signal re-raised, no hint re-fires (a TIP may still
    // land here — counts() sees the W2 check's pushed city/landmark — so
    // count hint keys, not total fires)
    await t.ev(`(__tut.cd = 0, __tut.update(0.2, { npc: true, cityEdge: true, dusk: true, apron: true, band: true }))`);
    t.ok((await t.ev('__tut.fired')).filter((k) => k.startsWith('hint')).length === 5, 'a hint fired twice');
    // seen.all (the Skip promise) silences hints too
    await t.ev(`(g.gameplay.save.seen = { all: true }, __tut.fired.length = 0, __tut.begin())`);
    await t.ev(`__tut.update(0.2, { npc: true, cityEdge: true, dusk: true, apron: true, band: true })`);
    t.ok((await t.ev('__tut.fired')).length === 0, 'a hint fired under seen.all');
    t.ok(!(await t.ev('__tut.pending')), 'pending true under seen.all');
  });

  await t.check('real loop wires hint signals: NPC (per-frame path) and band (12 Hz path)', async () => {
    // per-frame path: walk up to Greta (bespoke NPC W of Kerrville). Named
    // NPCs are built at boot on a seeded road shoulder — read the real spot
    // rather than trusting the authored coordinate (roadShoulder may shift it).
    const greta = await t.ev(`(() => { const n = g.npcs.all().find((n) => n.name === 'Greta');
      return n ? { x: n.g.position.x, z: n.g.position.z } : null; })()`);
    t.ok(greta, 'Greta missing from npcs.all()');
    await t.tp(greta.x + 2, greta.z, 'WALK');
    await t.ev(`g.sky.t = 0.35`);
    await t.ev(`(g.gameplay.save.seen = {}, g.tutorial.fired.length = 0, g.tutorial.begin())`);
    await t.ev(`new Promise((res) => { const t0 = performance.now();
      const id = setInterval(() => { if (g.gameplay.save.seen.hintNpc || performance.now() - t0 > 5000) { clearInterval(id); res(); } }, 100); })`);
    t.ok(await t.ev('g.gameplay.save.seen.hintNpc === true'), 'hintNpc never fired standing in talk range');
    // 12 Hz path: across the state line at Hobbs, NM. Every other hint is
    // pre-marked — Hobbs has townsfolk in talk range AND an airfield
    // footprint, and any of them firing first would eat the cooldown.
    await t.tp(-3486, -1923.7, 'DRIVE');
    await t.ev(`(g.gameplay.save.seen = { hintNpc: true, hintCity: true, hintDusk: true, hintAirport: true }, g.tutorial.begin())`);
    await t.ev(`new Promise((res) => { const t0 = performance.now();
      const id = setInterval(() => { if (g.gameplay.save.seen.hintBand || performance.now() - t0 > 5000) { clearInterval(id); res(); } }, 100); })`);
    t.ok(await t.ev('g.gameplay.save.seen.hintBand === true'), 'hintBand never fired across the line');
    await t.ev(`(g.gameplay.save.seen = { all: true }, g.tutorial.active = false)`);
  });

  await t.check('help panel is sectioned Driving / Flying / Menus / Goals', async () => {
    const heads = await t.ev(`[...document.querySelectorAll('#help h3')].map((h) => h.textContent)`);
    t.ok(heads.join(',') === 'Driving,Flying,Menus,Goals', `sections: ${heads.join(',')}`);
    const kbds = await t.ev(`document.querySelectorAll('#help kbd').length`);
    t.ok(kbds >= 20, `only ${kbds} keybinds listed after the restructure`);
  });

  await t.check('Guide replays card + every tip and hint, read-only', async () => {
    const g1 = await t.ev(`(() => {
      const list = document.getElementById('guide-list');
      const text = list.textContent;
      return { card: !!list.querySelector('.guide-card'), welcome: text.includes('Welcome to Texas'),
        missing: [...g.tutorial.TIPS, ...g.tutorial.HINTS].filter((x) => !text.includes(x.msg)).map((x) => x.key) };
    })()`);
    t.ok(g1.card, 'concept card not cloned into the Guide');
    t.ok(g1.welcome, 'card copy missing from the Guide');
    t.ok(!g1.missing.length, `Guide missing: ${g1.missing.join(',')}`);
    // re-presents, never re-arms: opening it leaves seen untouched
    const r = await t.ev(`(() => {
      const before = JSON.stringify(g.gameplay.save.seen);
      const btn = document.getElementById('guide-toggle');
      btn.click();
      const open = document.getElementById('guide-list').style.display;
      btn.click();
      const closed = document.getElementById('guide-list').style.display;
      return { open, closed, same: JSON.stringify(g.gameplay.save.seen) === before };
    })()`);
    t.ok(r.open === 'block' && r.closed === 'none', `toggle open/close: ${r.open}/${r.closed}`);
    t.ok(r.same, 'opening the Guide mutated save.seen');
  });

  await t.check('Settings panel on pause + title, five labeled controls driving live state', async () => {
    const shape = await t.ev(`(() => {
      const p = document.querySelector('#paused .settings'), ti = document.querySelector('#title .settings');
      return { p: !!p, t: !!ti, rows: p ? p.querySelectorAll('.settings-row').length : 0 };
    })()`);
    t.ok(shape.p && shape.t, `panel missing (paused: ${shape.p}, title: ${shape.t})`);
    t.ok(shape.rows === 5, `${shape.rows} rows (want 5)`);
    const click = (sel) => t.ev(`document.querySelector('#paused .settings [data-set="${sel}"]').click()`);
    // toggles: observable flips + storage key + both instances agree.
    // toggleMute no-ops without an AudioContext (headless never gets the user
    // gesture that creates one) — stub the two members it touches so the real
    // function runs end to end.
    await t.ev(`(g.audio.ctx ||= { currentTime: 0 }, g.audio.master ||= { gain: { setTargetAtTime: () => {} } })`);
    const mute0 = await t.ev('g.audio.muted');
    await click('mute');
    t.ok((await t.ev('g.audio.muted')) === !mute0, 'mute toggle did not flip audio.muted');
    const titleLabel = await t.ev(`document.querySelector('#title .settings [data-set="mute"]').textContent`);
    t.ok(titleLabel === (mute0 ? 'On' : 'Off'), `title instance label desynced: ${titleLabel}`);
    await click('mute');
    // drop the stub: every per-frame audio path guards on ctx being null, and
    // a fake ctx without the real graph would crash the loop
    await t.ev(`g.audio.ctx = null`);
    const comp0 = await t.ev(`document.getElementById('compass').style.display !== 'none'`);
    await click('compass');
    t.ok((await t.ev(`document.getElementById('compass').style.display !== 'none'`)) === !comp0, 'compass toggle did not flip the compass');
    t.ok((await t.ev(`localStorage.getItem('lonestar-compass:1')`)) === (comp0 ? 'off' : 'on'), 'compass key not written');
    await click('compass');
    const arrow0 = await t.ev('g.missions.arrowOn');
    await click('arrow');
    t.ok((await t.ev('g.missions.arrowOn')) === !arrow0, 'arrow toggle did not flip missions.arrowOn');
    await click('arrow');
    // steppers: value moves, key written, symmetric restore
    const ui0 = await t.ev('g.hud.ui');
    await click('ui+');
    const ui1 = await t.ev(`({ ui: g.hud.ui, key: localStorage.getItem('lonestar-ui-scale:1'),
      font: document.documentElement.style.fontSize, label: document.querySelector('#paused .settings [data-set="ui"]').textContent })`);
    t.near(ui1.ui, ui0 + 0.1, 0.001, 'ui scale did not step +10%');
    t.ok(parseFloat(ui1.key) === ui1.ui, `ui key ${ui1.key} vs live ${ui1.ui}`);
    t.ok(ui1.font === 10 * ui1.ui + 'px', `root font ${ui1.font} vs ${10 * ui1.ui}px`);
    t.ok(ui1.label === Math.round(ui1.ui * 100) + '%', `ui label ${ui1.label}`);
    await click('ui-');
    t.near(await t.ev('g.hud.ui'), ui0, 0.001, 'ui scale not restored');
    const b0 = await t.ev('g.brands.scale');
    await click('brand+');
    t.near(await t.ev('g.brands.scale'), b0 + 0.05, 0.001, 'brand scale did not step');
    t.ok(parseFloat(await t.ev(`localStorage.getItem('lonestar-brand-scale:1')`)) === (await t.ev('g.brands.scale')), 'brand key not written');
    await click('brand-');
    t.near(await t.ev('g.brands.scale'), b0, 0.001, 'brand scale not restored');
    // keybind path stays in sync: title.show() refreshes labels from live state
    await t.ev(`g.hud.uiScale(1)`);
    await t.ev(`g.title.show()`);
    const shown = await t.ev(`document.querySelector('#title .settings [data-set="ui"]').textContent`);
    t.ok(shown === Math.round((ui0 + 0.1) * 100) + '%', `title show() did not refresh (label ${shown})`);
    await t.ev(`(g.title.hide(), g.hud.uiScale(-1))`);
  });

  await t.check('hintsReset action re-arms the hint path in-game', async () => {
    await t.ev(`g.gameplay.save.seen = { intro: true, all: true }`);
    await t.ev(`g.debug.actions.hintsReset()`);
    const r = await t.ev(`({ all: g.gameplay.save.seen.all, active: g.tutorial.active, title: g.title.active })`);
    t.ok(!r.all, 'seen flags not cleared');
    t.ok(r.active, 'tutorial not armed');
    t.ok(!r.title, 'hintsReset must not stage the title (that is firstRun)');
    await t.ev(`(g.gameplay.save.seen = { all: true }, g.tutorial.active = false)`);
  });

  await t.check('quit write persists save.at without a reload', async () => {
    await t.tp(555.5, -444.25, 'DRIVE');
    await t.ev(`g.player.heading = 0.789`);
    await t.ev(`g.sky.t = 0.42`);
    await t.ev(`(g.gameplay.snapshotAt(g.player, g.sky), g.gameplay.persist())`);
    const raw = await t.ev(`localStorage.getItem('lonestar-roam-save-v1:1')`);
    const at = JSON.parse(raw).at;
    t.near(at.x, 555.5, 0.01, 'persisted x');
    t.near(at.z, -444.25, 0.01, 'persisted z');
    t.ok(at.mode === 'DRIVE', `persisted mode: ${at.mode}`);
    t.near(at.skyT, 0.42, 0.0001, 'persisted clock');
  });

  // ---- W4: named save slots, per-slot settings ----

  await t.check('migrateLegacy copies unsuffixed keys to slot 1 once, without clobbering', async () => {
    // isolate the migration logic from whatever slot 1 already holds
    await t.ev(`(localStorage.removeItem('lonestar-slot'),
      ['lonestar-roam-save-v1', 'lonestar-arrow', 'lonestar-compass', 'lonestar-ui-scale', 'lonestar-brand-scale']
        .forEach((k) => localStorage.removeItem(k + ':1')))`);
    await t.ev(`(localStorage.setItem('lonestar-roam-save-v1', JSON.stringify({ cities: ['LegacyCity'], landmarks: [], roses: [] })),
      localStorage.setItem('lonestar-arrow', 'off'), localStorage.setItem('lonestar-compass', 'off'),
      localStorage.setItem('lonestar-ui-scale', '1.3'), localStorage.setItem('lonestar-brand-scale', '0.4'))`);
    await t.ev(`g.slots.migrateLegacy()`);
    const r1 = await t.ev(`({ pointer: localStorage.getItem('lonestar-slot'),
      save: JSON.parse(localStorage.getItem('lonestar-roam-save-v1:1')).cities,
      arrow: localStorage.getItem('lonestar-arrow:1'), compass: localStorage.getItem('lonestar-compass:1'),
      ui: localStorage.getItem('lonestar-ui-scale:1'), brand: localStorage.getItem('lonestar-brand-scale:1') })`);
    t.ok(r1.pointer === '1', `pointer after migration: ${r1.pointer}`);
    t.ok(r1.save.includes('LegacyCity'), 'save not migrated to slot 1');
    t.ok(r1.arrow === 'off' && r1.compass === 'off' && r1.ui === '1.3' && r1.brand === '0.4', `settings not migrated: ${JSON.stringify(r1)}`);
    // second call with different legacy values must NOT overwrite the existing slot-1 copy
    await t.ev(`localStorage.setItem('lonestar-roam-save-v1', JSON.stringify({ cities: ['OtherCity'], landmarks: [], roses: [] }))`);
    await t.ev(`g.slots.migrateLegacy()`);
    const still = await t.ev(`JSON.parse(localStorage.getItem('lonestar-roam-save-v1:1')).cities`);
    t.ok(still.includes('LegacyCity') && !still.includes('OtherCity'), `second migration overwrote slot 1: ${still}`);
    // this test never touches the live gameplay object (slot stays 1 from harness boot) — restore
    // the pointer to match it so later checks aren't reading a stale lonestar-slot
    await t.ev(`localStorage.setItem('lonestar-slot', g.gameplay.slot)`);
  });

  await t.check('newGame creates a named fresh slot with the curated spawn', async () => {
    await t.tp(9999, -9999, 'WALK');
    await t.ev(`g.title.newGame(2, 'Explorer')`);
    const r = await t.ev(`({ slot: g.gameplay.slot, name: g.gameplay.save.name, mode: g.player.mode,
      seenEmpty: Object.keys(g.gameplay.save.seen).length === 0, pointer: localStorage.getItem('lonestar-slot') })`);
    t.ok(r.slot === 2, `active slot after newGame: ${r.slot}`);
    t.ok(r.name === 'Explorer', `slot name: ${r.name}`);
    t.ok(r.mode === 'DRIVE', `fresh game mode: ${r.mode}`);
    t.ok(r.seenEmpty, 'fresh slot seen not empty');
    t.ok(r.pointer === '2', `pointer: ${r.pointer}`);
  });

  await t.check('slot isolation: writing slot 2 leaves slot 1 storage untouched', async () => {
    const before1 = await t.ev(`localStorage.getItem('lonestar-roam-save-v1:1')`);
    await t.ev(`(g.gameplay.save.cities.push('SlotTwoCity'), g.gameplay.persist())`);
    const after1 = await t.ev(`localStorage.getItem('lonestar-roam-save-v1:1')`);
    t.ok(after1 === before1, 'a slot-2 write mutated slot 1 storage');
    const slot2 = await t.ev(`JSON.parse(localStorage.getItem('lonestar-roam-save-v1:2'))`);
    t.ok(slot2.cities.includes('SlotTwoCity'), 'slot-2 write not persisted under its own key');
  });

  await t.check('select() re-applies per-slot settings live, round trip survives', async () => {
    if ((await t.ev('g.gameplay.slot')) !== 1) await t.ev(`g.title.select(1)`);
    // pin slot 1 to known defaults via the real functions (never a bare key poke)
    await t.ev(`(() => { while (Math.round(g.hud.ui * 10) !== 10) g.hud.uiScale(g.hud.ui < 1 ? 1 : -1); })()`);
    await t.ev(`(document.getElementById('compass').style.display === 'none') && g.hud.toggleCompass()`);
    await t.ev(`!g.missions.arrowOn && g.missions.toggleArrow()`);
    await t.ev(`g.brands.setScale(0.15)`);
    await t.ev(`g.title.select(2)`);
    // slot 2 was never customized before this check — must read back its own (default) values, not slot 1's
    const slot2First = await t.ev(`({ ui: g.hud.ui, compass: document.getElementById('compass').style.display !== 'none',
      arrow: g.missions.arrowOn, brand: g.brands.scale })`);
    t.near(slot2First.ui, 1, 0.001, 'slot 2 ui scale not default on first switch');
    t.ok(slot2First.compass && slot2First.arrow, `slot 2 compass/arrow not default on: ${JSON.stringify(slot2First)}`);
    t.near(slot2First.brand, 0.15, 0.001, 'slot 2 brand scale not default on first switch');
    // customize slot 2, then round-trip through slot 1 and back
    await t.ev(`(() => { while (Math.round(g.hud.ui * 10) !== 14) g.hud.uiScale(g.hud.ui < 1.4 ? 1 : -1); })()`);
    await t.ev(`(g.hud.toggleCompass(), g.missions.toggleArrow(), g.brands.setScale(0.4))`);
    const slot2Set = await t.ev(`({ ui: g.hud.ui, compass: document.getElementById('compass').style.display !== 'none',
      arrow: g.missions.arrowOn, brand: g.brands.scale })`);
    await t.ev(`g.title.select(1)`);
    const slot1Live = await t.ev(`({ slot: g.gameplay.slot, ui: g.hud.ui,
      compass: document.getElementById('compass').style.display !== 'none', arrow: g.missions.arrowOn, brand: g.brands.scale })`);
    t.ok(slot1Live.slot === 1, `active slot: ${slot1Live.slot}`);
    t.near(slot1Live.ui, 1, 0.001, 'slot 1 ui scale not default after switch back');
    t.ok(slot1Live.compass && slot1Live.arrow, `slot 1 compass/arrow not default on after switch back: ${JSON.stringify(slot1Live)}`);
    t.near(slot1Live.brand, 0.15, 0.001, 'slot 1 brand scale not default after switch back');
    await t.ev(`g.title.select(2)`);
    const back = await t.ev(`({ ui: g.hud.ui, compass: document.getElementById('compass').style.display !== 'none',
      arrow: g.missions.arrowOn, brand: g.brands.scale })`);
    t.near(back.ui, slot2Set.ui, 0.001, 'slot 2 ui scale did not survive the round trip');
    t.ok(back.compass === slot2Set.compass && back.arrow === slot2Set.arrow, `slot 2 toggles did not survive: ${JSON.stringify(back)}`);
    t.near(back.brand, slot2Set.brand, 0.001, 'slot 2 brand scale did not survive the round trip');
  });

  await t.check('select() rebuilds city-star visibility for the loaded slot', async () => {
    // pushing to save.cities directly does not retroactively touch the
    // already-built star meshes (only the real drive-in-range path removes
    // one) — the rebuild only happens on a slot switch, so round-trip
    // through another slot to force it
    await t.ev(`g.title.select(1)`);
    await t.ev(`g.gameplay.save.cities.includes('Austin') || (g.gameplay.save.cities.push('Austin'), g.gameplay.persist())`);
    await t.ev(`g.title.newGame(3, 'Fresh')`); // brand-new slot — Austin never visited here
    const presentOnSlot3 = await t.ev(`!!g.gameplay.cityStars.children.find((s) => s.userData.city === 'Austin')`);
    t.ok(presentOnSlot3, 'Austin star missing on a fresh slot that never visited it');
    await t.ev(`g.title.select(1)`);
    const goneOnSlot1 = await t.ev(`!g.gameplay.cityStars.children.find((s) => s.userData.city === 'Austin')`);
    t.ok(goneOnSlot1, 'Austin star still present on slot 1 after reloading it with Austin marked visited');
  });

  await t.check('rename/delete isolate the active slot from a background one', async () => {
    await t.ev(`g.title.select(1)`);
    await t.ev(`g.title.rename(1, 'Bruno')`);
    t.ok((await t.ev(`g.gameplay.save.name`)) === 'Bruno', 'active-slot rename not applied live');
    t.ok(JSON.parse(await t.ev(`localStorage.getItem('lonestar-roam-save-v1:1')`)).name === 'Bruno', 'active-slot rename not persisted');
    await t.ev(`g.title.rename(3, 'Guest')`); // slot 3: background from the previous check
    const afterRename = await t.ev(`({ liveSlot: g.gameplay.slot, liveName: g.gameplay.save.name,
      slot3Name: JSON.parse(localStorage.getItem('lonestar-roam-save-v1:3')).name })`);
    t.ok(afterRename.liveSlot === 1 && afterRename.liveName === 'Bruno', 'a background rename disturbed the active slot');
    t.ok(afterRename.slot3Name === 'Guest', 'background rename not persisted to slot 3');
    await t.ev(`g.title.delete(3)`);
    const afterDelete = await t.ev(`({ raw: localStorage.getItem('lonestar-roam-save-v1:3'), liveSlot: g.gameplay.slot, liveName: g.gameplay.save.name })`);
    t.ok(afterDelete.raw === null, 'slot 3 storage not cleared by delete');
    t.ok(afterDelete.liveSlot === 1 && afterDelete.liveName === 'Bruno', 'a background delete disturbed the active slot');
    // deleting the ACTIVE slot must reload it to empty defaults live, not just clear storage
    await t.ev(`g.title.delete(1)`);
    const emptied = await t.ev(`({ hasSave: g.title.hasSave, name: g.gameplay.save.name, cities: g.gameplay.save.cities.length })`);
    t.ok(!emptied.hasSave && !emptied.name && emptied.cities === 0, `active-slot delete did not reset live state: ${JSON.stringify(emptied)}`);
  });

  await t.check('title.slots() reports empty/occupied rows correctly', async () => {
    // slot 1 emptied by the previous check; slot 2 still occupied ('Explorer', customized settings)
    const rows = await t.ev(`g.title.slots()`);
    t.ok(rows.length === 3, `slot row count: ${rows.length}`);
    const s1 = rows.find((r) => r.slot === 1), s2 = rows.find((r) => r.slot === 2), s3 = rows.find((r) => r.slot === 3);
    t.ok(s1.active && s1.empty, `slot 1 row: ${JSON.stringify(s1)}`);
    t.ok(!s2.active && !s2.empty && s2.name === 'Explorer', `slot 2 row: ${JSON.stringify(s2)}`);
    t.ok(!s3.active && s3.empty, `slot 3 row: ${JSON.stringify(s3)}`); // deleted by the previous check
  });
}
