# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Water Vehicles (`WATER_VEHICLES_SPEC.md`), wave 2 of 3 —
  water feel: ATMOS-driven chop (pitch/roll + y bob, planing flattens it),
  wake fade-pool behind the stern, sparkle patch, water-lap/engine audio,
  and the river/lake offset look-pass (backlog fold-in). Wave 1 (BOAT mode)
  shipped 2026-07-19.
- **Recommended setup**: model **Fable 5**, effort **high** — feel-tuning
  wave with a new visible water surface treatment. Flag it if the running
  model differs.
- **Budget**: code + boat.mjs chop/wake checks + one staged water-surface
  shot (Copilot-judged), grep-first. Perf delta +≤20 draw calls (wake +
  sparkle pools); caps hold at the perf baseline spots.
- **Then**: rewrite this briefing for W3 (fairways/marinas/ICW buoys, dog
  bow perch, world-edge map lines, boat identity + track close).

Gotchas carried over:
- One-gulf-plane law: every effect (wake, sparkle, chop) floats ABOVE the
  plane with a y-stagger — never a second water surface. The plane is now
  RGBA (itemSize-4 color attr, `transparent: true`) fading past the DEM
  edge; effects must not disturb the fade, and the boat.mjs plane-edge
  probe asserts it.
- Chop reads live `ATMOS` every frame, never cached; amplitude =
  f(wind, weather), storm multiplies, attitude flattens as speed rises.
  BOAT skips the slope-pitch block in vehicle.js (`mode !== 'BOAT'`
  guard) — chop attitude goes exactly there. `pos.y` in BOAT comes from
  `player._water.y` each frame; bob should offset the avatar, not fight
  the legality/y source.
- River offset 0.07 lives in world.js `buildWater`'s buildRibbons calls;
  the lake offset is geo.js `LAKE_OFFSET` (0.15, baked into
  `lake.level`). Retuning must update boat.mjs's Falcon
  lowest-shoreline+0.15 assertion in the same pass.
- Real-loop suites (aviation — in GOTCHAS — plus shop's dog-yip and
  springer's hint-priority) flake under parallel `-j`, pass solo `-j 1`:
  same class, don't chase them as boat regressions.

Key facts:
- **Repo is public and GitHub Pages is live** — pushes deploy to
  https://ghostsysoutnull.github.io/lone-star-roam/. Full verify before
  every code push is mandatory (doc-only diffs skip tests); commits and
  pushes always wait for Bruno's explicit go-ahead.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~70 s on this machine;
  use named suites while iterating, then the full run before pushing; compact;
  `-v` per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`,
  never throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If Bruno reports something broken after an update, suspect browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for the
  go-ahead.
