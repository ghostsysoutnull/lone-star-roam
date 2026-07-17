# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Band Parity, wave 2 of 6 — life on the roads. (a)
  Control-city distance signs at every outward stub end (`deriveCrossings`
  idiom over W1's endpoint set — 90 crossing sites, real refs), reusing
  shoulder.js's sign meshes. (b) Traffic on band roads — extend
  TrafficSystem's candidate polylines to `GEO.bandHighways` when the spawn
  ring reaches the band. (c) the `bandTowns` visit tally (save key + HUD
  counter + toast). W1 (tier-fetch network + OK, then LA+NM, secondary-tier
  top-ups) shipped 2026-07-16.
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
- W1's road set: 1,269 polylines, per-way `ref` preserved — signs/shields
  read it directly off `GEO.bandHighways`. LA/NM/OK carry a `secondary` OSM
  tier folded into `type: 'primary'` (Texas has no rendered secondary tier);
  AR is still primary/trunk/motorway-only (already 15/15 covered, no top-up
  needed).
- `deriveCrossings()` (src/shoulder.js) now has three candidacy filters
  beyond the border-distance test, all load-bearing for W2's signs:
  (1) skip a chain that's **wholly inside Texas** (an FM/county road can hug
  a dead-straight state-line survey border for miles without ever crossing
  it — FM 769/FM 1218/County Road 251 tracking the NM line were the cases
  that surfaced this); (2) skip an endpoint whose **distance-to-border
  barely grows** over 30u of outward travel (parallel-to-border roads and
  too-short 2-point stubs both fail this the same way — a real crossing
  grows 9-30u, every parallel-runner measured under 5; this replaced an
  earlier length-only cutoff that FM 1218 at 113u sailed past); (3) merge
  candidates into one site only on a **matching ref**, not bare 60u
  proximity (a ref-blind merge dropped I-30's own monument once I-49, a
  real crossing ~52u away near Texarkana, joined the candidate set). Also:
  `isMexicoSeam()` guards the inTx/SEAM_MARGIN branch only — border.json's
  polygon test misreads a point 17cm from the line at the El Paso/Juárez
  kink as "inside Texas"; DON'T call it (or any `inNeighborState`-based
  check) unconditionally per-point in the *build* script — that turned an
  8-minute bake into an 18+-minute one once measured against it. Don't
  relax any of these without re-deriving the site count.
- Coverage: 169/177 band places land within 25u of a band road (LA 39/39,
  AR 15/15, OK 97/104, NM 18/19), up from 140/177 on the primary-tier-only
  bake — Bruno asked for full connectivity; the OK, then LA+NM,
  secondary-tier top-ups closed most of the gap. Remaining 8 uncovered:
  Ardmore OK (near-miss) + Logan NM + 6 small OK hamlets, all past even the
  secondary network. Not escalated further — these would need OK's tertiary
  tier (much denser, diminishing returns for towns of pop. 16-725); ask
  Bruno before going there rather than assuming W2 should chase the rest.
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
