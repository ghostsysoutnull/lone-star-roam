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
}
