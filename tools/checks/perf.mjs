// Perf instrumentation (Performance W1, src/perf.js + main.js laps).
// Harness caveat baked into every check here: Playwright's fake clock also
// fakes performance.now, so lap ms all read ~0 headless — assert structure,
// tick counts (n) and monotonic counters, never nonzero ms. Real ms come
// from a real browser via the debug Perf tab (the spec's baseline protocol).

// pinned to main.js's lap call sites — a dropped or renamed perf.lap() fails here
const LAPS = ['ferries', 'dolphins', 'player', 'sky', 'scenery', 'airports',
  'aviation', 'cities', 'brands', 'traffic', 'trains', 'maritime', 'energy',
  'heli', 'blimp', 'military', 'ufo', 'haunts', 'shoulder', 'flares', 'dog',
  'springer', 'rabbits', 'radio', 'animals', 'bats', 'turtles', 'audio',
  'gameplay', 'missions', 'npcs', 'hints'];

export default async function perf(t) {
  await t.check('lap table is complete: every render-loop system reports a sane record', async () => {
    await t.tp(-2767, 334, 'DRIVE'); // empty I-10 west — road-free run not needed, just a cheap known spot
    await t.wait(0.5);
    const snap = await t.ev('g.perf.snapshot()');
    for (const name of LAPS) {
      const L = snap.laps[name];
      t.ok(L, `no lap recorded for '${name}' — was its perf.lap() call dropped from main.js?`);
      t.ok(Number.isFinite(L.avg) && L.avg >= 0, `'${name}' avg is not a sane number: ${L.avg}`);
      t.ok(Number.isFinite(L.max) && L.max >= 0, `'${name}' max is not a sane number: ${L.max}`);
      t.ok(L.n > 0, `'${name}' never ticked (n=${L.n})`);
    }
    t.ok(Number.isFinite(snap.frameMs.avg) && snap.frameMs.avg >= 0, `frameMs.avg not sane: ${snap.frameMs.avg}`);
  });

  await t.check('real-loop sentinel: frames and laps keep ticking, through a weather change', async () => {
    const before = await t.ev("({ frames: g.perf.frames, player: g.perf.laps.player.n })");
    await t.wait(0.5);
    await t.setWeather('storm'); // laps must survive live weather churn, not just idle frames
    await t.wait(0.5);
    const after = await t.ev("({ frames: g.perf.frames, player: g.perf.laps.player.n })");
    t.ok(after.frames > before.frames, `perf.frames stuck at ${after.frames} — is main.js still calling perf.frame()?`);
    t.ok(after.player > before.player, `player lap stuck at n=${after.player} over a second of loop time`);
    await t.setWeather('clear'); // hermetic: don't leak storm into a sibling suite
  });

  await t.check('hud lap ticks at its 12 Hz cadence, slower than per-frame laps', async () => {
    const b = await t.ev('({ hud: g.perf.laps.hud.n, player: g.perf.laps.player.n })');
    await t.wait(1.0);
    const a = await t.ev('({ hud: g.perf.laps.hud.n, player: g.perf.laps.player.n })');
    t.ok(a.hud > b.hud, `hud lap never ticked over a second (n=${a.hud}) — did the lap leave the 12 Hz block?`);
    t.ok(a.hud - b.hud < a.player - b.player, `hud lap ticked every frame (${a.hud - b.hud} vs player ${a.player - b.player}) — it must sit inside the throttled block`);
  });

  await t.check('snapshot shape: fps, render mirror and heap field are typed right', async () => {
    const s = await t.ev('g.perf.snapshot()');
    t.ok(Number.isFinite(s.fps) && s.fps >= 0, `fps not sane: ${s.fps}`);
    for (const k of ['calls', 'triangles', 'geometries', 'textures', 'programs']) {
      t.ok(Number.isFinite(s.render[k]), `render.${k} missing or non-numeric: ${s.render[k]}`);
    }
    t.ok(s.memoryMB === null || Number.isFinite(s.memoryMB), `memoryMB neither null nor number: ${s.memoryMB}`);
  });

  await t.check('renderProbe draws one true frame: nonzero draw calls and triangles under __skipRender', async () => {
    const r = await t.ev('g.perf.renderProbe()');
    t.ok(r.calls > 0, `renderProbe reported ${r.calls} draw calls — probe did not actually render`);
    t.ok(r.triangles > 0, `renderProbe reported ${r.triangles} triangles`);
    const mirrored = await t.ev('g.perf.render.calls');
    t.ok(mirrored === r.calls, `probe result (${r.calls}) not mirrored into perf.render (${mirrored})`);
  });

  await t.check('resetMax clears the peaks without touching counters', async () => {
    const before = await t.ev('({ max: g.perf.frameMs.max, n: g.perf.laps.player.n })');
    const after = await t.ev('(g.perf.resetMax(), { max: g.perf.frameMs.max, scen: g.perf.laps.scenery.max, n: g.perf.laps.player.n })');
    t.ok(after.max <= before.max, `frameMs.max grew across reset: ${before.max} → ${after.max}`);
    t.ok(Number.isFinite(after.scen) && after.scen >= 0, `scenery max not reset to a sane value: ${after.scen}`);
    t.ok(after.n >= before.n, `resetMax rolled back tick counters (${before.n} → ${after.n})`);
  });
}
