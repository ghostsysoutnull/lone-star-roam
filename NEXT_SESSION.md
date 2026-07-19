# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Railroads Realism (`RAILS_SPEC.md`), wave 3 of 3 —
  band railroads: bake `railway=rail` + `usage=main` for the 4
  neighbor-state strips (band-roads precedent) → `data/band-rails.json`,
  load + append to the rail index with `band: true`, band ribbons + map
  strokes, band rails join the train spawn list. Closes the deferred
  Band Parity rider. W2 (border show: spurs, seeded `railxing:`
  schedules, named trains, bridges, junction hop) shipped 2026-07-19.
- **Recommended setup**: model **Sonnet 5**, effort **high** — pure
  execution of settled design (bake + ribbons + spawn extension; the
  spec's W3 design-settled section has the contracts). Flag it if the
  running model differs.
- **Budget**: code + checks, **no shots**, grep-first. Perf delta: a few
  merged band ribbons, no cap retune expected.
- **Then**: this is the last wave — **track close**: fold the track into
  one `ROADMAP.md` entry, graduate surviving gotchas into `GOTCHAS.md`
  (spur-spawn exclusion, `railxing:` seed streams forever, livery-table
  normalization, junction-hop contracts), sweep `BACKLOG.md`
  (shields-for-railways / band-railroads / lights-forcing riders close),
  update satellite docs, and delete this briefing block.

Gotchas carried over:
- The dormant random-livery fallback (`LOCO_COLORS`) wakes with band
  rails — band operators come from OSM tags; unknown ones fall back.
  The rails.mjs header comment documents this on purpose.
- Rail polyline counts are post-defrag now (171 for Texas): the data
  unit test asserts `> 150` and `rails.mjs` `> 150 && === mapStats`;
  band rails go in `GEO.bandRails`/own file, NOT `GEO.rails` — check
  how band-roads kept `GEO.highways` clean (rose-scatter determinism)
  and mirror it, then decide whether `mapStats.rails` counts both.
- Named-train laws shipped in W2 (don't regress in the spawn
  extension): spur rails never random-spawn; `hopAt` needs ≥ train
  length + 20 of onward run, 15 u radius, tangent cone; an open
  schedule window never replaces a live named train.
- DART stays real-or-absent (light rail), asserted by `rails.mjs`.
- Tour staging: heading 0 = north, PI/2 faces west; forced trains roll
  at 16 u/s on the real loop — staged shots must pin `tr.s` (none
  planned for W3).

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
