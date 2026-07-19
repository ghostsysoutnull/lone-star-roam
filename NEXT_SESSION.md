# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

## Session briefing
- **This session**: Railroads Realism (`RAILS_SPEC.md`), wave 2 of 3 —
  the border show: south-of-river spur bake (Overpass GET), seeded
  `railxing:` crossing schedules at Laredo + Eagle Pass, named trains
  (Tex-Mex Interchange / Eagle Pass Manifest / the Z double-stack), rail
  bridges. W1 (liveries + commuter sets + map rails + force hook)
  shipped 2026-07-18.
- **Recommended setup**: model **Fable 5**, effort **high** — new
  visible surface + content wave. Flag it if the running model differs.
- **Budget**: code + checks (extend `tools/checks/rails.mjs`) + the spur
  bake + **one** staged crossing shot (Copilot + Bruno gate), grep-first.
  Perf delta: +1 InstancedMesh (well car) + two small merged bridges.
- **Then**: rewrite this block for W3 (band railroads, Sonnet 5 high —
  bake + ribbons + spawn extension; design settled in the spec).

Gotchas carried over:
- **W2's bake session must also fix commuter fragmentation** (Bruno,
  2026-07-18): the commuter corridors are shredded (TRE 17 pieces,
  longest 164 u) because `build-rails.mjs` chains only exact-key endpoint
  matches within (operator,name) identity groups. Join by endpoint
  proximity while the bake is open for the spurs; gate on reproducing the
  shipped `rails.json` unfixed first (prefer-true-source rule). W1 ships
  commuter sets on the fragments meanwhile.
- Spur lines must be excluded from random spawn (scheduled trains only)
  — `RAILS_SPEC.md` W2 design-settled section has the contract + seed
  strings (`railxing:<site>:<day>`, forever once shipped).
- DART is dropped deliberately (light rail — real-or-absent), asserted
  by `rails.mjs`; don't "fix" it back in W2.
- Tour/shot staging: game heading convention — 90° faces west, 270°
  east; forced trains keep rolling at 16 u/s on the real loop, so staged
  shots must pin `tr.s` via interval before shooting.

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
