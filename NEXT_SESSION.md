# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 4 of 6 — crops and ranches. Extend the
  ag bake to band counties (`neighbor-counties.json` already joins), teach
  `agAt` the band, then swap the `inTexas` gates in world.js placement
  (flora, crop decals, pivots, `farmsteadAt`, `chapelAt` + cemeteries) for
  the in-band land test with band legality (`nearestBandRoad`,
  `shoulderClear`, existing standoffs). W3 (per-neighbor band tints) shipped
  2026-07-16. **Prereq before any coding**: USDA 2022 census extracts for
  LA/AR/OK/NM in `~/claude-area/devel/tx-inputs/` — ask Bruno to run or
  approve the fetch first; if unavailable, stop and re-plan the session.
- **Recommended setup**: model **Sonnet 5**, effort **high** — structural
  table-plumbing wave (bake pipeline + gate swaps), per the spec's per-wave
  recommendation. Flag it if the running model differs.
- **Budget**: code + checks; grep-first; ≤2 full verify runs; screenshots
  only via the Copilot workflow (GOTCHAS.md → Verification — stage with
  `tools/stage-shot.mjs`, never load images; final visual batch to Bruno
  only if placement visuals change enough to warrant it).
- **Then**: rewrite this block for W5 (wildlife — band region boxes, species
  rows, census herds at band farmsteads; W4's ag data is its prereq).

Gotchas carried over:
- `BAND_PARITY_SPEC.md` is the track spec — open calls already resolved
  (tiers, tally, airports, rails deferred); don't relitigate them.
- **The law of Texas still stands for W4's gate swaps**: GOTCHAS.md says
  ag/chapel/farmstead/brand generators stay `inTexas`-gated — W4 is the
  sanctioned amendment (spec-resolved). Update that gotcha when the gates
  swap, and keep Mexico out (band land test only, never blanket `!inTexas`).
- W3 shipped `neighborStateAt` (geo.js, full-state rings, lazy bbox) +
  `bandTint` (world.js `BAND_TINT`, k≤0.5; Mexico keeps the 0.75 `cOut`
  wash). Both on `__game`; `band.mjs` asserts the 4 tints distinct, Mexico/
  Texas null, and the W3 tour spots classifying as their own state.
- Fog washes distant ground tints toward tan from 250u out (`sky.js` Fog
  250→1400) — any future band tint judgment shots must stage low (agl ~18,
  ground inside the fog-free radius). The "hard midground seam" in low
  shots is the global fog line (Texas control shot proves it), and grazing
  angles bunch county lines + roads into fake "zigzag defects". Sharper
  re-query beats trusting the first read.
- `nearestBandRoad`'s far-end grid gap (BACKLOG item) still stands — W4's
  band legality checks should use it only within its documented limits, or
  interpolate `h.pts` directly the way traffic does.
- Any further band-road rebake shifts geometry: re-verify the shoulder suite
  (crossing monuments + control signs both read band endpoints) + `band.mjs`
  guards + `traffic.mjs`'s band-road check.

---

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Key facts:
- **Repo is public and GitHub Pages is live** — pushes deploy to
  https://ghostsysoutnull.github.io/lone-star-roam/. Full verify before
  every push is mandatory.
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
