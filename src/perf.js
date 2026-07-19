// Perf instrumentation (Performance W1) — lap timers between main.js's
// sequential system updates + a renderer.info mirror. perf.frame() opens a
// frame, perf.lap(name) closes the span since the previous lap point and
// charges it to that system. The hot path allocates nothing after a lap
// name's first sight (records are created once and mutated); snapshot()
// allocates and is for on-demand readers only (debug Perf tab, verify suite).
// Headless caveat: the verify harness's fake clock (Playwright) also fakes
// performance.now, so lap ms read ~0 there — checks assert structure and
// tick counts (n), never headless ms; real numbers need a real browser.
const EMA = 0.05; // ~20-frame smoothing

export class PerfMonitor {
  constructor() {
    this.laps = {}; // name -> { avg, max, last, n }, created on first lap()
    this.order = []; // lap registration order = loop order
    this.frameMs = { avg: 0, max: 0, last: 0 }; // frame() → last lap span (update work, not wall)
    this.fps = 0; // wall frame-to-frame, EMA
    this.frames = 0; // main-branch frames since boot (title/pause untimed)
    this.render = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
    this.drawFrame = null; // set by main.js: renders one real frame + captures info
    this.auditPlan = null; // set by main.js: () => ({ groups, detail }) for drawAudit()
    this.records = []; // record() stash — baseline captures for formatRecords()
    this._t0 = 0; // current frame's start
    this._tl = 0; // last lap point
  }

  frame() {
    const now = performance.now();
    if (this._t0) {
      const work = this._tl - this._t0;
      const f = this.frameMs;
      f.last = work;
      f.avg += (work - f.avg) * EMA;
      if (work > f.max) f.max = work;
      const wall = now - this._t0;
      if (wall > 0 && wall < 250) this.fps += (1000 / wall - this.fps) * EMA; // pause/tab-away gaps don't count
    }
    this._t0 = this._tl = now;
    this.frames++;
  }

  lap(name) {
    const now = performance.now();
    const ms = now - this._tl;
    this._tl = now;
    const L = this.laps[name];
    if (!L) {
      this.laps[name] = { avg: ms, max: ms, last: ms, n: 1 };
      this.order.push(name);
      return;
    }
    L.last = ms;
    L.avg += (ms - L.avg) * EMA;
    if (ms > L.max) L.max = ms;
    L.n++;
  }

  resetMax() {
    this.frameMs.max = 0;
    for (const k of this.order) this.laps[k].max = 0;
  }

  captureRender(renderer) {
    const i = renderer.info, r = this.render;
    r.calls = i.render.calls;
    r.triangles = i.render.triangles;
    r.geometries = i.memory.geometries;
    r.textures = i.memory.textures;
    r.programs = i.programs?.length ?? 0;
  }

  // one real drawn frame regardless of __skipRender — refreshes this.render
  // with true draw-call/triangle counts (the t.shot re-enable pattern, no image)
  renderProbe() {
    if (this.drawFrame) this.drawFrame();
    return { ...this.render };
  }

  // W3 draw audit — differential probing: hide one source's roots, render one
  // true frame, and the delta against the all-visible probe is that source's
  // real draw contribution (frustum culling and material groups included —
  // no estimating from mesh counts). auditPlan is wired by main.js:
  // () => ({ groups, detail }) where groups are disjoint scene subsets
  // (remainder reported as 'other') and detail entries overlap groups (the
  // per-kind scenery split) so they stay out of the disjoint sum. The whole
  // audit runs synchronously — no rAF can interleave, so the scene is frozen
  // across every probe and the deltas are exact, not statistical.
  drawAudit() {
    if (!this.drawFrame || !this.auditPlan) return null;
    const { groups, detail } = this.auditPlan();
    const total = this.renderProbe();
    const probe = (roots) => {
      const prev = roots.map((r) => r.visible);
      for (const r of roots) r.visible = false;
      const p = this.renderProbe();
      roots.forEach((r, i) => { r.visible = prev[i]; });
      return { calls: total.calls - p.calls, triangles: total.triangles - p.triangles, roots: roots.length };
    };
    const buckets = {}, kinds = {};
    let calls = 0, tris = 0;
    for (const [name, roots] of Object.entries(groups)) {
      const b = (buckets[name] = probe(roots));
      calls += b.calls;
      tris += b.triangles;
    }
    buckets.other = { calls: total.calls - calls, triangles: total.triangles - tris, roots: 0 };
    for (const [name, roots] of Object.entries(detail)) kinds[name] = probe(roots);
    // final all-visible probe: leaves this.render mirroring a true frame AND
    // proves restoration — still inside the synchronous block, so the scene
    // can't have changed and restored must equal total exactly (a later
    // out-of-block re-probe races the live loop's content streaming)
    const restored = this.renderProbe();
    return { total: { calls: total.calls, triangles: total.triangles }, buckets, kinds, restoredCalls: restored.calls };
  }

  formatAudit(a) {
    const k = (n) => (n >= 1e5 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1000).toFixed(0)}k`);
    const row = ([name, b]) => `${name} — ${b.calls} calls · ${k(b.triangles)} tris · ${b.roots} roots`;
    const sort = (o) => Object.entries(o).sort((x, y) => y[1].calls - x[1].calls);
    return [
      `total ${a.total.calls} calls · ${k(a.total.triangles)} tris`,
      ...sort(a.buckets).map(row),
      '— scenery by kind —',
      ...sort(a.kinds).map(row),
    ].join('\n');
  }

  memoryMB() {
    // Chrome-only, and the harness fake clock exposes a memory object with no
    // usable fields — gate on the number, not the object
    const b = performance.memory?.usedJSHeapSize;
    return Number.isFinite(b) ? Math.round(b / 1048576) : null;
  }

  snapshot() {
    const laps = {};
    for (const k of this.order) {
      const L = this.laps[k];
      laps[k] = { avg: L.avg, max: L.max, last: L.last, n: L.n };
    }
    return { fps: this.fps, frames: this.frames, frameMs: { ...this.frameMs }, laps, render: { ...this.render }, memoryMB: this.memoryMB() };
  }

  // baseline capture: stash the current snapshot with play context (position,
  // mode, time, weather — the debug Perf tab's Record button supplies it) and
  // export every stashed record as paste-ready text for analysis in chat
  record(ctx) {
    this.records.push({ ctx, snap: this.snapshot() });
    return this.records.length;
  }

  formatRecords() {
    return this.records.map(({ ctx: c, snap: s }, i) => [
      `=== perf record ${i + 1} — pos ${c.x.toFixed(0)},${c.z.toFixed(0)} · ${c.mode} · t ${c.t.toFixed(2)} · ${c.weather}`,
      `fps ${s.fps.toFixed(1)} · frame ${s.frameMs.avg.toFixed(2)} avg / ${s.frameMs.max.toFixed(1)} max ms` +
        (s.memoryMB != null ? ` · heap ${s.memoryMB} MB` : ''),
      `draws ${s.render.calls} · tris ${s.render.triangles} · geo ${s.render.geometries} · tex ${s.render.textures} · prog ${s.render.programs}`,
      ...Object.entries(s.laps).sort((a, b) => b[1].avg - a[1].avg)
        .map(([k, L]) => `${k} ${L.avg.toFixed(3)}/${L.max.toFixed(1)} n${L.n}`),
    ].join('\n')).join('\n\n');
  }
}
