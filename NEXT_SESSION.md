# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Performance (`PERFORMANCE_SPEC.md`), wave 2 of ~3 —
  verify guardrails + budgets from the W1 baseline. Wave 1 (instrumentation:
  perf laps, Perf tab, tour spots, perf suite) shipped 2026-07-18.
- **Baseline recorded 2026-07-18** (two rounds, round 2 canonical) — read the
  spec's Baseline + Findings before planning. Headline: the frame is the
  render call (10.8–12.7 of 12.4–14.2 ms; all game systems together 1.5–2 ms),
  draw cost is location-independent with the desert highest (2037 draws >
  downtown 1461 — suspect: per-chunk scenery props as individual meshes),
  normal-play hitches are mild (worst 53 ms; 120 ms+ only on teleport). W2
  guardrails must be count-based (draw calls/triangles via `renderProbe`,
  caps ≈ 2.5 k / 2.5 M), never ms-based.
- **Recommended setup**: model **Sonnet 5**, effort **high** — executing
  settled design (threshold plumbing in `tools/checks/perf.mjs`, CLAUDE.md
  protocol line). Flag it if the running model differs.
- **Budget**: code + checks, no shots, grep-first.
- **Then**: W3 scope (targeted optimizations) is decided by the data; if the
  data shows no work worth doing, close the track instead.

Gotchas carried over:
- The harness fake clock (Playwright) fakes `performance.now` — headless lap
  ms are all ~0. Guardrail thresholds must be count-based (draw calls, tris,
  tick counts) or come from the recorded real-hardware baseline; never assert
  nonzero ms headless (see `tools/checks/perf.mjs` header).

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
