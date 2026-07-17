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

  await t.check('New game seam spawns at the curated Austin spot', async () => {
    await t.tp(9999, -9999, 'WALK');
    await t.ev(`g.title.apply('new')`);
    const d = await t.ev(`(() => {
      const c = g.GEO.cities.find((c) => c.name === 'Austin');
      return Math.hypot(g.player.pos.x - c.x, g.player.pos.z - (c.z + 12));
    })()`);
    t.ok(d < 20, `landed ${d.toFixed(1)} units from the Austin spawn`);
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
