# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Energy (`ENERGY_SPEC.md`), wave 5 of 6 — the ERCOT
  spine: 345 kV lattice-tower corridors along the baked `lines345`
  polylines (box-built towers, poly-bar law), major substations, hero
  plant landmarks (South Texas Project + Comanche Peak nuclear,
  W.A. Parish, Martin Lake) with plaques + Energy log entries, ERCOT
  flavor on the radio, `plant`-kind glow anchors into the W4 light
  pool. Wave 4 (refinery data rebake 22→33 + kit at all sites, 4 hero
  skylines, local light pool, spill decals) shipped 2026-07-18,
  commit `20a319a`.
- **Recommended setup**: model **Sonnet 5**, effort **high** —
  polyline/instancing plumbing. Flag it if the running model differs.
- **Budget**: code + checks, **one shot** (tower corridor read),
  grep-first.
- **Then**: rewrite this briefing for W6 (energy jobs + oversize-load
  rule + track close: ROADMAP fold-in, gotchas graduated, briefing
  deleted — Fable 5, high, no shots).

Gotchas carried over: announcer + log machinery is DONE — W5 only
calls `energy.register(...)`/appends `HEROES` entries (id is the save
key, never rename). **Light pool is DONE** (sky.js `POOL_KINDS`,
`registerGlowAnchor({x,z,y,kind})`): W5 hero plants register
`kind: 'plant'` (cool flood, already in the table) — never resize the
pool, count is constant forever (shader-recompile law). `lines345` is
945 stitched corridors — instance towers by arc-length (trains
`arcInit` idiom); substations: 735 baked ≥345 kV majors, thin before
drawing (the announcer already covers named ones only). A new radio
chatter kind needs THREE rows (`POOLS` + `VOICES` + `ROLL_OK`) or it
never speaks. Hero markers need road clearance ≥8 (the sweep in
`energy.mjs` enforces it — probe offline against `data/highways.json`
before hardcoding coords, the W4 method). Any footprint radius at a
real coordinate clamps to `nearestAnyRoad`/`nearestRiver` clearance
with a skip floor (GOTCHAS law).

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

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
