# Performance — measurement, guardrails, headroom

**Goal**: keep the diorama smooth as the world densifies — by making frame cost
measurable first, budgeted second, and optimized last (only where data points,
each fix with a measured before/after).

**Wave 1 — the player gets:**
- A live Perf tab in the playtest menu (`?debug=1`): frame time, fps, the
  per-system cost table (every `update()` in the render loop timed), draw
  calls, triangles, and JS heap — readable while driving anywhere.
- Perf tour spots that stage the worst case (downtown Houston, night, storm)
  and the floor (empty I-10 west, clear day) for one-click A/B reading.
- No gameplay change — instrumentation is debug-gated and costs ~nothing.

*Expected result:* every system named in the main.js render loop reports avg
and max ms per frame. `__game.perf.snapshot()` returns the full readout
headlessly. A new verify suite asserts the lap table is complete and sane and
that a one-frame render probe reports real draw-call/triangle counts. Baseline
numbers from Bruno's machine are recorded in this file's Baseline section.
*Suggested setup:* model **Fable 5**, effort **high** — new instrumentation
surface threaded through the render loop; budget: code + checks, no shots,
grep-first.

**Wave 2 — the player gets:**
- Nothing visible — regressions now fail verify before they ship: per-system
  cost caps, total update budget, draw-call/triangle ceilings derived from the
  Wave-1 baseline.
- Every future track spec carries a stated perf cost, like its token budget.

*Expected result:* thresholds live in the perf suite with headroom margins
picked from baseline data; the multi-wave protocol section in CLAUDE.md gains
the per-track perf-cost line. Content is settled by Wave-1 data — do not spec
thresholds before the baseline exists.
*Suggested setup:* model **Sonnet 5**, effort **high** — executing settled
design (threshold plumbing); budget: code + checks, no shots.

**Wave 3+ — the player gets:**
- Smoother worst-case frames. Scope is decided by the Wave-1/2 data, not this
  spec. Candidate suspects (unranked, unproven): per-frame allocation churn,
  scenery/city chunk-build spikes, far-away movers doing near-player work,
  draw-call growth from unmerged props.

*Expected result:* each optimization lands with a measured before/after at the
staged spots and an honest ROI line in the ledger. Mislabeled work (reliability
dressed as optimization) gets called out per the standing rule.
*Suggested setup:* graded per wave by where the risk lives once the data exists.

---

## Pillars (the vision, folded in)

1. **Measure first.** No optimization without a number pointing at it. The
   instrumentation itself must be near-free: no allocation in the hot path,
   `performance.now()` laps between the already-sequential update calls.
2. **Guardrails in verify.** Numbers, not pixels — and headless-honest:
   SwiftShader + `__skipRender` make GPU timing meaningless in the harness, so
   guardrails assert CPU-side costs and *counts* (draw calls, triangles,
   instances via a one-frame render probe), never headless fps.
3. **Budgets as contract.** A frame budget split by system class; every new
   track states its perf cost at spec time. The "performance patterns to
   preserve" lore in CLAUDE.md becomes enforced, not remembered.
4. **Optimization last, ROI-gated.** Perf work is a planned wave with a
   measured payoff, never a mid-wave curiosity (the shields-session lesson).

## Wave 1 — design settled

- **`src/perf.js`** (new): `PerfMonitor` — `frame()` at loop top,
  `lap(name)` after each system call (elapsed since previous lap point),
  per-name EMA avg + max-since-reset, `resetMax()`, `snapshot()` returning
  `{fps, frameMs: {avg, max}, laps: {name: {avg, max}}, render, memoryMB}`.
  Lap objects are created on first sight and reused — zero steady-state
  allocation. `render` mirrors `renderer.info` (calls, triangles, geometries,
  textures, programs) captured after the real `renderer.render`; under
  `__skipRender` it holds the last rendered frame's values (boot frame or
  `renderProbe`). `renderProbe()` renders one frame with drawing forced on and
  returns the refreshed counts (the `t.shot` re-enable pattern, no image).
- **`src/main.js`**: `perf.frame()` at the top of the main branch,
  `perf.lap('<system>')` after each of the ~30 update calls, `perf.lap('hud')`
  after the 12 Hz block, `perf.lap('render')` after `renderer.render`.
  Attract/pause branches untimed. Expose `perf` on `window.__game`.
- **`src/debug.js`**: third tab `📈 Perf` — table refreshed at 2 Hz while the
  panel is open and the tab active: frame avg/max + fps, systems sorted by avg
  cost, renderer counts, heap MB (`performance.memory`, Chrome-only, hidden
  when absent), a reset-max button. Data always constructed; only the panel is
  URL-gated (the debug.js honesty pattern).
- **`src/tours.js`**: new track `Performance (2026-07)`, W1 spots: Houston
  downtown night storm (worst case), empty I-10 west clear day (floor),
  Sweetwater wind corridor dusk (densest instanced ambient). Notes say "open
  the Perf tab" — static/ambient subjects, teleport + staging suffices.
- **`tools/checks/perf.mjs`** (new suite): lap-name completeness against the
  pinned list of main.js call sites, avgs finite and ≥ 0, frame counter
  advances over `t.simWait`, snapshot shape, `renderProbe()` reports
  `calls > 0` and `triangles > 0`, laps keep ticking after `setWeather`
  (real-loop sentinel — perf measures the live loop by construction).
- **Docs**: MODULES.md one line for perf.js; baseline table below filled from
  Bruno's machine (hardware noted); LEDGER line at wave end.

## Wave 2 — design shape (settle after baseline)

- Thresholds as data at the top of `tools/checks/perf.mjs`: per-system avg-ms
  caps, total-update cap, draw-call/triangle ceilings — each = baseline ×
  headroom margin; margins picked when the baseline exists.
- CLAUDE.md multi-wave protocol: add the per-track perf-cost line.
- Open call for the wave session: whether headless CPU numbers are stable
  enough across machines for ms thresholds, or whether caps must be
  count-based only (draw calls, triangles, instances). Decide from the
  Wave-1 suite's observed variance, not in advance.

## Baseline (recorded from real hardware, Wave 1)

*Pending — filled after Bruno reads the Perf tab at the three tour spots.*

| Spot | fps | frame avg/max ms | top systems | draw calls | triangles |
| ---- | --- | ---------------- | ----------- | ---------- | --------- |
| Houston night storm | — | — | — | — | — |
| I-10 west floor | — | — | — | — | — |
| Sweetwater dusk | — | — | — | — | — |

Hardware: —
