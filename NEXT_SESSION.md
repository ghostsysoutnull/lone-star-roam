# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Energy (`ENERGY_SPEC.md`), wave 4 of 6 — refinery
  kit at all 22 real refineries + 4 hero skylines (Ship Channel,
  Baytown, Port Arthur, Corpus) with extra dressing, night glow via the
  new **local light pool** (sky.js-owned, fixed-size PointLight pool —
  see gotchas), **spill decals** under lit clusters (rigs included —
  the W2-rebased platforms + Far Rig register glow anchors this wave
  too), plaques at the hero skylines, and W4 log sites. Wave 3 (real
  wind farms — instanced turbines + `ATMOS.wind` blade spin, solar
  panel fields, Roscoe/Horse Hollow/Papalote Creek log heroes)
  shipped 2026-07-18, commit `5f560fe`.
- **Recommended setup**: model **Fable 5**, effort **high** — hero
  composition + plaque copy. Flag it if the running model differs.
- **Budget**: code + checks, **two shots** (Ship Channel night, rig
  water glow), grep-first.
- **Then**: rewrite this briefing for W5 (345 kV tower corridors +
  major substations + hero plant landmarks + ERCOT radio flavor,
  Sonnet 5, high — one shot: tower corridor read).

Gotchas carried over: the announcer + log machinery is DONE — W4 only
calls `energy.register(...)`/adds hero table entries; no new toast
code. **Local light pool** (Decisions + Architecture in the spec): a
fixed-size pool (~6 PointLights) built once at boot — count is
constant forever, since adding/removing lights recompiles every lit
shader; only intensity/position change per frame. Systems register
**glow anchors** `{x, z, y, kind}` (refinery flare stacks, rig decks,
hero plant floods in W5); sky.js frame-throttles nearest-anchor
assignment each night, 0-intensity by day. Colors by kind: sodium
orange (refinery), flicker orange (flare), warm white (rig deck), cool
flood (plant). `scenery.flareMat` is the shared night-gate pattern for
well flares — refinery flares should reuse the pattern (or the
material) rather than fork a new gate. **Legibility lesson from W3**:
a hairline/realistic taper on a tall round or thin structure reads as
"scattered noise" or "toothpicks" at normal play distance (staged-shot
finding, turbine geometry) — bulk proportions past real-world scale
for silhouette read, the same call the poly-bar rule already makes for
segment count; refinery towers/pipe racks/tanks should err chunky, not
literal.

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
