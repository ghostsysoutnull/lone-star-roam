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

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];

// Wave 2 guardrails, retuned after the W3 fog-wall gate (PERFORMANCE_SPEC.md
// Findings #6–8): the gate halved the settled draw base (Houston storm
// 2041 → 934). This check probes 0.6 s after teleport, which still carries
// the teleport transient (the prior spot's scenery chunks in the camera
// wedge, ~+300 calls — Finding #8), so the cap is set against the HARNESS
// context max (~1300), not the settled one: 1600 ≈ 1.23× headroom, the W2
// margin ratio. Triangles were never the problem (flat ~1.6–1.7 M, mostly
// the merged static world) — that cap stays. Count-based only: per-system/
// total ms thresholds are pointless per Findings #5 (all tiny, machine-bound).
const CAPS = { draws: 1600, triangles: 2.5e6 };

// the W1 tour spots (src/tours.js "Performance" track) — same staging so the
// numbers here track the recorded baseline table
const PERF_SPOTS = [
  { label: 'Houston downtown, night storm', xz: LL(29.7604, -95.3698), mode: 'DRIVE', time: 0.98, weather: 'storm' },
  { label: 'I-10 west floor, clear day', xz: [-2767, 334], mode: 'DRIVE', time: 0.35, weather: 'clear' },
  { label: 'Sweetwater wind corridor, dusk', xz: [-650, -1430], mode: 'FLY', time: 0.79, weather: 'clear' },
];

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

  await t.check('record + formatRecords: paste-ready export carries context and every lap', async () => {
    const n = await t.ev("g.perf.record({ x: g.player.pos.x, z: g.player.pos.z, mode: g.player.mode, t: g.sky.t, weather: 'clear' })");
    t.ok(n === 1, `expected first record in a fresh context, got count ${n}`);
    const text = await t.ev('g.perf.formatRecords()');
    t.ok(text.startsWith('=== perf record 1'), `export missing the record header: "${text.slice(0, 60)}"`);
    t.ok(/·\sDRIVE\s·/.test(text), 'export missing the mode context');
    t.ok(/\ndraws \d+ · tris \d+/.test(text), 'export missing the render-counts line');
    for (const name of ['player', 'traffic', 'animals', 'hud']) {
      t.ok(new RegExp(`\\n${name} \\d+\\.\\d+/\\d+(\\.\\d+)? n\\d+`).test(text), `export missing the '${name}' lap line`);
    }
  });

  await t.check('draw-call and triangle guardrails hold at the baseline tour spots (Wave 2)', async () => {
    for (const s of PERF_SPOTS) {
      const [x, z] = s.xz;
      await t.tp(x, z, s.mode);
      await t.setTime(s.time);
      await t.setWeather(s.weather);
      if (s.mode === 'FLY') await t.ev(`g.player.pos.y = Math.max(g.hAt(${x}, ${z}) + 6, 6)`);
      await t.wait(0.6); // let cities/scenery spawn for this position before probing
      const r = await t.ev('g.perf.renderProbe()');
      t.ok(r.calls <= CAPS.draws, `${s.label}: ${r.calls} draw calls exceeds the ${CAPS.draws} cap (W1 baseline max was 2037) — new content or a regression, see PERFORMANCE_SPEC.md`);
      t.ok(r.triangles <= CAPS.triangles, `${s.label}: ${r.triangles} triangles exceeds the ${CAPS.triangles} cap (W1 baseline max was 1.75M) — new content or a regression, see PERFORMANCE_SPEC.md`);
    }
    await t.setWeather('clear'); // hermetic: don't leak storm into a sibling suite
  });

  await t.check('drawAudit (W3): differential buckets are exact and visibility is restored', async () => {
    await t.tp(-2767, 334, 'DRIVE'); // desert floor spot — the inversion under audit
    await t.wait(0.6); // let scenery/cities spawn for this position
    const a = await t.ev('g.perf.drawAudit()');
    t.ok(a && a.total.calls > 0, 'audit returned no total — auditPlan or drawFrame unwired');
    for (const [k, b] of [...Object.entries(a.buckets), ...Object.entries(a.kinds)]) {
      t.ok(Number.isFinite(b.calls) && b.calls >= 0, `${k}.calls not sane: ${b.calls}`);
      t.ok(Number.isFinite(b.triangles) && b.triangles >= 0, `${k}.triangles not sane: ${b.triangles}`);
    }
    const sum = Object.values(a.buckets).reduce((s, b) => s + b.calls, 0);
    t.ok(sum === a.total.calls, `bucket calls ${sum} != total ${a.total.calls} — differential probe not additive`);
    const ksum = Object.values(a.kinds).reduce((s, b) => s + b.calls, 0);
    t.ok(ksum === a.buckets.scenery.calls, `scenery kind split ${ksum} != scenery bucket ${a.buckets.scenery.calls} — a chunk child escaped its kind`);
    t.ok(Object.keys(a.kinds).length >= 3, `desert spot yielded only ${Object.keys(a.kinds).length} scenery kinds — tags missing in spawn()?`);
    // restoredCalls is probed inside the audit's synchronous block (scene
    // frozen) — an out-of-block re-probe would race live content streaming
    t.ok(a.restoredCalls === a.total.calls, `audit left visibility dirty: restored frame ${a.restoredCalls} vs total ${a.total.calls}`);
  });

  await t.check('fog-wall gate (W3): far decoration hidden by the live loop, near decoration visible', async () => {
    await t.tp(-2767, 334, 'DRIVE'); // desert — the border vignettes and most landmarks/stars sit far beyond the fog wall
    await t.wait(0.8); // both gates tick on a 0.5 s cadence inside real updates
    const r = await t.ev(`({
      shoulderHidden: g.shoulder.group.children.filter((c) => !c.visible).length,
      lmHidden: g.gameplay.landmarkGroup.children.filter((c) => !c.visible).length,
      starHidden: g.gameplay.cityStars.children.filter((c) => !c.visible).length,
    })`);
    t.ok(r.shoulderHidden > 10, `only ${r.shoulderHidden} shoulder children hidden in the far desert — gate not running or radius wrong`);
    t.ok(r.lmHidden >= 25, `only ${r.lmHidden}/39 landmark sites hidden in the far desert`);
    t.ok(r.starHidden > 80, `only ${r.starHidden}/132 city stars hidden in the far desert`);
    const alamo = await t.ev(`(() => { const lm = g.LANDMARKS.find((l) => l.name.includes('Alamo')); return [lm.at[0], lm.at[1]]; })()`);
    await t.tp(alamo[0] + 5, alamo[1] + 5, 'WALK');
    await t.wait(0.8);
    const vis = await t.ev(`g.gameplay.landmarkGroup.children.find((c) => c.userData.lm.name.includes('Alamo')).visible`);
    t.ok(vis, 'the Alamo is hidden while standing at it — gate footprint or radius wrong');
  });

  await t.check('resetMax clears the peaks without touching counters', async () => {
    const before = await t.ev('({ max: g.perf.frameMs.max, n: g.perf.laps.player.n })');
    const after = await t.ev('(g.perf.resetMax(), { max: g.perf.frameMs.max, scen: g.perf.laps.scenery.max, n: g.perf.laps.player.n })');
    t.ok(after.max <= before.max, `frameMs.max grew across reset: ${before.max} → ${after.max}`);
    t.ok(Number.isFinite(after.scen) && after.scen >= 0, `scenery max not reset to a sane value: ${after.scen}`);
    t.ok(after.n >= before.n, `resetMax rolled back tick counters (${before.n} → ${after.n})`);
  });
}
