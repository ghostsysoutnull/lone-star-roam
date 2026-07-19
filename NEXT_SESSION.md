# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Water Vehicles (`WATER_VEHICLES_SPEC.md`), wave 1 of 3 —
  BOAT mode: physics branch, skiff avatar, position-gated transitions,
  `boatableAt` water legality, gulf-plane-beyond-DEM fix. Spec session
  shipped 2026-07-19.
- **Recommended setup**: model **Fable 5**, effort **high** — new-system
  architecture + feel-critical (the boat's handling is the wave). Flag it
  if the running model differs.
- **Budget**: code + `boat.mjs` checks + one staged skiff shot
  (Copilot-judged), grep-first. Perf delta ~+5 draw calls.
- **Then**: rewrite this briefing for W2 (water feel: chop/wake/ambience +
  the river/lake offset look-pass).

Gotchas carried over: gulf legality is the zone classifier, not `hAt`
depth (it clamps and never returns negative — the −4 offshore dip is
mesh-only); lake levels move from `buildWater` into geo.js so
`boatableAt` and the mesh share one source; one-gulf-plane law applies to
every boat effect.

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
