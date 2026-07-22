# Testing system assessment

Date: 2026-07-22

## Executive summary

**Goal:** Reduce the five-minute verification gate without weakening regression protection.

**Finding:** Repeated full-game startup is the dominant cost. A terrain polygon-classification hotspot consumes most isolated boot CPU and is repeated for every one of the 29 browser suites.

**Recommended path:** Fix harness correctness and telemetry first, optimize the terrain startup path second, then reduce browser boot count only behind a proven state-reset contract.

**Expected result:** A safe first target is a 2–3 minute full gate. Going materially below two minutes likely requires both the terrain boot fix and fewer full-game boots.

## Scope

This assessment covers:

- `tools/verify.mjs`, including its browser pool, helpers, reporting, and flake confirmation;
- all 29 modules under `tools/checks/`;
- `tools/test.mjs` and the Node-only tests under `tools/unit/`;
- game startup work that directly controls browser-suite cost;
- performance, correctness, maintainability, reliability, and token efficiency.

No source or test file was changed during the assessment.

## Current architecture

The testing system has two layers.

### Fast Node layer

- Command: `node tools/test.mjs [group]`.
- Four groups: `aviation`, `data`, `progress`, and `rules`.
- Fourteen Node test declarations across five files and 296 lines.
- All four groups run through `tools/status.sh`.

### Browser integration layer

- Command: `node tools/verify.mjs [-v] [-q] [-j N] [suite…]`.
- Twenty-nine browser suites and 11,234 lines under `tools/checks/`.
- 567 static `t.check()` call sites and 572 checks in the latest runtime report; loops account for the difference.
- Each suite receives a fresh page and complete game boot.
- Worker browser contexts stay warm so their HTTP caches can be reused.
- Local storage is cleared before each navigation.
- The default worker width is derived from CPU count and instantaneous free memory.
- Failed parallel suites are rerun alone to classify solo-green flakes.

## Strengths to preserve

- Fresh-page isolation prevents save, perk, time, weather, and streamed-world state from leaking between suites.
- Named suites support focused development runs.
- `t.simStep()` and `t.step()` avoid real-time waits for deterministic physics and system rules.
- One real-loop sentinel per system protects main-loop wiring.
- Rendering is normally disabled through `window.__skipRender`.
- Assertions normally use numbers and DOM state rather than pixels.
- `-q` produces a compact green result and preserves detail in `/tmp/lonestar-verify.log`.
- Failure detail is capped in the console without truncating the full report.
- Fast checks complement the browser gate and are already part of the normal status command.

## Measurements

| Measurement | Result |
| --- | ---: |
| Latest full run at current HEAD | 306 seconds at `-j4` |
| Latest full result | 572 passed, two solo-green flakes |
| Four small suites | 33 seconds |
| Four-suite body time | 9.9 seconds combined |
| Eight small suites | 58 seconds |
| Eight-suite body time | 17.5 seconds combined |
| One isolated game page boot | 6.75 seconds |
| Boot CPU attributed to `inPoly` | 3.92 seconds |
| Navigation during that boot | 0.45 seconds |
| `perf` body in the four-worker report | 46.9 seconds |
| `perf` body alone | 17.9 seconds |
| `perf` total alone | 30 seconds |

The eight-suite probe is the clearest runner-level result. Approximately 51 of its 58 seconds were outside the reported suite bodies.

The current per-suite duration begins only after navigation, game construction, and initial settling. The report therefore excludes the dominant cost.

## Primary bottleneck: repeated game construction

Every browser suite constructs the complete game in a fresh page. The isolation is valuable, but it multiplies all startup work by 29.

The isolated CPU profile found that polygon containment is the main boot hotspot:

- the elevation terrain contains `448 × 414 = 185,472` vertices;
- each outside-Texas terrain vertex requests a neighboring-state tint in `world.js`;
- that path calls `neighborStateAt()` in `geo.js`;
- `neighborStateAt()` uses the generic ray-casting `inPoly()` loop;
- `inPoly()` accounted for 3.92 seconds of a 6.75-second isolated page boot.

Network and static-data navigation were not the primary constraint in the profile.

### Recommended startup optimization

Preclassify the elevation grid's neighboring-state cells instead of running a polygon walk for each outside-Texas vertex at every boot.

Candidate implementations:

1. Scan-convert the four neighbor polygons across the fixed elevation-grid rows at runtime.
2. Bake a compact state mask alongside the elevation data.
3. Build a specialized spatial index for the regular terrain-grid queries.

The replacement must be compared with the current classifier at every elevation-grid coordinate before the old boot-time path is removed. The general `neighborStateAt()` behavior for arbitrary gameplay coordinates must remain unchanged.

This optimization benefits both verification and real player startup.

## Correctness findings

### 1. `t.near()` accepts `NaN`

The helper checks only:

```js
Math.abs(a - b) > eps
```

If either operand is `NaN`, the comparison is false and the assertion passes. There are 110 `t.near()` calls across 18 suites.

The helper must reject non-finite actual values, expected values, and epsilon values before comparing distance.

### 2. Page errors do not fail a suite

The `pageerror` listener appends a report line but does not increment the failure count or abort the suite. A runtime exception can therefore coexist with a green process exit.

Unexpected page errors should produce a fatal suite result. A narrow allowlist may be added only if a known browser diagnostic is intentionally tolerated.

### 3. Unknown flakes are accepted automatically

Any parallel failure that passes once alone is labeled `FLAKE (solo-green)` and exits successfully. This can hide a real intermittent product regression.

Recommended policy:

- known timing-flake signatures may receive automatic solo confirmation;
- unknown solo-green failures should remain nonzero or require an explicit acceptance flag;
- the final summary must state the flake count.

### 4. Reruns overwrite original evidence

`runSuite()` replaces the suite's entry in the results map during solo confirmation. The pooled duration, failed-check count, and attempt metadata are lost.

Every attempt should be retained separately.

### 5. Suite-level infrastructure failures bypass normal reporting

Navigation, module import, or code outside `t.check()` can reject a worker and terminate the pool before the standard report is produced.

The runner needs:

- a normalized fatal-suite result;
- a suite-level watchdog;
- cleanup that still writes the report;
- explicit handling for navigation, request, import, and teardown failures.

### 6. Checks can depend on prior checks in the same suite

Some suites deliberately carry scenario state across checks. The ferry suite is one example. A normal assertion failure does not abort later checks, so one setup failure can create a cascade of misleading secondary failures.

Dependent scenarios should either be one check or declare explicit prerequisite failure semantics.

## Immediate performance improvements

### Add honest timing telemetry

Record these durations separately for every attempt:

- browser launch;
- context and page creation;
- navigation and game boot;
- initial settling;
- check body;
- page cleanup;
- flake confirmation.

Write a machine-readable JSON sidecar under `/tmp` even in quiet mode. Record passing-check durations there without printing them.

This removes the need for another full `-v` run just to locate slow checks.

### Remove default screenshots

The ferry suite takes `ferry-deck-crossing` during every full run even though the image does not affect pass/fail.

The screenshot helper also enables rendering for 0.7 simulated seconds. At the harness's 50 ms frame cadence, that requests roughly 14 SwiftShader frames when the comment says one frame is needed.

Required changes:

- gate the ferry image behind `SHOT=1`;
- render exactly one frame before capture;
- keep ordinary verification screenshot-free;
- keep screenshot paths out of quiet output unless a shot was explicitly requested.

### Reuse a warm browser for flake confirmation

The runner launches and closes a new Chromium process for every failed suite. Use one warm browser and context for the whole solo-confirm phase, with a fresh page per suite.

This preserves page and storage isolation while sharing browser launch and HTTP cache warmup.

### Separate raw teleport from settled teleport

The suite set contains 307 `t.tp()` calls. Every call advances three complete game-loop frames, including many checks that need only a position mutation before a direct calculation.

Add distinct helpers:

- `tpRaw()` for position and mode changes without frames;
- `tpSettled()` for streaming, HUD, or real-loop behavior;
- targeted system stepping when only one subsystem needs to advance.

The real-loop sentinel rule remains unchanged.

### Treat render-heavy work explicitly

The `perf` suite took 17.9 seconds alone and 46.9 seconds under pool contention. Its differential draw audit renders the scene once per top-level bucket and once per live scenery kind.

Options:

1. Keep a small always-run performance smoke suite and run the full differential audit only for rendering-related changes.
2. Keep the audit unconditional but schedule it in an exclusive renderer lane.
3. Reduce audit probes while retaining total draw, triangle, additivity, and restoration guards.

Any scheduling change must be measured end to end. A faster isolated suite does not automatically produce a faster full run if it stops overlapping useful work.

## Concurrency and scheduling

### Unstable default width

Worker width depends on instantaneous free memory. During this assessment the machine reported about 0.8 GiB free, which made the default calculation choose `j=2`. The latest full report used `j=4`.

The same command can therefore choose a different execution shape between runs.

Recommended changes:

- use `os.availableParallelism()` for the CPU cap;
- report the CPU and memory inputs used to choose width;
- support a stable `VERIFY_J` configuration;
- benchmark a representative eight-suite panel before paying for repeated full-run comparisons;
- keep an explicit override for constrained machines.

### Stale scheduler weights

The weight table omits:

- `boat`;
- `energy`;
- `massif`;
- `onboarding`;
- `perf`;
- `rails`.

Several of those are among the slowest suites. Unlisted suites fall into the generic five-second bucket.

Use recorded end-to-end attempt timings rather than manually maintained body-time guesses. Boot cost must be included in the scheduling model.

## Test-pyramid assessment

The current ratio is heavily browser-weighted:

- 14 Node tests;
- 572 browser checks.

Many browser checks validate static tables, counts, IDs, deterministic placement, content pools, and pure calculations.

High-value Node migration candidates include:

- airport and route tables;
- agriculture and energy bake contracts;
- brand and energy site eligibility;
- turbine generation and allocation rules;
- NPC content-pool integrity;
- tour-data validation;
- rail identity and transition rules;
- mission offer tables and payout rules;
- collectible and save-default contracts.

The browser layer should retain:

- game boot and module wiring;
- one real-loop sentinel per system;
- DOM and input behavior;
- scene lifecycle and mesh integration;
- player-visible state transitions;
- selected draw and triangle caps.

Moving pure checks alone shortens suite bodies but does not eliminate a suite's boot. Browser sentinel consolidation is required before this migration materially reduces the repeated startup tax.

## Fast-test quality

The fast runner is compact and appropriately hides successful Node test output. Its current 0.5-second scale does not justify concurrency work.

The larger concern is production ownership. The aviation and progress tests parse production source text with regular expressions. A formatting refactor can fail those tests without changing behavior, and unusual syntax can evade a regex while preserving an invalid table.

Preferred design:

- move production tables into dependency-free modules or checked-in JSON;
- import the same data from runtime code and Node tests;
- extract pure rules behind small dependency-free functions;
- avoid copying or parsing the production rule in the test.

## Reducing the number of browser boots

This offers the highest eventual speed ceiling and the highest reliability risk.

The measured runner paid about 25 seconds for each additional wave of four fresh pages. Twenty-nine suites require roughly eight waves. Reducing the gate to 8–12 clean boot shards could remove approximately five boot waves, potentially around two minutes on this machine.

Uncontrolled shared-page execution must not return. It previously leaked perks, weather, time, and save state between suites.

A safe reset contract must cover:

- save data and local storage;
- player mode, position, speed, controls, and perks;
- time, weather, and atmosphere;
- spawned and forced entities;
- audio and callback spies;
- open DOM panels and dialogs;
- streamed world objects;
- timers and sequence counters;
- random-function overrides;
- any system-specific debug forcing state.

Validation requirements:

- run bundled modules in randomized orders;
- compare their results against fresh-boot runs;
- fail on leaked state after each module;
- preserve a fresh-boot mode for debugging and confirmation;
- keep onboarding and other true boot-state tests isolated.

Until this contract is proven, fresh-page isolation is the correct default.

## Maintainability

The largest suite modules are 595–1,827 lines. They mix multiple historical waves and subsystems in one file.

Split source organization without changing boot scheduling:

- keep one top-level suite entry for one browser boot;
- import narrow check modules by feature or historical wave;
- keep shared fixtures beside the aggregate suite;
- preserve one result sink and one page for the aggregate;
- make the runner's logical modules independent from its boot shards.

This improves grep-first navigation, review cost, and token efficiency without adding browser startups.

## Token-efficiency improvements

Keep the existing quiet-output contract.

Add:

- a JSON report with attempts, boot/body/check timings, flakes, and worker assignment;
- a final summary such as `572 passed, 2 flakes, 0 failed`;
- `--last-failed` based on the previous JSON report;
- automatic affected-suite selection for development iteration;
- passing-check timings in the JSON report without console output;
- narrow imported check modules for the largest suites;
- one warm browser for all solo confirmations.

Continue the existing workflow:

- fast tests after ordinary edits;
- the relevant named browser suite while developing;
- one full browser run at the pre-push/wave-close protocol point;
- no assurance-only full reruns;
- no screenshots for logic, data, or physics work.

## Additional reliability improvements

- Sort discovered browser suites explicitly instead of relying on filesystem order.
- Reject duplicate suite names and malformed `-j` values.
- Add suite-level timeouts.
- Treat unexpected request failures and page errors as failures.
- Cache or intercept the pinned Three.js CDN module so verification does not depend on external availability.
- Add at least the fast Node layer to continuous integration; the repository currently has no `.github` workflow.
- Expand the coverage ledger from four fast groups to all production systems and their browser sentinels.
- Prefer behavior and contract coverage over a raw line-coverage target.

## Documentation drift

- `TEST_CYCLE_SPEC.md` still reports a 70-second full-browser baseline.
- `TOKEN_EFFICIENCY.md` still records a 25-second full run after the original render-skip optimization.
- The current measured baseline is 306 seconds with two solo-green flakes.
- The full-verify documentation contains older capture guidance that conflicts with the newer no-pipe rule.

Timing documentation should be refreshed only after the runner reports boot and body costs separately.

## Recommended implementation sequence

### Phase 1 — Harness correctness and observability

- Make `t.near()` reject non-finite values.
- Fail on unexpected page errors.
- Normalize suite-level infrastructure failures.
- Add suite watchdogs.
- Preserve all attempt records.
- Add JSON timing output and a flake count in the summary.

Expected payoff: trustworthy results and enough evidence to optimize without repeated profiling runs.

### Phase 2 — Low-risk runner cost

- Gate the ferry screenshot.
- Render one frame per explicit shot.
- Reuse one browser for solo confirmation.
- Add raw and settled teleport helpers.
- Refresh scheduler weights from measured end-to-end data.

Expected payoff: modest wall-time savings and lower flake/retry cost.

### Phase 3 — Game boot hotspot

- Replace per-terrain-vertex neighbor polygon scans with a grid classifier.
- Compare old and new classifications at every elevation-grid point.
- Benchmark the isolated boot and the eight-suite panel.
- Run one full verification after targeted equivalence checks pass.

Expected payoff: the largest safe speed improvement, with a matching player startup improvement.

### Phase 4 — Test-pyramid rebalance

- Extract dependency-free production tables and rules.
- Move pure browser checks into the Node layer.
- Retain browser wiring and visible-behavior sentinels.
- Split large suite files into imported check modules without adding boots.

Expected payoff: faster feature iteration, cheaper diagnosis, and lower maintenance/token cost.

### Phase 5 — Proven boot shards

- Implement the explicit reset contract.
- Randomize module order during shakedown.
- Compare bundled and fresh-boot results.
- Reduce the default full run to 8–12 boot shards only after equivalence is demonstrated.

Expected payoff: the path from a 2–3 minute gate toward a sub-two-minute gate.

## Verification performed for this assessment

- `tools/status.sh`: syntax passed; all four fast groups passed.
- Four-suite `-j4` probe: 27 checks passed in 33 seconds.
- Eight-suite `-j4` probe: 67 checks passed in 58 seconds.
- Single-worker `walk` probe: six checks passed in 13 seconds.
- Single-worker `perf` probe: ten checks passed in 30 seconds total, 17.9 seconds body.
- Isolated boot CPU profile: 6.75 seconds; 3.92 seconds in polygon containment.
- Existing current-HEAD full report: 572 passed, zero confirmed failures, two solo-green flakes, 306 seconds at `-j4`.

No additional full run was performed because the current-HEAD report already supplied the required baseline.
