# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 5 of 6 — wildlife. Band region boxes
  in the animals/world tables (swamp / pine / plains / desert), species
  rows, census herds homed at band farmsteads, wander/flee clamp widened
  from `inTexas` to the band land test (`inTexasOrBand`, Mexico stays out).
  W4 (crops and ranches) shipped 2026-07-17.
- **Recommended setup**: model **Sonnet 5**, effort **high** — per the
  spec's per-wave recommendation. Flag it if the running model differs.
- **Budget**: code + checks; grep-first; ≤2 full verify runs; screenshots
  only via the Copilot workflow (GOTCHAS.md → Verification — stage with
  `tools/stage-shot.mjs`, never load images).
- **Then**: rewrite this block for W6 (band fields + track close — 2–4 real
  band airports, traffic + charter reach, `airportClear` coverage; W6 also
  folds the whole track into one `ROADMAP.md` entry, graduates surviving
  gotchas, sweeps `BACKLOG.md`/satellite docs, and deletes this block).

Gotchas carried over:
- `BAND_PARITY_SPEC.md` is the track spec — open calls already resolved
  (tiers, tally, airports, rails deferred); don't relitigate them.
- **W4 shipped the amended "law of Texas"** (GOTCHAS.md → "The law of
  Texas"): crop decals/pivots/`farmsteadAt`/`feedlotAt`/`chapelAt`+
  cemeteries/flora are `inTexasOrBand`-gated; `GEO.bandAg` (own bake,
  `tools/build-band-ag.mjs`, 249 counties) never merges into `GEO.ag`/the
  254 tally; `nearestAnyRoad`/`cityClear` (geo.js/cities.js) are the
  band-aware road/city standoff helpers — reuse them, don't re-derive.
  `feedlotAt` is band-capable but real census data never crosses its
  30 head/km² gate in the band (OK Texas County tops out ~23.6) — expect
  it to stay dormant there unless W5's herd work changes that read.
- **`animals.js` line ~382 deliberately guards `farmsteadAt` herds on
  `inTexas`** (not `inTexasOrBand`) — added in W4 specifically to punt
  band herds to this wave (calling the TX-only `agAt` on a band farmstead
  crashed on a null `.cattle` read). W5 removes that guard and gives band
  farmsteads their own `bandAgAt`-driven species mix instead of just
  widening the gate blindly.
- Region-box refactor (`inPermian`/`inPlains`/etc. in world.js, similar
  boxes in animals.js) was explicitly out of scope through W4 — the raw
  coordinate boxes already degrade sensibly onto adjacent band land (LA/AR
  band falls into the piney-woods bucket, NM into desert, OK mostly into
  plains) without edits, but W5 is where a real per-neighbor-state
  swamp/pine/plains/desert table is due.
- Any further band-road rebake shifts geometry: re-verify the shoulder
  suite (crossing monuments + control signs both read band endpoints) +
  `band.mjs` guards + `traffic.mjs`'s band-road check.

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
