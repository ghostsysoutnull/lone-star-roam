# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Railroads Realism (`RAILS_SPEC.md`), wave 1 of 3 —
  operator liveries + commuter passenger sets + rails on both maps +
  `trains.force` hook. The spec session shipped 2026-07-18.
- **Recommended setup**: model **Fable 5**, effort **high** — the
  deliverable is a look (livery palette, regraded from the umbrella's
  Sonnet estimate per the Energy-W3 lesson). Flag it if the running model
  differs.
- **Budget**: code + checks (`tools/checks/rails.mjs`, new) + **one**
  staged livery-lineup shot (Copilot + Bruno gate before commit),
  grep-first. Perf delta: +1 InstancedMesh (coach); no cap retune.
- **Then**: rewrite this block for W2 (the border show — spur bake +
  seeded crossings + named trains, Fable 5 high).

Gotchas carried over:
- Design is settled in `RAILS_SPEC.md` W1 — livery table hexes, commuter
  set, `mapStats.rails` assertion, `force(x,z)` contract. Execute, don't
  re-decide; the shot may retune hexes.
- The 🚂 rail placard already ships (`nearestRail`, hud.js) — W1 adds no
  HUD placard work, only the map layer.
- `lights.mjs:144` must switch from `until(trains>0, 45000)` to the new
  force hook — that's a W1 deliverable, not a rider.

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
