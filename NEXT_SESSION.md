# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

**This session: the Railroads spec session** — first track of the 2026-H2
program (`VISION_2026H2.md`, build order rails → water vehicles →
sea-industry → Mexico shoulder, decided 2026-07-18). Read
`VISION_RAILROADS.md` + the umbrella, then write `RAILS_SPEC.md` (goals,
wave split, per-wave design-settled sections, model/effort per the
risk-based grading rule) and the first `## Session briefing` block here.
Specs are always **Fable 5, effort high**. Open calls to resolve in the
spec: HUD form for rail identity, crossing schedule (seeded `windFrom`
idiom vs probability), whether "band railroads" folds in, livery palette
shot. Backlog riders to sweep: shields for railways, lights-suite
`until(trains>0)` forcing hook. Previous track: Performance
(`PERFORMANCE_SPEC.md`, 4 waves) shipped 2026-07-18, folded into
`ROADMAP.md`.

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
