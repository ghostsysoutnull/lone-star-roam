# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 3 of 6 — the ground. Retune
  `world.js:220`'s 0.75 out-of-state tan lerp; per-neighbor regional tints
  (LA swamp, AR pine, OK plains, NM desert) so the real DEM relief and
  `cPine` read again. Closes the BACKLOG "band is always desert" item. W2
  (control-city signs at every crossing, traffic on band roads, `bandTowns`
  tally) shipped 2026-07-16.
- **Recommended setup**: model **Fable 5**, effort **high** — visual/register
  wave, screenshots ON, Bruno's eye required for the tint judgment. Flag it
  if the running model differs.
- **Budget**: code + one staged screenshot per neighbor tint (4 judged by
  Bruno before commit, per the visual-judgments-need-eyes-early rule; stage
  via `tools/stage-shot.mjs`, pre-check via Copilot CLI — GOTCHAS.md →
  Verification — Claude never loads the images) + checks; grep-first;
  ≤2 full verify runs.
- **Then**: rewrite this block for W4 (crops and ranches — prereq: USDA
  extracts in tx-inputs, ask Bruno to run/approve the fetch before coding).

Gotchas carried over:
- `BAND_PARITY_SPEC.md` is the track spec — open calls already resolved
  (tiers, tally, airports, rails deferred); don't relitigate them.
- W2c (`bandTowns` tally) turned out to be a no-op: `save.passport.towns`
  already tracks band-city visits (shipped a day earlier in Shoulder &
  Shelf) — same source, detection, toast, HUD counter the spec bullet
  asked for. Corrected in `BAND_PARITY_SPEC.md`'s resolved-calls section;
  don't build a second key for the same visits.
- W2 gave every crossing a control-city distance sign
  (`buildGenericControlSigns` in shoulder.js, `CONTROL_CITIES` table of real
  lat/lon per state) and put traffic on `GEO.bandHighways`
  (`TrafficSystem.polys` now concats `GEO.highways`+`GEO.bandHighways`;
  `mixAt` also consults a new `nearestBandCity` so real band towns get
  city-appropriate traffic instead of always-rural).
- **Discovered, not fixed**: `nearestBandRoad`'s grid indexes long segments
  by midpoint cell only, missing queries near a segment's far end (488u US
  270 segment) — doesn't affect traffic (interpolates `h.pts` directly) or
  W3. Logged in `BACKLOG.md` item 4.
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
