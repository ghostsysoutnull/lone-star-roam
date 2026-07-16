# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 1 of 6 — rework
  `tools/build-band-roads.mjs` to a tier fetch (`motorway|trunk|primary`,
  clipped to the 402u strip), rebake, report town coverage, connectivity
  check. Spec session (track opened, all calls resolved) shipped 2026-07-16.
- **Recommended setup**: model **Sonnet 5**, effort **high** — data-pipeline
  wave, table plumbing, no visual judgment. Flag it if the running model
  differs.
- **Budget**: code + checks + Overpass fetches, no shots, grep-first; ≤2
  full verify runs.
- **Then**: rewrite this block for W2 (edge signs + band traffic + visit
  tally).

Gotchas carried over:
- `BAND_PARITY_SPEC.md` is the track spec — all open calls already resolved
  (tiers, tally, airports, rails deferred); don't relitigate them.
- Overpass: POST 406s from here — GET only; bboxes/endpoints in
  `tools/build-band-roads.mjs`'s header (mail.ru mirror for la/ar/ok,
  overpass-api.de for nm). The tier fetch replaces the ref regex — the
  BACKLOG concurrency defect dies with it, don't port the ref matching.
- Any rebake shifts band geometry: re-verify the shoulder suite (crossing
  monuments read band endpoints) + `band.mjs` guards. Argument order of the
  4 state files is load-bearing (greedy chaining).
- W1 must keep per-way `ref` where OSM tags it — W2's signs and shields
  read it.
- Coverage target is measured, not promised: report how many of the 177
  band places get a road within 25u (was 30); only escalate to Bruno with
  numbers if primary leaves big gaps.

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
