# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 2 of 6 — life on the roads. (a)
  Control-city distance signs at every outward stub end (`deriveCrossings`
  idiom over W1's endpoint set — 51 crossing sites, real refs), reusing
  shoulder.js's sign meshes. (b) Traffic on band roads — extend
  TrafficSystem's candidate polylines to `GEO.bandHighways` when the spawn
  ring reaches the band. (c) the `bandTowns` visit tally (save key + HUD
  counter + toast). W1 (tier-fetch road network) shipped 2026-07-16.
- **Recommended setup**: model **Sonnet 5**, effort **high** — same shape as
  W1 (data-driven system extension, table plumbing over an existing idiom).
  Flag it if the running model differs.
- **Budget**: code + checks, no shots (signs/traffic are data-driven, not a
  visual-judgment wave), grep-first; ≤2 full verify runs.
- **Then**: rewrite this block for W3 (the ground — regional tints, screenshots
  ON, Bruno's eye required).

Gotchas carried over:
- `BAND_PARITY_SPEC.md` is the track spec — open calls already resolved
  (tiers, tally, airports, rails deferred); don't relitigate them.
- W1's road set: 596 polylines, per-way `ref` preserved — signs/shields read
  it directly off `GEO.bandHighways`.
- `deriveCrossings()` (src/shoulder.js) now dedupes candidates by **matching
  ref**, not bare proximity — a ref-blind 60u merge silently dropped I-30's
  monument once I-49 (a real, distinct crossing ~52u away near Texarkana)
  joined the candidate set. W2's signs read the same 51-site list; don't
  revert that merge condition.
- Coverage: 140/177 band places land within 25u of a band road (LA 37/39,
  AR 14/15, OK 73/104, NM 16/19). Not escalated — no single state left a big
  gap. The 37 uncovered towns are informational only, not a W2 blocker.
- Any further band-road rebake shifts geometry: re-verify the shoulder suite
  (crossing monuments read band endpoints) + `band.mjs` guards (density
  ratio + cross-bbox-duplicate + coverage-floor checks all live there now).

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
