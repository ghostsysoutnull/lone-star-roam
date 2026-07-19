# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Water Vehicles (`WATER_VEHICLES_SPEC.md`), wave 3 of 3 —
  the sea opens up: fairway/marina announcer entries (energy.js `register()`
  only), marina dressing at the 8 ports + one per lake, ICW channel-marker
  buoys, Lacy's bow perch, world-edge iso-lines on the big map
  (SHELF_U/SHOULDER_U, Tidelands dash-pass idiom), boat HUD/map identity +
  first-boat hint, the cruise-hold rider (release W, boat keeps way on —
  settled design in the spec's W3 section), and the track close (ROADMAP
  fold, doc sweep, briefing delete). Wave 2 (water feel + playtest fixes)
  shipped 2026-07-19, commit fa57fc6.
- **Recommended setup**: model **Fable 5**, effort **high** — new visible
  surfaces (marinas, buoys, map lines) + track close. Flag it if the
  running model differs.
- **Budget**: code + checks + one staged marina shot (Copilot-judged) +
  the track-close doc sweep, grep-first. Perf: marina/buoy dressing
  instanced or merged, +≤30 draw calls coastal, ~0 inland.
- **Then**: this is the last wave — delete this briefing block, fold the
  track into one `ROADMAP.md` entry, sweep BACKLOG/GOTCHAS/CLAUDE.md, and
  graduate surviving gotchas into `GOTCHAS.md`.

Gotchas carried over:
- Announcer: energy.js `register()` calls ONLY — platforms already
  announce; no new announcer machinery (standing Energy law).
- One-gulf-plane law: marina/buoy dressing floats above the plane with a
  y-stagger; the RGBA edge fade must stay untouched (boat.mjs probe
  asserts it). W2's wake/sparkle pools live in vehicle.js — reuse
  `fadeDisc`, don't add new water surfaces.
- The world-edge wall (vehicle.js `inW`) now exempts `boatableAt` kind
  `'lake'` — border reservoirs are open across the Rio Grande channel.
  W3's map iso-lines are display-only; do not re-wall lake water.
- Big-map iso-lines: Tidelands dash-pass idiom in `renderMapLayer`
  (distance-field sampling, 80u bands, two-level refinement), boot-time
  only, styled fainter than the Tidelands dashes; big map only.
- W2 retunes now asserted in boat.mjs: `LAKE_OFFSET` 0.3 (geo.js, baked
  into `lake.level`), `RIVER_OFFSET` 0.12 (world.js export).
- Real-loop checks flake as a CLASS under parallel `-j` (this session:
  onboarding continue-restore, boat waterline-hint) — one solo `-j 1`
  confirm, never chased as regressions.

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
