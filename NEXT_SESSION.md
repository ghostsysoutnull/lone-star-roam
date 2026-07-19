# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Performance (`PERFORMANCE_SPEC.md`), wave 4 of 4 —
  real-hardware re-record + track close. Wave 3 (draw audit + the fog-wall
  gate fix: draws roughly halved everywhere, Houston storm 2041 → 934
  headless) shipped 2026-07-18. Read the spec's W3 section (Findings 6–8)
  before anything.
- **Deliverables**: (1) Bruno re-records the baseline table on his machine
  (the spec's protocol: teleport → settle 3 s → Reset max → 15–20 s moving
  play → 📋 Record, at the three W1 tour spots) to confirm the render-ms
  drop on real hardware; findings go into the spec next to the W1 table.
  (2) Track close: fold Performance into `ROADMAP.md`, sweep satellite docs
  (BACKLOG header, anything naming the track), graduate surviving gotchas
  into `GOTCHAS.md`, delete this briefing block.
- **Recommended setup**: model **Sonnet 5**, effort **high** — pure
  execution of settled design (record protocol, doc folds); no new surface,
  no feel calls. Flag it if the running model differs.
- **Budget**: doc updates + the recorded numbers, no shots, no new code
  unless the re-record exposes a regression.
- **Then**: this block is deleted; the track is closed.

Gotchas carried over:
- The harness fake clock zeroes lap ms — count-based asserts only (see
  `tools/checks/perf.mjs` header).
- **Teleport probes run hot** (Finding 8): a probe ~0.6 s after teleport
  reads ~+300 draw calls (the prior spot's chunks still in the camera
  wedge). The W2 caps (now 1600 draws) are pinned against that harness
  context — never re-tune them from settled numbers, and say which context
  any new number came from.
- **FogGate rules** (sky.js): `fog: false` materials are auto-exempt (they
  are designed to beat fog); interaction logic must stay distance-based and
  never read `.visible`; a rebuilt root (gameplay save-slot switch) needs a
  fresh gate.
- The band suite's frozen chunk baseline now counts flora too (W3 tagged
  every scenery prop with `userData.kind` for the audit) — a new prop kind
  or tag change re-pins those three chunks.

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
