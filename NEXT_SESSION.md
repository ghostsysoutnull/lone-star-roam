# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 6 of 6 — band fields + track close.
  2–4 real band airports (OSM runway geometry, true-north headings,
  tier-3 kit), traffic + charter reach, `airportClear` coverage for band
  placement. Then the close: fold the whole track into one `ROADMAP.md`
  entry, graduate surviving gotchas into `GOTCHAS.md`, sweep
  `BACKLOG.md`/satellite docs, delete this briefing block. W5 (wildlife)
  shipped 2026-07-17.
- **Recommended setup**: model **Sonnet 5**, effort **high** — per the
  spec's per-wave recommendation. Flag it if the running model differs.
- **Budget**: code + checks + track close; grep-first; ≤2 full verify runs;
  screenshots only via the Copilot workflow (GOTCHAS.md → Verification —
  stage with `tools/stage-shot.mjs`, never load images).
- **Then**: this is the last wave — no further rewrite. Delete this
  briefing block entirely once the close is done; the greeting disappears
  with it until the next spec writes a new one.

Gotchas carried over:
- `BAND_PARITY_SPEC.md` is the track spec — open calls already resolved
  (2–4 real fields, Roswell/Lawton/Texarkana/Lake Charles class, rails
  deferred); don't relitigate them.
- **W5 shipped**: `animals.js` region tables now flavor band land by
  `neighborStateAt` (LA swamp / AR pine / OK plains / NM desert — mirrors
  W3's ground tints), census herds spawn at band farmsteads via the same
  `agAt || bandAgAt` fallback world.js's `farmsteadAt`/`feedlotAt` already
  use, and the wander/flee clamp + road-avoidance are `inTexasOrBand`/
  `nearestAnyRoad` throughout. `ranchHQAt`'s compound-herd gate stays
  `inTexas`-only on purpose (named real Texas ranches) — don't widen it
  for W6 either.
- `feedlotAt` is band-capable but real census data never crosses its
  30 head/km² gate in the band (OK Texas County tops out ~23.6) — still
  dormant there, unrelated to this wave.
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
