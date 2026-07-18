# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Performance (`PERFORMANCE_SPEC.md`), wave 3 of ~3 — the
  draw-call audit Finding 2 calls for, not a fix yet. Wave 2 (count-based
  guardrails: 2500 draws / 2.5M tris caps via `renderProbe()` at the 3
  baseline tour spots, perf-cost protocol line) shipped 2026-07-18.
- **The question to answer**: why does the empty desert (I-10 west, 2037
  draws) submit *more* draw calls than downtown Houston in a storm (1461)?
  Triangles are flat (~1.6–1.7 M) everywhere, so it's a call-count problem,
  not a geometry-size problem. Prime suspect (unproven): per-chunk scenery
  props built as individual meshes rather than merged/instanced — open land
  runs more chunks at full density; cities suppress scenery spawn. Read
  `PERFORMANCE_SPEC.md` Findings 1–5 before planning; do not assume the
  suspect is correct — the audit's job is to confirm or redirect it.
- **Deliverable is a diagnosis, not a rewrite**: break down `renderProbe()`
  draw calls by source (scenery chunk contents vs. cities vs. traffic vs.
  static world meshes) so the audit has numbers, not a guess. If the data
  points at one clear, low-risk fix, land it same session with a measured
  before/after; if not, scope a W4 fix wave instead — don't merge/refactor
  ScenerySystem on suspicion alone.
- **Recommended setup**: model **Fable 5**, effort **high** — touches
  ScenerySystem's chunking, one of the "performance patterns to preserve" in
  CLAUDE.md; architectural risk grades Fable even though the audit itself is
  mostly instrumentation. Flag it if the running model differs.
- **Budget**: audit instrumentation + findings written into
  `PERFORMANCE_SPEC.md`, code only if the data clearly justifies a same-
  session fix, no shots, grep-first.
- **Then**: if the audit lands a fix, rewrite this briefing for a W4
  before/after verification pass; if it finds nothing worth doing, close the
  track (`ROADMAP.md` fold, satellite-doc sweep, this block deleted).

Gotchas carried over:
- The harness fake clock (Playwright) fakes `performance.now` — headless lap
  ms are all ~0. Any new audit checks must assert counts (draw calls, tris,
  per-source breakdowns) or come from the recorded real-hardware baseline;
  never assert nonzero ms headless (see `tools/checks/perf.mjs` header).
- `renderProbe()` caps (2500 draws / 2.5M tris) are a coarse regression net,
  not a diagnosis — they won't catch or explain the desert-vs-downtown
  inversion; that's this wave's job.

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
