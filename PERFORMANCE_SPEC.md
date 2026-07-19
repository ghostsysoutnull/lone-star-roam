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

Recorded 2026-07-18, two rounds. Round 2 (canonical, below) followed the
full protocol — teleport → settle 3 s → `↺ Reset max` → 15–20 s of *moving*
play → `📋 Record` — so max columns are per-spot play values. Round 1
(reset skipped; session-wide maxes) agreed on all averages and counts;
its one extra datum: the teleport-arrival spike class reaches frame
347 ms / scenery 121 ms / cities 34 ms. Round 1 also read 66–79 fps where
round 2 capped at ~60 — likely a display/window difference; counts and ms
were consistent across both.

| Spot | fps | frame avg/max ms | render avg/max | scenery max | draw calls | triangles |
| ---- | --- | ---------------- | -------------- | ----------- | ---------- | --------- |
| Houston night storm (DRIVE) | 59.4 | 12.39 / 46.4 | 10.76 / 38.7 | 23.1 | 1461 | 1.75 M |
| I-10 west floor (DRIVE) | 60.4 | 13.34 / 37.9 | 12.03 / 22.0 | 14.8 | 2037 | 1.61 M |
| Sweetwater dusk (FLY) | 57.5 | 14.17 / 53.1 | 12.72 / 27.9 | 30.4 | 1432 | 1.66 M |

Heap 116–126 MB steady. Hardware: Bruno's dev machine, 60 Hz vsync in
round 2.

### Findings (what W2/W3 must know)

1. **The frame is the render call.** `render` is 10.8–12.7 ms of the
   12.4–14.2 ms frame everywhere; all ~34 game systems together cost
   1.5–2 ms. System `update()` optimization is a non-target — draw
   submission is the game.
2. **Cost is location-independent and the "floor" is the ceiling.** The
   empty desert submits the *most* draw calls of the three spots (2037 vs
   1461 downtown Houston in a storm) and triangles are ~1.6–1.7 M
   everywhere; render avg tracks draw calls, not scene "busyness". A large
   distance-insensitive base of draws dominates. Prime suspect: per-chunk
   scenery props as individual meshes (open land runs more chunks at full
   density; cities suppress them). W3's first job is a draw audit, not a
   fix.
3. **Hitch class is mild in normal play; teleports are the outlier.** With
   per-spot resets, worst frames are 38–53 ms (2–3 dropped vsync frames);
   scenery chunk builds reach 15–30 ms, worst while FLYing (faster chunk
   streaming). The 120 ms+ spikes only occur on teleport arrival. Chunk
   amortization is polish, not urgent — FLY at speed is its stress case.
4. **Steady-state logic is healthy.** hud 12 Hz block ~0.6–0.7 ms per
   tick, traffic/npcs/player/animals 0.1–0.35 ms, everything else < 0.1.
   Margin at 60 Hz vsync is thin though: Sweetwater-FLY averages 14.2 ms
   against a 16.7 ms budget and drops frames (57.5 fps) — a weaker GPU
   sits below 60 everywhere.
5. **Guardrail consequence (W2)**: per-system ms thresholds are pointless
   (all tiny) and machine-bound; the meaningful ceilings are **count-based
   and headless-honest** — draw calls and triangles via `renderProbe()`
   (baseline ≈ 1.4–2.0 k / 1.7 M), plus lap-table completeness. Set caps
   with headroom (~2.5 k / 2.5 M) and revisit after any W3 work.

### W3 — the draw audit (2026-07-18)

Method: `perf.drawAudit()` — differential probing. Hide one source's roots,
render one true frame, the delta against the all-visible probe is that
source's exact contribution (frustum culling included; the whole audit is
synchronous, so the scene is frozen across probes). Scenery splits further
per prop kind via `userData.kind` tags. Debug Perf tab → 🔎 Audit runs it
live; the perf suite asserts the buckets sum exactly to the probe total.

Audit at the three baseline spots + the solar field nearest the I-10 spot
(headless, settled 4 s, pre-fix):

| Spot | total | shoulder | gameplay decor* | scenery | animals | traffic | cities | static world |
| ---- | ----- | -------- | --------------- | ------- | ------- | ------- | ------ | ------------ |
| Houston night storm | 2041 | 611 | ~510 | 653 | 62 | 8 | 2 | ~190 |
| I-10 west floor | 1579 | 566 | ~350 | 409 | 85 | 4 | 0 | ~160 |
| Sweetwater dusk (FLY) | 1510 | ~590 | ~250 | 500 | 177 | 8 | 4 | ~150 |
| Solar field (I-10) | 1493 | ~570 | ~300 | 377 | 61 | 4 | 0 | ~180 |

*gameplay decor = landmark props (39 sites, 603 meshes), gold + silver city
stars (~600 meshes). Roses are instanced (2 calls) and innocent.

6. **Finding 2's suspect was wrong.** Per-chunk scenery props are a real but
   roughly uniform cost (377–653 calls) and NOT the desert-vs-downtown
   differentiator. The dominant, location-independent base was
   **world-spanning boot-built decoration that fog hides but never culls**:
   the camera far plane is 30000 with the fog wall at ≤1400, so every border
   vignette (`shoulder`, 566–611 calls at *every* spot), landmark prop and
   city star inside the camera's frustum wedge submitted draws while fully
   fog-invisible. The W1 "inversion" was just which slice of that unculled
   field the recorded run's camera swept (plus the solar field Bruno drove
   through, worth only ~80 calls). Cities (2–4 calls), traffic (4–8) and the
   energy bakes (transmission = 1 call / 412 k tris) are all healthy.

7. **Fix shipped same-session: the fog-wall gate** (`FogGate` in sky.js,
   wired into shoulder.js and gameplay.js). Hides a root's direct children
   once their whole world footprint sits beyond `GATE_R` (1500 = max
   fog.far 1400 + margin; fogMul never exceeds 1.0 so the wall never grows
   past 1400). Children with any `fog: false` material are auto-exempt (the
   horizon glows are *designed* to beat fog). Pure visibility — all
   interaction stays distance-based. Measured after (same staging):
   Houston **2041 → 934**, I-10 floor **1579 → 675**, Sweetwater
   **1510 → 866**, solar field **1493 → 633** — the draw base roughly
   halved everywhere; triangles unchanged (the fog-hidden decor was small,
   the 1.45 M static tris are the merged world at 1-call-per-mesh).

8. **Teleport probes run hot.** A probe ~0.6 s after teleport reads ~+300
   calls over the settled value (the prior spot's scenery chunks still live
   in the camera wedge — the Finding 3 transient, seen in counts). The W2
   guardrail probes at that cadence, so its cap is set against the harness
   context (~1300 observed): draws 2500 → **1600**; triangles cap unchanged.
   Any future cap tuning must say which context (settled vs post-teleport)
   it measured.

Open for W4 (close-out): re-record the real-hardware baseline (the spec's
protocol) to confirm the render-ms drop on Bruno's machine, then fold the
track into ROADMAP.md.

### W4 — real-hardware re-record (2026-07-18)

Same protocol, same three spots, post fog-wall-gate fix. W1 baseline (pre-fix)
vs this record (post-fix):

| Spot | fps (W1→W4) | frame avg ms (W1→W4) | render avg ms (W1→W4) | draw calls (W1→W4) | triangles (W1→W4) |
| ---- | ----------- | --------------------- | ----------------------- | -------------------- | -------------------- |
| Houston night storm (DRIVE) | 59.4 → 54.7 | 12.39 → 10.27 | 10.76 → 8.62 | 1461 → 1044 | 1.75 M → 1.64 M |
| I-10 west floor (DRIVE) | 60.4 → 60.4 | 13.34 → 7.06 | 12.03 → 5.52 | 2037 → 547 | 1.61 M → 1.52 M |
| Sweetwater dusk (FLY) | 57.5 → 60.4 | 14.17 → 10.59 | 12.72 → 9.19 | 1432 → 1259 | 1.66 M → 1.61 M |

9. **The fix confirmed on real hardware, floor spot hit hardest.** Render avg
   drops 20–54% across all three spots; frame avg follows. I-10 floor —
   the spot Finding 2 flagged as counter-intuitively the most expensive —
   sees the largest win (draws −73%, render avg −54%, matching W3's
   diagnosis that its `shoulder` share of the pre-fix total was the
   biggest of the three, 566/1579 ≈ 36%). Sweetwater now holds full 60 fps
   (was 57.5, the spec's thin-margin spot in Finding 4). Draw counts read
   lower than W3's headless post-teleport probes (934/675/866) because
   these are settled mid-play snapshots, not the hot post-teleport context
   Finding 8 describes — expected, not a discrepancy.
10. **One outlier, not chased.** Houston's max frame hit 224.0 ms (render
    max 105.6 ms) during the 15–20 s play window, well above every other
    max in this or the W1 table (next-highest is 53.1 ms) — the ~118 ms gap
    between frame-max and render-max means most of it sat outside the
    instrumented calls entirely (browser/OS stall, not game work), and
    fps's independent wall-clock EMA reads 54.7 vs frame avg's 10.27 ms
    because a stall that recent skews the fast-recency-weighted fps EMA
    more than the slower-windowed frame avg. Single-sample; no fix per
    the W4 budget (re-record + confirm only). Flag for a future session
    if it recurs.

Track closed 2026-07-18 (4 waves). Folded into `ROADMAP.md`; this spec stays
as history.
